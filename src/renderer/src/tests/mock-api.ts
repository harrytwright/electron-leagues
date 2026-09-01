import { vi } from 'vitest'
import type { LeaguesApi } from '../../../preload/index'

// pickFiles ships in the preload for real in the FileList task; this local
// extension exists so earlier tasks can already mock against the final shape.
// Once preload exports it, collapse RendererApi back to LeaguesApi.
export type RendererApi = LeaguesApi & {
  pickFiles(): Promise<string[]>
}

let treeChangedListeners: Array<() => void> = []

/** Fire the tree:changed event into whatever the component under test registered. */
export function emitTreeChanged(): void {
  for (const listener of treeChangedListeners) listener()
}

export function installMockApi(overrides: Partial<RendererApi> = {}): RendererApi {
  treeChangedListeners = []
  const api: RendererApi = {
    scan: vi.fn<RendererApi['scan']>().mockResolvedValue(null),
    importFiles: vi.fn<RendererApi['importFiles']>().mockResolvedValue([]),
    zipArchive: vi.fn<RendererApi['zipArchive']>().mockResolvedValue([]),
    createLeague: vi.fn<RendererApi['createLeague']>().mockResolvedValue(''),
    createSeason: vi.fn<RendererApi['createSeason']>().mockResolvedValue({
      seasonPath: '',
      archived: null
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
    pickFiles: vi.fn<RendererApi['pickFiles']>().mockResolvedValue([]),
    ...overrides
  }

  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true })
  return api
}
