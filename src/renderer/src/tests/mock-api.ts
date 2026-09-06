import { vi } from 'vitest'
import type { LeaguesApi } from '../../../preload/index'

export type RendererApi = LeaguesApi

let treeChangedListeners: Array<() => void> = []

/** Fire the tree:changed event into whatever the component under test registered. */
export function emitTreeChanged(): void {
  for (const listener of treeChangedListeners) listener()
}

export function installMockApi(overrides: Partial<RendererApi> = {}): RendererApi {
  treeChangedListeners = []
  const api: RendererApi = {
    getRendererMetrics: vi.fn<RendererApi['getRendererMetrics']>(() => ({
      usedHeapKilobytes: 42 * 1024,
      cpuPercent: 1.2
    })),
    scan: vi.fn<RendererApi['scan']>().mockResolvedValue(null),
    // Echo the sources back, like the real handler returns the copied paths.
    importFiles: vi.fn<RendererApi['importFiles']>((_dest, sources) => Promise.resolve(sources)),
    zipArchive: vi.fn<RendererApi['zipArchive']>().mockResolvedValue([]),
    createLeague: vi.fn<RendererApi['createLeague']>().mockResolvedValue(''),
    createSeason: vi.fn<RendererApi['createSeason']>().mockResolvedValue({
      seasonPath: '',
      archived: null
    }),
    syncSeasonTemplates: vi.fn<RendererApi['syncSeasonTemplates']>().mockResolvedValue({
      added: [],
      skipped: []
    }),
    chooseRoot: vi.fn<RendererApi['chooseRoot']>().mockResolvedValue(null),
    openFile: vi.fn<RendererApi['openFile']>().mockResolvedValue(''),
    revealFile: vi.fn<RendererApi['revealFile']>().mockResolvedValue(undefined),
    forgetRoot: vi.fn<RendererApi['forgetRoot']>().mockResolvedValue(undefined),
    pathForFile: vi.fn<RendererApi['pathForFile']>((file) => file.name),
    onTreeChanged: vi.fn<RendererApi['onTreeChanged']>((listener) => {
      treeChangedListeners.push(listener)
      return () => {
        treeChangedListeners = treeChangedListeners.filter((l) => l !== listener)
      }
    }),
    getAnalyticsConfig: vi.fn<RendererApi['getAnalyticsConfig']>().mockResolvedValue({
      apiKey: null,
      distinctId: 'test'
    }),
    getRoot: vi.fn<RendererApi['getRoot']>().mockResolvedValue(null),
    // Echo the path back, like the real handler does for a folder that exists.
    setRoot: vi.fn<RendererApi['setRoot']>((path) => Promise.resolve(path)),
    recentRoots: vi.fn<RendererApi['recentRoots']>().mockResolvedValue([]),
    listDir: vi.fn<RendererApi['listDir']>().mockResolvedValue([]),
    trashFolder: vi.fn<RendererApi['trashFolder']>().mockResolvedValue(undefined),
    pickFiles: vi.fn<RendererApi['pickFiles']>().mockResolvedValue([]),
    ...overrides
  }

  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true })
  return api
}
