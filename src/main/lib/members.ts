import { lstat, stat, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import {
  applyAgeRules,
  disabledMembersSnapshot,
  emptyMembersFile,
  findRosterProblems,
  MEMBERS_FILE,
  membersFileSchema,
  mergeMemberRecords,
  mintNumber,
  resolveMember,
  SEASON_FILE,
  seasonFileSchema,
  type FileRevision,
  type Member,
  type MemberInput,
  type MembersFile,
  type MembersProblem,
  type MembersSnapshot,
  type RosterSeason,
  type SeasonFile
} from '../../shared/members'
import type { SeasonSyncRequest } from '../../shared/season-create'
import type { LeaguesTree } from '../../shared/tree'
import { WEEKDAYS } from '../../shared/weekday'
import { readAppJson, writeAppJson, type AppJsonRead } from './app-json'
import { isMissing, toUserFacing, UserFacingError } from './fs-errors'
import { archivePathFor, resolveLiveSeasonRoot } from './paths'
import { withRootLock } from './root-lock'
import { scanLeaguesRoot } from './scanner'

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
  // The revision is taken before the content it names, so a write landing in between
  // leaves the snapshot already stale and the next save is refused, never accepted.
  const revision = await fileRevision(membersFilePath(root))
  const master = await readAppJson(membersFilePath(root), membersFileSchema)
  if (master.status === 'missing') return disabledMembersSnapshot()
  const problems: MembersProblem[] = []
  if (master.status === 'invalid') {
    problems.push({ kind: 'invalid-file', path: membersFilePath(root), message: master.message })
  }
  const seasons: RosterSeason[] = []
  const reads = await Promise.all(
    seasonLocations(root, tree).map(async (location) => {
      const revision = await fileRevision(seasonFilePath(location.path))
      return { location, revision, read: await readSeasonFile(location.path) }
    })
  )
  for (const { location, read, revision } of reads) {
    if (read.status === 'missing') continue
    if (read.status === 'invalid') {
      problems.push({ kind: 'invalid-file', path: location.path, message: read.message })
      continue
    }
    seasons.push({ ...location, revision, file: read.value })
  }
  const snapshot: MembersSnapshot = {
    enabled: true,
    revision,
    nextId: master.status === 'ok' ? master.value.nextId : 1,
    members: master.status === 'ok' ? master.value.members : [],
    seasons,
    problems
  }
  // Without a readable master list every roster row would read as unlinked; one problem is enough.
  if (master.status === 'ok') snapshot.problems.push(...findRosterProblems(snapshot))
  return snapshot
}

/** A write must start from a readable master list, and from the copy the editor loaded. */
export async function readMasterForWrite(
  root: string,
  expected: FileRevision
): Promise<MembersFile> {
  const path = membersFilePath(root)
  const master = await readAppJson(path, membersFileSchema)
  if (master.status === 'missing') {
    throw new UserFacingError('The members database is not enabled for this location')
  }
  if (master.status === 'invalid') throw new UserFacingError(master.message)
  if ((await fileRevision(path)) !== expected) throw new UserFacingError(STALE_MESSAGE)
  return master.value
}

export const STALE_MESSAGE =
  'That file changed on disk since it was loaded, so nothing was saved. Check the refreshed list and try again.'

/** Size and modification time together stand in for the file's contents. */
export async function fileRevision(path: string): Promise<FileRevision> {
  const info = await stat(path).catch((err) => {
    if (isMissing(err)) return null
    throw toUserFacing(err)
  })
  return info ? `${info.mtimeMs}:${info.size}` : ''
}

export async function writeMaster(root: string, file: MembersFile): Promise<void> {
  await writeAppJson(membersFilePath(root), file)
}

function liveMember(file: MembersFile, id: number): Member {
  const member = file.members.find((candidate) => candidate.id === id)
  if (!member || member.mergedInto !== undefined || member.deleted) {
    throw new UserFacingError(`Member ${id} is not in the list any more`)
  }
  return member
}

/** Create a member, minting the next number, or update one that already exists. */
export async function saveMember(
  root: string,
  input: MemberInput,
  expected: FileRevision,
  today = new Date()
): Promise<Member> {
  return withRootLock(root, async () => {
    const file = await readMasterForWrite(root, expected)
    const { id, ...details } = input
    const ruled = applyAgeRules(details, today)
    let saved: Member
    let renamed = false
    if (id === undefined) {
      saved = { id: mintNumber(file), ...ruled }
      file.members.push(saved)
    } else {
      const existing = liveMember(file, id)
      saved = { ...existing, ...ruled }
      renamed = existing.firstName !== saved.firstName || existing.lastName !== saved.lastName
      for (const key of [
        'dob',
        'gender',
        'email',
        'phone',
        'guardianContact',
        'notes',
        'cardIssued'
      ] as const) {
        if (ruled[key] === undefined) delete saved[key]
      }
      file.members[file.members.indexOf(existing)] = saved
    }
    await writeMaster(root, file)
    if (renamed) await touchLiveRostersWith(root, saved.id)
    return saved
  })
}

/**
 * A renamed member changes what every sheet naming them should say; touching their
 * live rosters is what marks those sheets stale.
 */
async function touchLiveRostersWith(root: string, memberId: number): Promise<void> {
  const now = new Date()
  for (const location of seasonLocations(root, await scanLeaguesRoot(root))) {
    if (location.archived) continue
    const season = await readSeasonFile(location.path)
    if (season.status !== 'ok') continue
    if (!season.value.players.some((player) => player.memberId === memberId)) continue
    await utimes(seasonFilePath(location.path), now, now)
  }
}

/**
 * Fold one member into another. Live rosters move to the survivor; archived
 * seasons keep the old number and resolve it through `mergedInto` when read.
 */
export async function mergeMembers(
  root: string,
  fromId: number,
  intoId: number,
  expected: FileRevision
): Promise<void> {
  if (fromId === intoId) throw new UserFacingError('Choose a different member to merge into')
  return withRootLock(root, async () => {
    const file = await readMasterForWrite(root, expected)
    const from = liveMember(file, fromId)
    const into = liveMember(file, intoId)
    file.members[file.members.indexOf(into)] = mergeMemberRecords(into, from)
    file.members[file.members.indexOf(from)] = { ...from, mergedInto: intoId }
    await writeMaster(root, file)
    for (const location of seasonLocations(root, await scanLeaguesRoot(root))) {
      if (location.archived) continue
      const season = await readSeasonFile(location.path)
      if (season.status !== 'ok') continue
      if (!season.value.players.some((player) => player.memberId === fromId)) continue
      const alreadyThere = season.value.players.some((player) => player.memberId === intoId)
      const players = season.value.players.flatMap((player) => {
        if (player.memberId !== fromId) return [player]
        return alreadyThere ? [] : [{ ...player, memberId: intoId }]
      })
      await writeSeasonFile(location.path, { ...season.value, players })
    }
  })
}

export type DeleteOutcome = 'hard' | 'soft'

/** Removes a member nobody references; otherwise hides them so old rosters still resolve. */
export async function deleteMember(
  root: string,
  id: number,
  expected: FileRevision
): Promise<DeleteOutcome> {
  return withRootLock(root, async () => {
    const file = await readMasterForWrite(root, expected)
    const member = liveMember(file, id)
    // A record merged into this one still resolves here from old rosters, so it counts too.
    let referenced = file.members.some((candidate) => candidate.mergedInto === id)
    for (const location of seasonLocations(root, await scanLeaguesRoot(root))) {
      if (referenced) break
      const season = await readSeasonFile(location.path)
      if (season.status !== 'ok') continue
      referenced = season.value.players.some(
        (player) => resolveMember(file.members, player.memberId)?.id === id
      )
    }
    if (referenced) {
      file.members[file.members.indexOf(member)] = { ...member, deleted: true }
    } else {
      file.members.splice(file.members.indexOf(member), 1)
    }
    await writeMaster(root, file)
    return referenced ? 'soft' : 'hard'
  })
}

/**
 * Two machines can mint the same number before a sync. The record at `keepIndex`
 * (counting only records with this number, in file order) keeps it; the rest
 * take fresh numbers, and any roster row still points at the kept record.
 */
export async function renumberDuplicates(
  root: string,
  id: number,
  keepIndex: number,
  expected: FileRevision
): Promise<number[]> {
  return withRootLock(root, async () => {
    const file = await readMasterForWrite(root, expected)
    const holders = file.members.filter((member) => member.id === id)
    if (holders.length < 2) throw new UserFacingError(`Member number ${id} is not duplicated`)
    if (keepIndex < 0 || keepIndex >= holders.length) {
      throw new UserFacingError('Choose which record keeps the number')
    }
    // Records merged into a renumbered holder keep pointing at the number, so they now
    // resolve to the keeper; the keeper is the record the person chose to stand for it.
    const renumbered: number[] = []
    holders.forEach((holder, index) => {
      if (index === keepIndex) return
      holder.id = mintNumber(file)
      renumbered.push(holder.id)
    })
    await writeMaster(root, file)
    return renumbered
  })
}

/** Replace a live season's file; archived seasons are history and stay as they are. */
export async function saveSeason(
  root: string,
  ref: SeasonSyncRequest,
  file: SeasonFile,
  expected: FileRevision
): Promise<void> {
  return withRootLock(root, async () => {
    const seasonPath = await resolveLiveSeasonRoot(root, ref.day, ref.leagueFolder, ref.seasonName)
    const path = seasonFilePath(seasonPath)
    const current = await readSeasonFile(seasonPath)
    if (current.status === 'missing') {
      throw new UserFacingError('This season has no roster file; older seasons are not backfilled')
    }
    if ((await fileRevision(path)) !== expected) throw new UserFacingError(STALE_MESSAGE)
    const teamIds = new Set(file.teams.map((team) => team.id))
    if (teamIds.size !== file.teams.length) throw new UserFacingError('Team ids must be unique')
    const teamNumbers = new Set(file.teams.map((team) => team.teamNo))
    if (teamNumbers.size !== file.teams.length) {
      throw new UserFacingError('Two teams cannot share a team number')
    }
    for (const player of file.players) {
      if (player.teamId !== null && !teamIds.has(player.teamId)) {
        throw new UserFacingError(`Player ${player.memberId} is in a team that does not exist`)
      }
    }
    const memberIds = new Set(file.players.map((player) => player.memberId))
    if (memberIds.size !== file.players.length) {
      throw new UserFacingError('A member can only be on a roster once')
    }
    await writeSeasonFile(seasonPath, file)
  })
}
