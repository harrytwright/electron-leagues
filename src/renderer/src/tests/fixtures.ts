import { parseSeasonName } from '@shared/season'
import type { DirEntry, LeagueNode, LeaguesTree } from '@shared/tree'

export function makeDirEntry(overrides: Partial<DirEntry> = {}): DirEntry {
  const name = overrides.name ?? 'Rules.docx'
  return {
    name,
    path: overrides.path ?? `/root/_shared/${name}`,
    kind: overrides.kind ?? 'file',
    mtime: overrides.mtime ?? Date.UTC(2026, 0, 15)
  }
}

export function makeLeague(overrides: Partial<LeagueNode> = {}): LeagueNode {
  const folderName = overrides.folderName ?? 'Mixed triples'
  const day = overrides.day ?? 'monday'
  const path = overrides.path ?? `/root/${day}/${folderName}`
  const seasons = overrides.seasons ?? [
    {
      name: '2025-26',
      status: 'active' as const,
      path: `${path}/2025-26`,
      files: []
    }
  ]
  const archivedSeasons = overrides.archivedSeasons ?? []

  return {
    folderName,
    path,
    day,
    meta: overrides.meta ?? {
      schemaVersion: 1,
      name: folderName,
      day,
      seasons: seasons.map((season) => ({
        name: season.name,
        type: parseSeasonName(season.name)?.type ?? 'cross-year',
        status: season.status
      })),
      archivedSeasons,
      extra: {}
    },
    running: overrides.running ?? true,
    seasons,
    otherEntries: overrides.otherEntries ?? [],
    archivedSeasons,
    archivePath: overrides.archivePath ?? `${path}/_archives`
  }
}

export function makeTree(overrides: Partial<LeaguesTree> = {}): LeaguesTree {
  return {
    root: '/root',
    days: {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: []
    },
    templatesPath: '/root/_templates',
    sharedPath: '/root/_shared',
    hasTemplates: true,
    hasShared: true,
    templateFiles: [],
    sharedFiles: [],
    unrecognisedRootEntries: [],
    ...overrides
  }
}
