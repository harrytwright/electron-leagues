import { electronApp, is } from '@electron-toolkit/utils'
import { watch, type FSWatcher } from 'chokidar'
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from 'electron'
import Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import icon from '../../resources/icon.png?asset'
import { parseSeasonCreateRequest } from './lib/season-create-request'
import {
  parseArchiveZipRequest,
  parseImportFilesRequest,
  parseLeagueCreateRequest,
  parseRootSetRequest
} from './lib/operation-requests'
import { registerDiagnosticsIpc, watchDiagnosticsLoads } from './lib/diagnostics-menu'
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
  importFiles,
  prepareRootSelection,
  repairReservedLocations,
  syncSeasonWithTemplates,
  zipArchivedSeasons,
  type CreateSeasonOptions
} from './lib/operations'
import { isMissing, toUserFacing, UserFacingError } from './lib/fs-errors'
import { assertInsideRoot, planTrash } from './lib/paths'
import { pruneRecents, seedRecents, updateRecents, type RootProbe } from './lib/recents'
import { listDirEntries, scanLeaguesRoot } from './lib/scanner'
import * as Sentry from '@sentry/electron/main'

interface Settings {
  rootPath?: string
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

// As early as possible so Sentry's error hooks and the IPC bridge for the
// renderer SDK are in place before any window loads.
initAnalytics(posthogKey(), sentryDSN(), machineId())

function bundledTemplatesDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'templates')
    : join(app.getAppPath(), 'resources', 'templates')
}

let mainWindow: BrowserWindow | null = null
let watcher: FSWatcher | null = null
let watchTimer: NodeJS.Timeout | null = null

function stopWatching(): void {
  void watcher?.close()
  watcher = null
  if (watchTimer) clearTimeout(watchTimer)
  watchTimer = null
}

function watchRoot(root: string): void {
  stopWatching()
  // Depth 6 reaches two levels below a season folder; edits deeper than that
  // won't auto-refresh until the user navigates.
  watcher = watch(root, { ignoreInitial: true, depth: 6 })
  watcher.on('all', () => {
    if (watchTimer) clearTimeout(watchTimer)
    watchTimer = setTimeout(() => mainWindow?.webContents.send('tree:changed'), 500)
  })
  watcher.on('error', (err) => {
    console.error(err)
    Sentry.captureException(err)
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

/** ipcMain.handle, but unexpected failures are reported to Sentry before rejecting the invoke. */
function handle<Args extends unknown[], Result>(
  channel: string,
  listener: (event: Electron.IpcMainInvokeEvent, ...args: Args) => Result
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      // SAFETY: ipcMain delivers whatever the renderer invoked with; the
      // listener's parameter types document the expected shape, exactly as
      // when these listeners were passed to ipcMain.handle directly.
      return await listener(event, ...(args as Args))
    } catch (err) {
      if (!(err instanceof UserFacingError)) {
        Sentry.captureException(err, { tags: { ipc_channel: channel } })
      }
      throw err
    }
  })
}

function diagnosticsMenuItem(): Electron.MenuItem | undefined {
  return Menu.getApplicationMenu()?.getMenuItemById(DIAGNOSTICS_MENU_ID) ?? undefined
}

function registerIpc(): void {
  registerDiagnosticsIpc(ipcMain, () => mainWindow?.webContents ?? null, diagnosticsMenuItem)
  // The renderer's Sentry SDK inherits its config from the main process,
  // so only PostHog needs anything over IPC.
  handle('analytics:config', () => ({
    apiKey: posthogKey() ?? null,
    distinctId: machineId()
  }))

  handle('root:get', () => currentRoot() ?? null)

  handle('root:choose', async (_e, mode: 'select' | 'init') => {
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

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- IPC is an untrusted process boundary
  handle('root:set', async (_e, input: unknown) => {
    const root = resolve(parseRootSetRequest(input))
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

  handle('root:recents', () => recentRoots())

  handle('root:repair', () => repairReservedLocations(requireRoot(), bundledTemplatesDir()))

  handle('root:forget', () => {
    envRootOverride = undefined
    store.delete('rootPath')
    stopWatching()
  })

  handle('leagues:scan', async () => {
    const root = currentRoot()
    if (!root) return null
    if (!watcher) watchRoot(root)
    return scanLeaguesRoot(root, { heal: true })
  })

  handle('dir:list', async (_e, path: string) => {
    const root = requireRoot()
    try {
      return await listDirEntries(await assertInsideRoot(root, path))
    } catch (err) {
      throw toUserFacing(err)
    }
  })

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- IPC is an untrusted process boundary
  handle('league:create', async (_e, dayInput: unknown, nameInput: unknown) => {
    const { day, name } = parseLeagueCreateRequest({ day: dayInput, name: nameInput })
    const path = await createLeague(requireRoot(), day, name)
    capture('league_created', { day })
    return path
  })

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- IPC is an untrusted process boundary
  handle('season:create', async (_e, input: unknown) => {
    const opts = parseSeasonCreateRequest(input)
    const result = await createSeason({
      ...opts,
      root: requireRoot()
    })
    capture('season_created', { source: opts.source, archived: result.archived !== null })
    return result
  })

  handle(
    'season:sync-templates',
    async (_e, opts: Pick<CreateSeasonOptions, 'day' | 'leagueFolder' | 'seasonName'>) => {
      const result = await syncSeasonWithTemplates({
        ...opts,
        root: requireRoot()
      })
      capture('season_templates_synced', { added: result.added.length })
      return result
    }
  )

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- IPC is an untrusted process boundary
  handle('archive:zip', async (_e, leagueInput: unknown, seasonsInput: unknown) => {
    const { leagueFolder, seasons } = parseArchiveZipRequest({
      leagueFolder: leagueInput,
      seasons: seasonsInput
    })
    const zips = await zipArchivedSeasons(requireRoot(), leagueFolder, seasons)
    capture('archive_zipped', { count: seasons.length })
    return zips
  })

  handle('folder:trash', async (_e, path: string) => {
    const plan = await planTrash(requireRoot(), path)
    for (const target of plan.paths) {
      await shell.trashItem(target)
    }
    capture(plan.kind === 'league' ? 'league_deleted' : 'season_deleted')
  })

  handle('files:pick', async () => {
    if (!mainWindow) return []
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections']
    })
    return result.canceled ? [] : result.filePaths
  })

  handle('file:open', async (_e, path: string) => {
    capture('document_opened', { onedrive: (await oneDriveStatus(path)).availability })
    return shell.openPath(path)
  })

  handle('file:reveal', (_e, path: string) => {
    shell.showItemInFolder(path)
  })

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- IPC is an untrusted process boundary
  handle('file:import', async (_e, destInput: unknown, sourcesInput: unknown) => {
    const { dest, sources } = parseImportFilesRequest({ dest: destInput, sources: sourcesInput })
    const copied = await importFiles(await assertInsideRoot(requireRoot(), dest), sources)
    capture('files_imported', { count: copied.length })
    return copied
  })
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
  watchDiagnosticsLoads(
    mainWindow.webContents,
    () => mainWindow?.webContents ?? null,
    diagnosticsMenuItem
  )

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
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.gobowling.leagues')

  capture('app_opened', { platform: process.platform })

  registerIpc()
  createWindow()
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildAppMenuTemplate(process.platform, is.dev, (command) => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        mainWindow.webContents.send('app:command', {
          command,
          repeat: false,
          composing: false
        })
      })
    )
  )

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

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
  void Promise.allSettled([watcher?.close(), shutdownAnalytics()]).then(() => app.quit())
})
