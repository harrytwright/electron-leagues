import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  disabledMembersSnapshot,
  emptyMembersFile,
  findRosterProblems,
  MEMBERS_FILE,
  membersFileSchema,
  SEASON_FILE,
  seasonFileSchema,
  type MembersProblem,
  type MembersSnapshot,
  type RosterSeason,
  type SeasonFile
} from '../../shared/members'
import type { LeaguesTree } from '../../shared/tree'
import { WEEKDAYS } from '../../shared/weekday'
import { readAppJson, writeAppJson, type AppJsonRead } from './app-json'
import { isMissing, toUserFacing, UserFacingError } from './fs-errors'
import { archivePathFor } from './paths'

export function membersFilePath(root: string): string {
  return join(root, MEMBERS_FILE)
}

export function seasonFilePath(seasonPath: string): string {
  return join(seasonPath, SEASON_FILE)
}

/** The feature is on for a location exactly when its master list exists as a regular file. */
export async function membersEnabled(root: string): Promise<boolean> {
  const info = await lstat(membersFilePath(root)).catch((err) => {
    if (isMissing(err)) return null
    throw toUserFacing(err)
  })
  return info !== null && info.isFile()
}

/** Create the master list; a location that already has one is left exactly as it is. */
export async function enableMembers(root: string): Promise<boolean> {
  if (await membersEnabled(root)) return false
  try {
    await writeAppJson(membersFilePath(root), emptyMembersFile(), { exclusive: true })
  } catch (err) {
    if (err instanceof UserFacingError) throw err
    throw toUserFacing(err)
  }
  return true
}

export async function readSeasonFile(seasonPath: string): Promise<AppJsonRead<SeasonFile>> {
  return readAppJson(seasonFilePath(seasonPath), seasonFileSchema)
}

export async function writeSeasonFile(seasonPath: string, file: SeasonFile): Promise<void> {
  await writeAppJson(seasonFilePath(seasonPath), file)
}

interface SeasonLocation {
  day: RosterSeason['day']
  leagueFolder: string
  leagueName: string
  season: string
  path: string
  archived: boolean
}

function seasonLocations(root: string, tree: LeaguesTree): SeasonLocation[] {
  const locations: SeasonLocation[] = []
  for (const day of WEEKDAYS) {
    for (const league of tree.days[day]) {
      for (const season of league.seasons) {
        locations.push({
          day,
          leagueFolder: league.folderName,
          leagueName: league.meta.name,
          season: season.name,
          path: season.path,
          archived: false
        })
      }
      for (const season of league.archivedSeasons) {
        locations.push({
          day,
          leagueFolder: league.folderName,
          leagueName: league.meta.name,
          season,
          path: join(archivePathFor(root, league.folderName), season),
          archived: true
        })
      }
    }
  }
  return locations
}

/**
 * Everything the Members page and the season tabs show, read fresh from disk.
 * Seasons without a file are simply absent: older seasons are never backfilled.
 */
export async function buildMembersSnapshot(
  root: string,
  tree: LeaguesTree
): Promise<MembersSnapshot> {
  const master = await readAppJson(membersFilePath(root), membersFileSchema)
  if (master.status === 'missing') return disabledMembersSnapshot()
  const problems: MembersProblem[] = []
  if (master.status === 'invalid') {
    problems.push({ kind: 'invalid-file', path: membersFilePath(root), message: master.message })
  }
  const seasons: RosterSeason[] = []
  const reads = await Promise.all(
    seasonLocations(root, tree).map(async (location) => ({
      location,
      read: await readSeasonFile(location.path)
    }))
  )
  for (const { location, read } of reads) {
    if (read.status === 'missing') continue
    if (read.status === 'invalid') {
      problems.push({ kind: 'invalid-file', path: location.path, message: read.message })
      continue
    }
    seasons.push({ ...location, file: read.value })
  }
  const snapshot: MembersSnapshot = {
    enabled: true,
    nextId: master.status === 'ok' ? master.value.nextId : 1,
    members: master.status === 'ok' ? master.value.members : [],
    seasons,
    problems
  }
  // Without a readable master list every roster row would read as unlinked; one problem is enough.
  if (master.status === 'ok') snapshot.problems.push(...findRosterProblems(snapshot))
  return snapshot
}
