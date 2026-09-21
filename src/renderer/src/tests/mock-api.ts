import { vi } from 'vitest'
import type { LeaguesApi } from '../../../preload/index'
import type { AppCommandEvent } from '../../../shared/app-command'
import type { HelpTarget } from '../../../shared/help'

export type RendererApi = LeaguesApi

let treeChangedListeners: Array<() => void> = []
let appCommandListeners: Parameters<RendererApi['onAppCommand']>[0][] = []
let appUpdateListeners: Parameters<RendererApi['onAppUpdateChanged']>[0][] = []

export function emitAppUpdateChanged(
  status: Awaited<ReturnType<RendererApi['getAppUpdateStatus']>>
): void {
  for (const listener of appUpdateListeners) listener(status)
}
let helpNavigateListeners: Parameters<RendererApi['onHelpNavigate']>[0][] = []

/** Fire the tree:changed event into whatever the component under test registered. */
export function emitTreeChanged(): void {
  for (const listener of treeChangedListeners) listener()
}

export function treeChangedListenerCount(): number {
  return treeChangedListeners.length
}

export function emitAppCommand(event: AppCommandEvent): void {
  for (const listener of appCommandListeners) listener(event)
}

export function emitHelpNavigate(target: HelpTarget): void {
  for (const listener of helpNavigateListeners) listener(target)
}

export function installMockApi(overrides: Partial<RendererApi> = {}): RendererApi {
  treeChangedListeners = []
  appCommandListeners = []
  appUpdateListeners = []
  helpNavigateListeners = []
  const api: RendererApi = {
    getAppUpdateStatus: vi.fn<RendererApi['getAppUpdateStatus']>().mockResolvedValue({
      version: '0.2.3',
      readyVersion: null
    }),
    onAppUpdateChanged: vi.fn<RendererApi['onAppUpdateChanged']>((listener) => {
      appUpdateListeners.push(listener)
      return () => {
        appUpdateListeners = appUpdateListeners.filter((item) => item !== listener)
      }
    }),
    diagnosticsChanged: vi.fn<RendererApi['diagnosticsChanged']>(),
    getRendererMetrics: vi.fn<RendererApi['getRendererMetrics']>(() => ({
      usedHeapKilobytes: 43008,
      cpuPercent: 1.2
    })),
    scan: vi.fn<RendererApi['scan']>().mockResolvedValue(null),
    // Echo the sources back, like the real handler returns the copied paths.
    importFiles: vi.fn<RendererApi['importFiles']>((_dest, sources) =>
      Promise.resolve({ copied: sources, failed: [] })
    ),
    zipArchive: vi.fn<RendererApi['zipArchive']>().mockResolvedValue({ zips: [], failed: [] }),
    createLeague: vi.fn<RendererApi['createLeague']>().mockResolvedValue(''),
    // Echo the renamed path back, like the real handler does once the folder has moved.
    renameLeague: vi.fn<RendererApi['renameLeague']>((day, _folder, name) =>
      Promise.resolve(`/root/${day}/${name}`)
    ),
    createSeason: vi.fn<RendererApi['createSeason']>().mockResolvedValue({
      seasonPath: '',
      archived: null
    }),
    syncSeasonTemplates: vi.fn<RendererApi['syncSeasonTemplates']>().mockResolvedValue({
      added: [],
      skipped: []
    }),
    chooseRoot: vi.fn<RendererApi['chooseRoot']>().mockResolvedValue(null),
    repairLocation: vi.fn<RendererApi['repairLocation']>().mockResolvedValue({
      repaired: [],
      warnings: []
    }),
    openFile: vi.fn<RendererApi['openFile']>().mockResolvedValue(undefined),
    revealFile: vi.fn<RendererApi['revealFile']>().mockResolvedValue(undefined),
    forgetRoot: vi.fn<RendererApi['forgetRoot']>().mockResolvedValue(undefined),
    pathForFile: vi.fn<RendererApi['pathForFile']>((file) => file.name),
    onTreeChanged: vi.fn<RendererApi['onTreeChanged']>((listener) => {
      treeChangedListeners.push(listener)
      return () => {
        treeChangedListeners = treeChangedListeners.filter((l) => l !== listener)
      }
    }),
    onAppCommand: vi.fn<RendererApi['onAppCommand']>((listener) => {
      appCommandListeners.push(listener)
      return () => {
        appCommandListeners = appCommandListeners.filter((item) => item !== listener)
      }
    }),
    onHelpNavigate: vi.fn<RendererApi['onHelpNavigate']>((listener) => {
      helpNavigateListeners.push(listener)
      return () => {
        helpNavigateListeners = helpNavigateListeners.filter((item) => item !== listener)
      }
    }),
    openHelp: vi.fn<RendererApi['openHelp']>().mockResolvedValue(undefined),
    getAnalyticsConfig: vi.fn<RendererApi['getAnalyticsConfig']>().mockResolvedValue({
      apiKey: null,
      distinctId: 'test'
    }),
    openPermissionSettings: vi
      .fn<RendererApi['openPermissionSettings']>()
      .mockResolvedValue(undefined),
    getRoot: vi.fn<RendererApi['getRoot']>().mockResolvedValue(null),
    // Echo the path back, like the real handler does for a folder that exists.
    setRoot: vi.fn<RendererApi['setRoot']>((path) => Promise.resolve(path)),
    recentRoots: vi.fn<RendererApi['recentRoots']>().mockResolvedValue([]),
    listDir: vi.fn<RendererApi['listDir']>().mockResolvedValue([]),
    trashFolder: vi.fn<RendererApi['trashFolder']>().mockResolvedValue(undefined),
    pickFiles: vi.fn<RendererApi['pickFiles']>().mockResolvedValue([]),
    enableMembers: vi.fn<RendererApi['enableMembers']>().mockResolvedValue(undefined),
    membersSnapshot: vi.fn<RendererApi['membersSnapshot']>().mockResolvedValue({
      enabled: false,
      revision: '',
      nextId: 1,
      members: [],
      seasons: [],
      problems: []
    }),
    saveMember: vi.fn<RendererApi['saveMember']>((input) =>
      Promise.resolve({ id: input.id ?? 1, ...input })
    ),
    mergeMembers: vi.fn<RendererApi['mergeMembers']>().mockResolvedValue(undefined),
    deleteMember: vi.fn<RendererApi['deleteMember']>().mockResolvedValue('hard'),
    resetMembers: vi.fn<RendererApi['resetMembers']>().mockResolvedValue(undefined),
    renumberDuplicates: vi.fn<RendererApi['renumberDuplicates']>().mockResolvedValue([]),
    createSeasonRoster: vi.fn<RendererApi['createSeasonRoster']>().mockResolvedValue(undefined),
    saveSeason: vi.fn<RendererApi['saveSeason']>().mockResolvedValue({ signInSheet: 'updated' }),
    openSignInSheet: vi.fn<RendererApi['openSignInSheet']>().mockResolvedValue(''),
    pickImportFile: vi.fn<RendererApi['pickImportFile']>().mockResolvedValue(null),
    previewImport: vi.fn<RendererApi['previewImport']>((path) =>
      Promise.resolve({
        path,
        fileName: path.split(/[\\/]/).pop() ?? path,
        columns: [],
        sample: [],
        rowCount: 0,
        choices: [],
        mapping: {
          mbdId: null,
          firstName: null,
          lastName: null,
          fullName: null,
          gender: null,
          team: null,
          league: null
        },
        remembered: false
      })
    ),
    planMbdSync: vi.fn<RendererApi['planMbdSync']>().mockResolvedValue({
      plan: { rows: [], invalid: [] },
      revision: 'members-r1',
      sourceRevision: 'export-r1'
    }),
    syncMbd: vi.fn<RendererApi['syncMbd']>().mockResolvedValue({
      rows: 0,
      created: 0,
      matched: 0,
      merged: 0,
      aliased: 0,
      restored: 0,
      skipped: 0,
      failed: [],
      log: []
    }),
    planPlayersImport: vi.fn<RendererApi['planPlayersImport']>().mockResolvedValue({
      plan: { rows: [], invalid: [], newTeams: [] },
      membersRevision: 'members-r1',
      seasonRevision: 'season-r1',
      sourceRevision: 'export-r1'
    }),
    printCards: vi.fn<RendererApi['printCards']>().mockResolvedValue('/tmp/Member cards.pdf'),
    exportMembersCsv: vi.fn<RendererApi['exportMembersCsv']>().mockResolvedValue(null),
    addPlayersFromExport: vi.fn<RendererApi['addPlayersFromExport']>().mockResolvedValue({
      rows: 0,
      added: 0,
      created: 0,
      restored: 0,
      teamsCreated: 0,
      skipped: 0,
      unknown: 0,
      failed: []
    }),
    ...overrides
  }

  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true })
  return api
}
