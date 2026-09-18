import type { Member, MembersSnapshot, RosterSeason, SeasonFile } from '@shared/members'
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
    archiveItemCount: overrides.archiveItemCount ?? archivedSeasons.length,
    // Archives live beside the league nights, never inside the league folder.
    archivePath: overrides.archivePath ?? `/root/_archives/${folderName}`
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
    unrecognisedRootEntries: [],
    ...overrides
  }
}

export function makeMember(overrides: Partial<Member> & Pick<Member, 'id'>): Member {
  return {
    firstName: 'Jane',
    lastName: 'Doe',
    dob: '1990-05-04',
    email: 'jane@example.org',
    mbdIds: [],
    aliases: [],
    marketing: true,
    ...overrides
  }
}

export function makeSeasonFile(overrides: Partial<SeasonFile> = {}): SeasonFile {
  return { schemaVersion: 1, format: 3, teams: [], players: [], ...overrides }
}

export function makeRosterSeason(overrides: Partial<RosterSeason> = {}): RosterSeason {
  const leagueFolder = overrides.leagueFolder ?? 'Mixed triples'
  const day = overrides.day ?? 'monday'
  const season = overrides.season ?? '2025-26'
  return {
    day,
    leagueFolder,
    leagueName: overrides.leagueName ?? leagueFolder,
    season,
    path: overrides.path ?? `/root/${day}/${leagueFolder}/${season}`,
    archived: overrides.archived ?? false,
    file: overrides.file ?? makeSeasonFile()
  }
}

export function makeSnapshot(overrides: Partial<MembersSnapshot> = {}): MembersSnapshot {
  return { enabled: true, nextId: 1, members: [], seasons: [], problems: [], ...overrides }
}
