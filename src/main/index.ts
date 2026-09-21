import { electronApp, is } from '@electron-toolkit/utils'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from 'electron'
import Store from 'electron-store'
import { autoUpdater } from 'electron-updater'
import { randomUUID } from 'node:crypto'
import { stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import icon from '../../resources/icon.png?asset'
import { updateDiagnosticsMenu } from './lib/diagnostics-menu'
import { createAppUpdates } from './lib/app-updates'
import { createHelpWindowController, helpJumpListTasks, type HelpSurface } from './lib/help-window'
import {
  buildAppMenuTemplate,
  buildEditableContextMenuTemplate,
  DIAGNOSTICS_MENU_ID
} from './lib/app-menu'
import { capture, initAnalytics, shutdownAnalytics } from './lib/analytics'
import { oneDriveStatus } from './lib/onedrive'
import {
  createLeague,
  createSeason,
  createSeasonRoster,
  importFiles,
  prepareRootSelection,
  renameLeague,
  repairReservedLocations,
  syncSeasonWithTemplates,
  zipArchivedSeasons
} from './lib/operations'
import { isMissing, toUserFacing, UserFacingError } from './lib/fs-errors'
import { registerInvokeHandler, type InvokeListener, type IpcErrorReporter } from './lib/ipc-handle'
import type { AppCommand } from '../shared/app-command'
import { helpRequested, helpTargetToSearch, type HelpTarget } from '../shared/help'
import { membersFileSchema } from '../shared/members'
import { membersCsv } from '../shared/members-csv'
import type { ImportFilesResult, InvokeName } from '../shared/ipc'
import type { SeasonSyncRequest } from '../shared/season-create'
import {
  assertAbsolutePath,
  assertInsideRoot,
  planTrash,
  resolveImportDestination,
  resolveLiveSeasonRoot
} from './lib/paths'
import { pruneRecents, seedRecents, updateRecents, type RootProbe } from './lib/recents'
import {
  buildMembersSnapshot,
  deleteMember,
  enableMembers,
  markCardsIssued,
  membersFilePath,
  readMasterForWrite,
  mergeMembers,
  renumberDuplicates,
  saveMember,
  saveSeason
} from './lib/members'
import {
  addPlayersFromExport,
  planPlayersImport,
  planSync,
  previewImport,
  rememberMapping,
  syncMbd,
  type MappingMemory
} from './lib/imports'
import { readAppJson } from './lib/app-json'
import { clearCardSheets, generateCardSheet } from './lib/cards'
import { renderPdfWithElectron } from './lib/pdf'
import { listDirEntries, scanLeaguesRoot } from './lib/scanner'
import { refreshSignInSheet, signInSheetPath, signInSheetState } from './lib/sign-in-sheet'
import { executeTrashPlan } from './lib/trash'
import { createRootWatcher, type RootWatcher } from './lib/watcher'
import * as Sentry from '@sentry/electron/main'

interface Settings {
  rootPath?: string
  /** Column mappings from earlier bowler exports, per location and header layout. */
  importMappings?: MappingMemory[]
  /** Most-recently-used first; the last activated root is at index 0. */
  recentRoots?: string[]
  posthogKey?: string
  sentryDSN?: string
  machineId?: string
}

const store = new Store<Settings>({ name: 'settings' })

function machineId(): string {
  let id = store.get('machineId')
  if (!id) {
    id = randomUUID()
    store.set('machineId', id)
  }
  return id
}

/** Runtime env var beats the build-time MAIN_VITE_ value beats the stored setting. */
function posthogKey(): string | undefined {
  return (
    process.env.LEAGUES_POSTHOG_KEY ||
    import.meta.env.MAIN_VITE_POSTHOG_KEY ||
    store.get('posthogKey') ||
    undefined
  )
}

function sentryDSN(): string | undefined {
  return (
    process.env.LEAGUES_SENTRY_DSN ||
    import.meta.env.MAIN_VITE_SENTRY_DSN ||
    store.get('sentryDSN') ||
    undefined
  )
}

// A second launch, including the Windows jump list's Help task, hands its
// arguments to the running app and exits instead of opening another window.
const primaryInstance = app.requestSingleInstanceLock()
if (!primaryInstance) app.quit()

// As early as possible so Sentry's error hooks and the IPC bridge for the
// renderer SDK are in place before any window loads.
initAnalytics(posthogKey(), sentryDSN(), machineId())

function bundledTemplatesDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'templates')
    : join(app.getAppPath(), 'resources', 'templates')
}

let mainWindow: BrowserWindow | null = null
let rootWatcher: RootWatcher | null = null
const appUpdates = createAppUpdates(
  app.getVersion(),
  (status) => mainWindow?.webContents.send('app:update-changed', status),
  (error) => console.warn('Could not update the app:', error)
)
const helpWindows = createHelpWindowController((initial) => createHelpWindow(initial))

function stopWatching(): void {
  void rootWatcher?.close()
  rootWatcher = null
}

function watchRoot(root: string): void {
  stopWatching()
  rootWatcher = createRootWatcher(root, {
    onChange: () => mainWindow?.webContents.send('tree:changed'),
    onError: (error, mode) => {
      console.error(error)
      Sentry.captureException(error, { tags: { watch_mode: mode } })
    },
    onFallback: (message, data) => {
      console.warn(message, { code: data.code })
      Sentry.addBreadcrumb({ category: 'watcher', level: 'warning', message, data })
    }
  })
}

/**
 * LEAGUES_ROOT overrides the stored root at launch — used for dev/test
 * fixtures. Choosing or switching a location clears it so the switch sticks.
 */
let envRootOverride = process.env.LEAGUES_ROOT

function currentRoot(): string | undefined {
  return envRootOverride ?? store.get('rootPath')
}

function requireRoot(): string {
  const root = currentRoot()
  if (!root) throw new Error('No leagues folder selected')
  return root
}

function storedRecents(): string[] {
  return seedRecents(store.get('recentRoots'), store.get('rootPath'))
}

/**
 * Make `root` the current location: persist it, record it as recent, watch it.
 * Roots only ever arrive here already `resolve()`d, so the exact-string dedupe
 * in `updateRecents` holds without case-folding.
 */
function activateRoot(root: string): void {
  envRootOverride = undefined
  store.set({ rootPath: root, recentRoots: updateRecents(storedRecents(), root) })
  watchRoot(root)
}

async function probeRoot(path: string): Promise<RootProbe> {
  try {
    return (await stat(path)).isDirectory() ? 'dir' : 'missing'
  } catch (err) {
    return isMissing(err) ? 'missing' : 'unavailable'
  }
}

/** Recent roots minus any that are definitely gone; the stored list is pruned to match. */
async function recentRoots(): Promise<string[]> {
  const stored = storedRecents()
  const alive = await pruneRecents(stored, probeRoot)
  if (alive.length !== stored.length) store.set('recentRoots', alive)
  return alive
}

const reportIpcError: IpcErrorReporter = (error, channel) =>
  Sentry.captureException(error, { tags: { ipc_channel: channel } })

function register<Name extends InvokeName>(name: Name, listener: InvokeListener<Name>): void {
  registerInvokeHandler(ipcMain, name, listener, reportIpcError)
}

function diagnosticsMenuItem(): Electron.MenuItem | undefined {
  return Menu.getApplicationMenu()?.getMenuItemById(DIAGNOSTICS_MENU_ID) ?? undefined
}

function registerIpc(): void {
  register('getAppUpdateStatus', () => appUpdates.getStatus())
  ipcMain.on('diagnostics:changed', (event, enabled) => {
    updateDiagnosticsMenu(
      event.sender,
      mainWindow?.webContents ?? null,
      enabled,
      diagnosticsMenuItem
    )
  })
  // The renderer's Sentry SDK inherits its config from the main process,
  // so only PostHog needs anything over IPC.
  register('getAnalyticsConfig', () => ({
    apiKey: posthogKey() ?? null,
    distinctId: machineId()
  }))

  register('openPermissionSettings', async () => {
    if (process.platform !== 'darwin') return
    Sentry.addBreadcrumb({
      category: 'permissions',
      level: 'info',
      message: 'Opening System Settings for folder access'
    })
    // Deep-links System Settings → Privacy & Security → Files and Folders; verified on macOS 26.
    await shell.openExternal(
      'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_FilesAndFolders'
    )
    capture('permission_settings_opened')
  })

  register('getRoot', () => currentRoot() ?? null)

  register('chooseRoot', async (_e, mode) => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title:
        mode === 'init'
          ? 'Choose where to create the leagues folder'
          : 'Select your leagues folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const root = resolve(result.filePaths[0])
    await prepareRootSelection(root, mode, bundledTemplatesDir())
    if (mode === 'init') {
      capture('root_initialised')
    }
    activateRoot(root)
    capture('root_selected', { onedrive: (await oneDriveStatus(root)).underOneDrive })
    return root
  })

  register('setRoot', async (_e, path) => {
    assertAbsolutePath(path, 'Invalid location request')
    const root = resolve(path)
    const probe = await probeRoot(root)
    if (probe !== 'dir') {
      if (probe === 'missing') {
        store.set(
          'recentRoots',
          storedRecents().filter((r) => r !== root)
        )
      }
      return null
    }
    if (root === currentRoot() && envRootOverride === undefined) return root
    activateRoot(root)
    capture('root_switched')
    return root
  })

  register('recentRoots', () => recentRoots())

  register('repairLocation', () => repairReservedLocations(requireRoot(), bundledTemplatesDir()))

  register('forgetRoot', () => {
    envRootOverride = undefined
    store.delete('rootPath')
    stopWatching()
  })

  register('scan', async () => {
    const root = currentRoot()
    if (!root) return null
    if (!rootWatcher) watchRoot(root)
    return scanLeaguesRoot(root, { heal: true })
  })

  register('listDir', async (_e, path) => {
    assertAbsolutePath(path, 'Invalid file path')
    const root = requireRoot()
    try {
      return await listDirEntries(await assertInsideRoot(root, path))
    } catch (err) {
      throw toUserFacing(err)
    }
  })

  register('createLeague', async (_e, day, name) => {
    const path = await createLeague(requireRoot(), day, name)
    capture('league_created', { day })
    return path
  })

  register('renameLeague', async (_e, day, leagueFolder, displayName) => {
    const path = await renameLeague({ root: requireRoot(), day, leagueFolder, displayName })
    capture('league_renamed', { day, folderChanged: basename(path) !== leagueFolder })
    return path
  })

  register('createSeason', async (_e, opts) => {
    const result = await createSeason({
      ...opts,
      root: requireRoot()
    })
    capture('season_created', { source: opts.source, archived: result.archived !== null })
    return result
  })

  register('createSeasonRoster', async (_e, ref, roster) => {
    await createSeasonRoster({ ...ref, root: requireRoot(), roster })
    capture('season_roster_created', { carryOver: roster.carryOver })
  })

  register('syncSeasonTemplates', async (_e, opts) => {
    const result = await syncSeasonWithTemplates({
      ...opts,
      root: requireRoot()
    })
    capture('season_templates_synced', { added: result.added.length })
    return result
  })

  register('zipArchive', async (_e, leagueFolder, seasons) => {
    const result = await zipArchivedSeasons(requireRoot(), leagueFolder, seasons)
    capture('archive_zipped', { count: result.zips.length })
    return result
  })

  register('trashFolder', async (_e, path) => {
    assertAbsolutePath(path, 'Invalid file path')
    const plan = await planTrash(requireRoot(), path)
    await executeTrashPlan(plan, (target) => shell.trashItem(target))
    capture(plan.kind === 'league' ? 'league_deleted' : 'season_deleted')
  })

  register('pickFiles', async () => {
    if (!mainWindow) return []
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections']
    })
    return result.canceled ? [] : result.filePaths
  })

  register('openFile', async (_e, requested) => {
    assertAbsolutePath(requested, 'Invalid file path')
    let path: string
    try {
      path = await assertInsideRoot(requireRoot(), requested)
    } catch (err) {
      // A stale browser row is an expected filesystem failure, not an application fault.
      throw toUserFacing(err)
    }
    const failure = await shell.openPath(path)
    if (failure) throw new UserFacingError(`Couldn’t open “${basename(path)}”: ${failure}`)
    capture('document_opened', { onedrive: (await oneDriveStatus(path)).availability })
  })

  register('revealFile', async (_e, requested) => {
    assertAbsolutePath(requested, 'Invalid file path')
    let path: string
    try {
      // Location menus reveal the selected root itself; other file actions still require a descendant.
      path = await assertInsideRoot(requireRoot(), requested, { allowRoot: true })
    } catch (err) {
      // Revealing a stale row should use the same user-facing error as opening it.
      throw toUserFacing(err)
    }
    shell.showItemInFolder(path)
  })

  register('importFiles', async (_e, dest, sources) => {
    assertAbsolutePath(dest, 'Invalid file import request')
    let result: ImportFilesResult
    try {
      result = await importFiles(await resolveImportDestination(requireRoot(), dest), sources)
    } catch (err) {
      throw toUserFacing(err)
    }
    capture('files_imported', { count: result.copied.length })
    return result
  })

  register('openHelp', (_e, target) => {
    helpWindows.open(target)
  })

  register('enableMembers', async () => {
    if (await enableMembers(requireRoot())) capture('members_enabled')
  })

  register('membersSnapshot', async () => {
    const root = currentRoot()
    if (!root) return null
    return buildMembersSnapshot(root, await scanLeaguesRoot(root))
  })

  register('saveMember', async (_e, input, revision) => {
    const saved = await saveMember(requireRoot(), input, revision)
    capture(input.id === undefined ? 'member_created' : 'member_updated')
    return saved
  })

  register('mergeMembers', async (_e, fromId, intoId, revision) => {
    await mergeMembers(requireRoot(), fromId, intoId, revision)
    capture('members_merged')
  })

  register('deleteMember', async (_e, id, revision) => {
    const outcome = await deleteMember(requireRoot(), id, revision)
    capture('member_deleted', { outcome })
    return outcome
  })

  register('renumberDuplicates', async (_e, id, keepIndex, revision) => {
    const renumbered = await renumberDuplicates(requireRoot(), id, keepIndex, revision)
    capture('members_renumbered', { count: renumbered.length })
    return renumbered
  })

  register('saveSeason', async (_e, ref, file, revision) => {
    const root = requireRoot()
    await saveSeason(root, ref, file, revision)
    capture('season_roster_saved', { players: file.players.length, teams: file.teams.length })
    // The sheet follows the roster; a failure here leaves the save intact and is retried on open.
    try {
      await regenerateSignInSheet(root, ref)
      return { signInSheet: 'updated' }
    } catch (err) {
      console.warn('Could not refresh the sign-in sheet:', err)
      Sentry.captureException(err, {
        tags: { ipc_channel: 'season:save', sign_in_sheet: 'refresh-after-save' }
      })
      return { signInSheet: 'failed' }
    }
  })

  register('openSignInSheet', async (_e, ref) => {
    const root = requireRoot()
    const seasonPath = await resolveLiveSeasonRoot(root, ref.day, ref.leagueFolder, ref.seasonName)
    const state = await signInSheetState(seasonPath)
    const path =
      state === 'fresh' ? signInSheetPath(seasonPath) : await regenerateSignInSheet(root, ref)
    const failure = await shell.openPath(path)
    if (failure) throw new UserFacingError(`Couldn’t open “${basename(path)}”: ${failure}`)
    capture('signin_opened', { generated: state !== 'fresh' })
    return path
  })

  register('pickImportFile', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a bowler export',
      properties: ['openFile'],
      filters: [{ name: 'Exports', extensions: ['xlsx', 'csv', 'tsv', 'txt'] }]
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  register('previewImport', (_e, path) =>
    previewImport(requireRoot(), path, store.get('importMappings') ?? [])
  )

  register('planMbdSync', async (_e, path, mapping) => {
    const root = requireRoot()
    const { plan, revision, sourceRevision, signature } = await planSync(root, path, mapping)
    store.set(
      'importMappings',
      rememberMapping(store.get('importMappings') ?? [], { root, signature, mapping })
    )
    return { plan, revision, sourceRevision }
  })

  register('syncMbd', async (_e, path, mapping, decisions, revision, sourceRevision) => {
    const summary = await syncMbd(requireRoot(), {
      path,
      mapping,
      decisions,
      revision,
      sourceRevision
    })
    capture('mbd_synced', { rows: summary.rows, created: summary.created, merged: summary.merged })
    return summary
  })

  register('planPlayersImport', async (_e, ref, path, mapping, league) => {
    const root = requireRoot()
    const result = await planPlayersImport(root, ref, path, mapping, league)
    store.set(
      'importMappings',
      rememberMapping(store.get('importMappings') ?? [], {
        root,
        signature: result.signature,
        mapping
      })
    )
    return {
      plan: result.plan,
      membersRevision: result.membersRevision,
      seasonRevision: result.seasonRevision,
      sourceRevision: result.sourceRevision
    }
  })

  register(
    'addPlayersFromExport',
    async (
      _e,
      ref,
      path,
      mapping,
      league,
      createLines,
      membersRevision,
      seasonRevision,
      sourceRevision
    ) => {
      const root = requireRoot()
      const summary = await addPlayersFromExport(root, {
        ref,
        path,
        mapping,
        league,
        createLines,
        membersRevision,
        seasonRevision,
        sourceRevision
      })
      capture('players_imported', { rows: summary.rows, added: summary.added })
      // The sheet follows the roster here as it does after a save; a failure is retried on open.
      if (summary.added > 0) {
        try {
          await regenerateSignInSheet(root, ref)
        } catch (err) {
          console.warn('Could not refresh the sign-in sheet:', err)
          Sentry.captureException(err, {
            tags: { ipc_channel: 'season:import-players', sign_in_sheet: 'refresh-after-import' }
          })
        }
      }
      return summary
    }
  )

  register('printCards', async (_e, ids, revision) => {
    const root = requireRoot()
    // A list that moved on is refused before any sheet of names is written anywhere.
    const master = await readMasterForWrite(root, revision)
    const wanted = new Set(ids)
    const members = master.members.filter((member) => wanted.has(member.id))
    if (members.length !== wanted.size) throw new UserFacingError('A chosen member is missing')
    const path = await generateCardSheet({
      members,
      nextId: master.nextId,
      title: basename(root),
      tempRoot: app.getPath('temp'),
      renderPdf: renderPdfWithElectron,
      now: new Date()
    })
    await markCardsIssued(root, ids, revision)
    const failure = await shell.openPath(path)
    if (failure) throw new UserFacingError(`Couldn’t open “${basename(path)}”: ${failure}`)
    capture('cards_printed', { count: members.length })
    return path
  })

  register('exportMembersCsv', async (_e, ids, options) => {
    if (!mainWindow) return null
    const root = requireRoot()
    const master = await readAppJson(membersFilePath(root), membersFileSchema)
    if (master.status !== 'ok') {
      throw new UserFacingError(
        master.status === 'missing' ? 'The members database is not enabled' : master.message
      )
    }
    const byId = new Map(master.value.members.map((member) => [member.id, member]))
    const chosen = ids.map((id) => byId.get(id))
    if (chosen.some((member) => member === undefined)) {
      throw new UserFacingError('A chosen member is missing')
    }
    const members = chosen.flatMap((member) =>
      member && (!options.marketingOnly || member.marketing) ? [member] : []
    )
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export members',
      defaultPath: join(app.getPath('documents'), 'Members.csv'),
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(
      result.filePath,
      membersCsv(members, { nextId: master.value.nextId, today: new Date() })
    )
    capture('members_exported', { count: members.length })
    return { path: result.filePath, count: members.length }
  })
}

async function regenerateSignInSheet(root: string, ref: SeasonSyncRequest): Promise<string> {
  const path = await refreshSignInSheet(root, ref, renderPdfWithElectron)
  capture('signin_generated')
  return path
}

function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? '#0f0f0f' : '#ffffff'
}

function openExternally(contents: Electron.WebContents): void {
  contents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })
}

/** A plain framed window: the help viewer is secondary and reads best as one. */
function createHelpWindow(initial: HelpTarget | null): HelpSurface {
  const options: Electron.BrowserWindowConstructorOptions = {
    width: 1000,
    height: 720,
    minWidth: 700,
    minHeight: 480,
    show: false,
    title: 'GoBowling Leagues Help',
    autoHideMenuBar: process.platform !== 'darwin',
    backgroundColor: windowBackground(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  }
  if (process.platform === 'linux') options.icon = icon
  const window = new BrowserWindow(options)

  const onThemeUpdated = (): void => window.setBackgroundColor(windowBackground())
  nativeTheme.on('updated', onThemeUpdated)
  window.on('closed', () => nativeTheme.removeListener('updated', onThemeUpdated))
  window.on('ready-to-show', () => window.show())

  openExternally(window.webContents)
  // The page is static; a link that is not a topic, anchor or external URL goes nowhere.
  window.webContents.on('will-navigate', (event) => event.preventDefault())

  const query = helpTargetToSearch(initial)
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL('/help.html', process.env['ELECTRON_RENDERER_URL'])
    url.search = new URLSearchParams(query).toString()
    void window.loadURL(url.toString())
  } else {
    void window.loadFile(join(__dirname, '../renderer/help.html'), { query })
  }

  return {
    focus: () => {
      if (window.isMinimized()) window.restore()
      window.focus()
    },
    close: () => window.close(),
    isDestroyed: () => window.isDestroyed(),
    navigate: (target) => {
      const send = (): void => window.webContents.send('help:navigate', target)
      if (window.webContents.isLoading()) window.webContents.once('did-finish-load', send)
      else send()
    },
    onClosed: (listener) => {
      window.on('closed', listener)
    }
  }
}

function titleBarOverlay(dark: boolean): Electron.TitleBarOverlayOptions {
  return {
    color: dark ? '#0f0f0f' : '#ffffff',
    symbolColor: dark ? '#ffffff' : '#0f0f0f',
    height: 48
  }
}

function createWindow(): void {
  const options: Electron.BrowserWindowConstructorOptions = {
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 500,
    show: false,
    autoHideMenuBar: process.platform !== 'darwin',
    titleBarStyle: 'hidden',
    // macOS needs the flag to expose titlebar-area CSS environment variables,
    // but only Windows and Linux accept configurable overlay options.
    titleBarOverlay:
      process.platform === 'darwin' ? true : titleBarOverlay(nativeTheme.shouldUseDarkColors),
    // Match Kumo's --color-kumo-base (light #fff, dark oklch(17% 0 0)) so the
    // window doesn't flash the wrong colour before the renderer paints.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f0f0f' : '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  }
  // Centre macOS's 12px traffic lights in the 48px toolbar.
  if (process.platform === 'darwin') options.trafficLightPosition = { x: 14, y: 18 }
  if (process.platform === 'linux') options.icon = icon
  mainWindow = new BrowserWindow(options)

  // Keep native surfaces in step when the OS theme changes at runtime.
  const onThemeUpdated = (): void => {
    const dark = nativeTheme.shouldUseDarkColors
    mainWindow?.setBackgroundColor(dark ? '#0f0f0f' : '#ffffff')
    if (process.platform !== 'darwin') mainWindow?.setTitleBarOverlay(titleBarOverlay(dark))
  }

  nativeTheme.on('updated', onThemeUpdated)
  const createdWindow = mainWindow
  mainWindow.on('closed', () => {
    nativeTheme.removeListener('updated', onThemeUpdated)
    if (mainWindow === createdWindow) mainWindow = null
    helpWindows.close()
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  openExternally(mainWindow.webContents)

  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return
    Menu.buildFromTemplate(buildEditableContextMenuTemplate(params.editFlags)).popup({
      window: createdWindow
    })
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
}

/** The filter shortcut belongs to whichever window has focus; everything else is the main window's. */
function commandWindow(command: AppCommand): BrowserWindow | null {
  const focused = BrowserWindow.getFocusedWindow()
  if (command === 'focus-filter' && focused && !focused.isDestroyed()) return focused
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

if (primaryInstance) {
  app.on('second-instance', (_event, argv) => {
    focusMainWindow()
    if (helpRequested(argv)) helpWindows.open(null)
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.gobowling.leagues')
    if (process.platform === 'win32') app.setUserTasks(helpJumpListTasks(process.execPath))

    capture('app_opened', { platform: process.platform })

    registerIpc()
    createWindow()
    if (app.isPackaged && (process.platform !== 'linux' || process.env.APPIMAGE)) {
      const stopUpdates = appUpdates.start(autoUpdater)
      app.once('will-quit', stopUpdates)
    }
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        buildAppMenuTemplate(
          process.platform,
          is.dev,
          (command) => {
            commandWindow(command)?.webContents.send('app:command', {
              command,
              repeat: false,
              composing: false
            })
          },
          () => helpWindows.open(null)
        )
      )
    )
    if (helpRequested(process.argv)) helpWindows.open(null)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Defer the first quit so PostHog/Sentry finish flushing; both flushes
// carry their own short timeouts, so this can't hang the app.
let flushedOnQuit = false
app.on('before-quit', (event) => {
  if (flushedOnQuit) return
  flushedOnQuit = true
  event.preventDefault()
  void Promise.allSettled([
    rootWatcher?.close(),
    shutdownAnalytics(),
    clearCardSheets(app.getPath('temp'))
  ]).then(() => app.quit())
})
