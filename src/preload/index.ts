import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DirEntry, LeaguesTree } from '../shared/tree'
import type { Weekday } from '../shared/weekday'
import type { WorkflowId } from '../shared/workflows'
import { getRendererMetrics } from './renderer-metrics'

export type { RendererMetrics } from './renderer-metrics'

export interface SeasonCreateRequest {
  day: Weekday
  leagueFolder: string
  seasonName: string
  source: WorkflowId
  archiveOldest: boolean
}

const api = {
  getRendererMetrics,
  getAnalyticsConfig: (): Promise<{ apiKey: string | null; distinctId: string }> =>
    ipcRenderer.invoke('analytics:config'),
  getRoot: (): Promise<string | null> => ipcRenderer.invoke('root:get'),
  chooseRoot: (mode: 'select' | 'init'): Promise<string | null> =>
    ipcRenderer.invoke('root:choose', mode),
  forgetRoot: (): Promise<void> => ipcRenderer.invoke('root:forget'),
  /** Switch to a known location; null when it can't be used (missing or unreadable). */
  setRoot: (path: string): Promise<string | null> => ipcRenderer.invoke('root:set', path),
  recentRoots: (): Promise<string[]> => ipcRenderer.invoke('root:recents'),
  scan: (): Promise<LeaguesTree | null> => ipcRenderer.invoke('leagues:scan'),
  listDir: (path: string): Promise<DirEntry[]> => ipcRenderer.invoke('dir:list', path),
  /** Move a league or season folder (and a league's archives) to the OS trash. */
  trashFolder: (path: string): Promise<void> => ipcRenderer.invoke('folder:trash', path),
  createLeague: (day: Weekday, name: string): Promise<string> =>
    ipcRenderer.invoke('league:create', day, name),
  createSeason: (
    opts: SeasonCreateRequest
  ): Promise<{ seasonPath: string; archived: string | null }> =>
    ipcRenderer.invoke('season:create', opts),
  syncSeasonTemplates: (
    opts: Pick<SeasonCreateRequest, 'day' | 'leagueFolder' | 'seasonName'>
  ): Promise<{ added: string[]; skipped: string[] }> =>
    ipcRenderer.invoke('season:sync-templates', opts),
  zipArchive: (leagueFolder: string, seasons: string[]): Promise<string[]> =>
    ipcRenderer.invoke('archive:zip', leagueFolder, seasons),
  openFile: (path: string): Promise<string> => ipcRenderer.invoke('file:open', path),
  revealFile: (path: string): Promise<void> => ipcRenderer.invoke('file:reveal', path),
  pickFiles: (): Promise<string[]> => ipcRenderer.invoke('files:pick'),
  importFiles: (dest: string, sources: string[]): Promise<string[]> =>
    ipcRenderer.invoke('file:import', dest, sources),
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  onTreeChanged: (listener: () => void): (() => void) => {
    const wrapped = (): void => listener()
    ipcRenderer.on('tree:changed', wrapped)
    return () => ipcRenderer.removeListener('tree:changed', wrapped)
  }
}

export type LeaguesApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
