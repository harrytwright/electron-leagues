import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { watch, type FSWatcher } from 'chokidar'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import icon from '../../resources/icon.png?asset'
import type { Weekday } from '../shared/weekday'
import { capture, initAnalytics, shutdownAnalytics } from './lib/analytics'
import { oneDriveStatus } from './lib/onedrive'
import {
  createLeague,
  createSeason,
  importFiles,
  initialiseRoot,
  zipArchivedSeasons,
  type CreateSeasonOptions
} from './lib/operations'
import { scanLeaguesRoot } from './lib/scanner'

interface Settings {
  rootPath?: string
  posthogKey?: string
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

function bundledTemplatesDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'templates')
    : join(app.getAppPath(), 'resources', 'templates')
}

let mainWindow: BrowserWindow | null = null
let watcher: FSWatcher | null = null

function watchRoot(root: string): void {
  void watcher?.close()
  let timer: NodeJS.Timeout | null = null
  watcher = watch(root, { ignoreInitial: true, depth: 5 })
  watcher.on('all', () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => mainWindow?.webContents.send('tree:changed'), 500)
  })
}

/** LEAGUES_ROOT overrides the stored root — used for dev/test fixtures. */
function currentRoot(): string | undefined {
  return process.env.LEAGUES_ROOT ?? store.get('rootPath')
}

function registerIpc(): void {
  ipcMain.handle('root:get', () => currentRoot() ?? null)

  ipcMain.handle('root:choose', async (_e, mode: 'select' | 'init') => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title:
        mode === 'init'
          ? 'Choose where to create the leagues folder'
          : 'Select your leagues folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const root = result.filePaths[0]
    if (mode === 'init') {
      await initialiseRoot(root, bundledTemplatesDir())
      capture('root_initialised')
    }
    store.set('rootPath', root)
    watchRoot(root)
    capture('root_selected', { onedrive: (await oneDriveStatus(root)).underOneDrive })
    return root
  })

  ipcMain.handle('root:forget', () => {
    store.delete('rootPath')
    void watcher?.close()
    watcher = null
  })

  ipcMain.handle('leagues:scan', async () => {
    const root = currentRoot()
    if (!root) return null
    if (!watcher) watchRoot(root)
    return scanLeaguesRoot(root, { heal: true })
  })

  ipcMain.handle('league:create', async (_e, day: Weekday, name: string) => {
    const root = currentRoot()
    if (!root) throw new Error('No leagues folder selected')
    const path = await createLeague(root, day, name)
    capture('league_created', { day })
    return path
  })

  ipcMain.handle('season:create', async (_e, opts: Omit<CreateSeasonOptions, 'root'>) => {
    const root = currentRoot()
    if (!root) throw new Error('No leagues folder selected')
    const result = await createSeason({ ...opts, root })
    capture('season_created', { source: opts.source, archived: result.archived !== null })
    return result
  })

  ipcMain.handle('archive:zip', async (_e, leagueFolder: string, seasons: string[]) => {
    const root = currentRoot()
    if (!root) throw new Error('No leagues folder selected')
    const zips = await zipArchivedSeasons(root, leagueFolder, seasons)
    capture('archive_zipped', { count: seasons.length })
    return zips
  })

  ipcMain.handle('file:open', async (_e, path: string) => {
    capture('document_opened', { onedrive: (await oneDriveStatus(path)).availability })
    return shell.openPath(path)
  })

  ipcMain.handle('file:reveal', (_e, path: string) => {
    shell.showItemInFolder(path)
  })

  ipcMain.handle('file:import', async (_e, dest: string, sources: string[]) => {
    const copied = await importFiles(dest, sources)
    capture('files_imported', { count: copied.length })
    return copied
  })
}

function createWindow(): void {
  const options: Electron.BrowserWindowConstructorOptions = {
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  }
  if (process.platform === 'linux') options.icon = icon
  mainWindow = new BrowserWindow(options)

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.gobowling.leagues')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initAnalytics(process.env.LEAGUES_POSTHOG_KEY ?? store.get('posthogKey'), machineId())
  capture('app_opened', { platform: process.platform })

  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  void watcher?.close()
  void shutdownAnalytics()
})
