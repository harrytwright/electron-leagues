import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import {
  buildMergedMember,
  keepRosterCandidate,
  memberGroupMergeRequestSchema,
  planRosterMerge,
  type MemberGroupMergeRequest,
  type RosterMergeCandidate
} from '../../shared/member-merge'
import {
  membersFileSchema,
  resolveMember,
  seasonFileSchema,
  type Member,
  type MembersFile,
  type Player,
  type SeasonFile
} from '../../shared/members'
import { assertAppJsonWritable, readAppJson, serialiseAppJson } from './app-json'
import { toUserFacing, UserFacingError } from './fs-errors'
import {
  assertGuardianLink,
  fileRevision,
  membersFilePath,
  seasonFilePath,
  STALE_MESSAGE
} from './members'
import { withRootLock } from './root-lock'
import { scanLeaguesRoot } from './scanner'
import { WEEKDAYS } from '../../shared/weekday'

export interface PreparedMemberMergeFile {
  path: string
  original: string
  next: string
}

export interface MemberMergeFileIo {
  read(path: string): Promise<string>
  guard(path: string): Promise<void>
  write(path: string, contents: string): Promise<void>
}

const fileIo: MemberMergeFileIo = {
  read: (path) => readFile(path, 'utf8'),
  guard: async (path) => {
    await assertAppJsonWritable(path)
  },
  write: (path, contents) => writeFile(path, contents, 'utf8')
}

/**
 * Commit prepared files and restore every attempted target after a failed write.
 * The failed target is included because a filesystem error may follow a partial overwrite.
 */
export async function commitPreparedMemberMerge(
  files: readonly PreparedMemberMergeFile[],
  io: MemberMergeFileIo = fileIo
): Promise<void> {
  for (const file of files) {
    await io.guard(file.path)
    if ((await io.read(file.path)) !== file.original) {
      throw new UserFacingError(
        `${basename(file.path)} changed on disk while the merge was being prepared, so nothing was saved. Try again.`
      )
    }
  }

  const attempted: PreparedMemberMergeFile[] = []
  for (const file of files) {
    try {
      await io.guard(file.path)
      attempted.push(file)
      await io.write(file.path, file.next)
    } catch (writeError) {
      const rollbackFailures: Array<{ path: string; message: string }> = []
      for (const attemptedFile of [...attempted].reverse()) {
        try {
          await io.guard(attemptedFile.path)
          await io.write(attemptedFile.path, attemptedFile.original)
        } catch (rollbackError) {
          rollbackFailures.push({
            path: attemptedFile.path,
            message: toUserFacing(rollbackError).message
          })
        }
      }
      const failure = `Could not save ${file.path}: ${toUserFacing(writeError).message}.`
      if (rollbackFailures.length === 0) {
        throw new UserFacingError(`${failure} Original files were restored.`)
      }
      const details = rollbackFailures.map(({ path, message }) => `${path} (${message})`).join(', ')
      throw new UserFacingError(`${failure} Could not restore: ${details}.`)
    }
  }
}

function liveSeasonPaths(tree: Awaited<ReturnType<typeof scanLeaguesRoot>>): string[] {
  const paths: string[] = []
  for (const day of WEEKDAYS) {
    for (const league of tree.days[day]) {
      for (const season of league.seasons) paths.push(season.path)
    }
  }
  return paths
}

function selectedMembers(file: MembersFile, request: MemberGroupMergeRequest): Member[] {
  return request.sourceIds.map((id) => {
    const matches = file.members.filter((member) => member.id === id)
    if (matches.length !== 1) {
      throw new UserFacingError(
        matches.length === 0
          ? `Member ${id} is not in the list any more`
          : `Member number ${id} is duplicated and must be resolved before merging`
      )
    }
    const member = matches[0]
    if (member.deleted || member.mergedInto !== undefined) {
      throw new UserFacingError(`Member ${id} is not eligible to merge`)
    }
    return member
  })
}

function mergeRosterPlayers(
  players: readonly Player[],
  members: readonly Member[],
  request: MemberGroupMergeRequest
): Player[] {
  const plan = planRosterMerge(players, members, request.sourceIds, request.mainId)
  if (plan.unchanged || !plan.keep) return [...players]
  const keep = plan.keep
  const selectedIndexes = new Set(plan.candidates.map((candidate) => candidate.index))
  const kept: Player = { ...players[keep.index], memberId: request.mainId }
  const secretaryId =
    kept.leagueSecretaryId ??
    plan.candidates
      .map((candidate) => players[candidate.index].leagueSecretaryId)
      .find((id) => id !== undefined)
  if (secretaryId !== undefined) kept.leagueSecretaryId = secretaryId
  return players.flatMap((player, index) => {
    if (!selectedIndexes.has(index)) return [player]
    return index === keep.index ? [kept] : []
  })
}

/**
 * A roster entry under a duplicated number cannot say which holder it means, so
 * a merge that would move it is refused until the numbers are put right.
 */
function refuseDuplicatedRosterEntries(
  master: MembersFile,
  seasons: readonly ReadSeason[],
  request: MemberGroupMergeRequest
): void {
  const counts = new Map<number, number>()
  for (const member of master.members) counts.set(member.id, (counts.get(member.id) ?? 0) + 1)
  const selected = new Set(request.sourceIds)
  for (const season of seasons) {
    for (const player of season.file.players) {
      if ((counts.get(player.memberId) ?? 0) < 2) continue
      const resolved = resolveMember(master.members, player.memberId)
      if (resolved && selected.has(resolved.id)) {
        const seasonDir = dirname(season.path)
        throw new UserFacingError(
          `Member number ${player.memberId} is duplicated and listed in ${basename(dirname(seasonDir))}/${basename(seasonDir)}, so it must be resolved before merging`
        )
      }
    }
  }
}

interface ReadSeason {
  path: string
  file: SeasonFile
  raw: string
}

async function readLiveSeasons(root: string): Promise<ReadSeason[]> {
  const tree = await scanLeaguesRoot(root)
  const seasons: ReadSeason[] = []
  for (const seasonPath of liveSeasonPaths(tree)) {
    const path = seasonFilePath(seasonPath)
    let read: Awaited<ReturnType<typeof readAppJson<SeasonFile>>>
    try {
      read = await readAppJson(path, seasonFileSchema)
    } catch (error) {
      throw toUserFacing(error)
    }
    if (read.status === 'missing') continue
    if (read.status === 'invalid') {
      throw new UserFacingError(`${path}: ${read.message}`)
    }
    seasons.push({ path, file: read.value, raw: read.raw })
  }
  return seasons
}

/**
 * Merge two or more live records in one locked operation. The master list is
 * written first, so a crash part way leaves rosters that still read correctly
 * through `mergedInto` and a problem the Members page can show. Archived season
 * files stay byte-for-byte unchanged and continue resolving through those links.
 */
export async function mergeMemberGroup(
  root: string,
  unparsedRequest: MemberGroupMergeRequest,
  today = new Date(),
  io: MemberMergeFileIo = fileIo
): Promise<Member> {
  let request: MemberGroupMergeRequest
  try {
    request = memberGroupMergeRequestSchema.parse(unparsedRequest)
  } catch (error) {
    throw new UserFacingError(toUserFacing(error).message)
  }
  return withRootLock(root, async () => {
    const masterPath = membersFilePath(root)
    const masterRead = await readAppJson(masterPath, membersFileSchema)
    if (masterRead.status === 'missing') {
      throw new UserFacingError('The members database is not enabled for this location')
    }
    if (masterRead.status === 'invalid') throw new UserFacingError(masterRead.message)
    if ((await fileRevision(masterPath)) !== request.expectedRevision) {
      throw new UserFacingError(STALE_MESSAGE)
    }
    const sources = selectedMembers(masterRead.value, request)
    let survivor: Member
    try {
      survivor = buildMergedMember(sources, request, today)
    } catch (error) {
      throw new UserFacingError(toUserFacing(error).message)
    }
    const mainLink = sources.find((source) => source.id === request.mainId)?.guardianMemberId
    // A link main already carried is kept as stored, as `saveMember` keeps an unchanged
    // one, so a junior whose guardian was soft-deleted can still be merged. Every merged
    // source counts as the survivor itself, so a link to any of them would be a self-link
    // once the merge lands.
    if (survivor.guardianMemberId !== undefined && survivor.guardianMemberId !== mainLink) {
      survivor = {
        ...survivor,
        guardianMemberId: assertGuardianLink(
          masterRead.value.members,
          survivor.guardianMemberId,
          request.sourceIds,
          today
        )
      }
    }
    const seasons = await readLiveSeasons(root)
    refuseDuplicatedRosterEntries(masterRead.value, seasons, request)
    const nextMaster: MembersFile = {
      ...masterRead.value,
      members: masterRead.value.members.map((member) => {
        if (member.id === request.mainId) return survivor
        return request.sourceIds.includes(member.id)
          ? { ...member, mergedInto: request.mainId }
          : member
      })
    }
    const files: PreparedMemberMergeFile[] = [
      { path: masterPath, original: masterRead.raw, next: serialiseAppJson(nextMaster) }
    ]
    const main = sources.find((source) => source.id === request.mainId)
    if (!main) throw new UserFacingError('The main member must be one of the selected members')
    const nameChanged = main.firstName !== survivor.firstName || main.lastName !== survivor.lastName
    const selectedIds = new Set(request.sourceIds)
    for (const season of seasons) {
      const hasSelectedPlayer = season.file.players.some((player) => {
        const resolved = resolveMember(masterRead.value.members, player.memberId)
        return resolved !== null && selectedIds.has(resolved.id)
      })
      const players = mergeRosterPlayers(season.file.players, masterRead.value.members, request)
      if (JSON.stringify(players) !== JSON.stringify(season.file.players)) {
        files.push({
          path: season.path,
          original: season.raw,
          next: serialiseAppJson({ ...season.file, players })
        })
      } else if (nameChanged && hasSelectedPlayer) {
        files.push({ path: season.path, original: season.raw, next: season.raw })
      }
    }

    await commitPreparedMemberMerge(files, io)
    return survivor
  })
}

interface RepairGroup {
  /** The id every candidate below resolves to. */
  targetId: number
  candidates: RosterMergeCandidate[]
}

/**
 * The absorption groups a repair would actually rewrite: roster entries that already resolve
 * to a shared target, grouped by that target, kept only where rewriting would change
 * something. A raw duplicate within the roster is left out of every group, since which holder
 * it names cannot be told apart. A target already written raw more than once in the roster is
 * left out too, so an absorbed entry is never rewritten into a third copy of an existing pair.
 * Shared between the write and the duplicated-number refusal, so they never disagree about
 * which entries repair touches.
 */
function repairGroups(players: readonly Player[], members: readonly Member[]): RepairGroup[] {
  const rawIdCounts = new Map<number, number>()
  for (const player of players) {
    rawIdCounts.set(player.memberId, (rawIdCounts.get(player.memberId) ?? 0) + 1)
  }
  const groups = new Map<number, RosterMergeCandidate[]>()
  players.forEach((player, index) => {
    if (rawIdCounts.get(player.memberId) !== 1) return
    const resolved = resolveMember(members, player.memberId)
    if (!resolved || (rawIdCounts.get(resolved.id) ?? 0) > 1) return
    const candidates = groups.get(resolved.id) ?? []
    candidates.push({ index, memberId: player.memberId, sourceId: resolved.id, sourceOrder: index })
    groups.set(resolved.id, candidates)
  })
  return [...groups.entries()]
    .filter(
      ([targetId, candidates]) => candidates.length > 1 || candidates[0].memberId !== targetId
    )
    .map(([targetId, candidates]) => ({ targetId, candidates }))
}

/**
 * Point live roster entries at the record their number now resolves to, keeping one entry per
 * member (`keepRosterCandidate`): the target's own current number when it is on the roster,
 * otherwise the earliest entry. That need not be the entry a merge's own preview would have
 * kept, since a repair has no record of the selection order a stopped merge used. This is the
 * tidy-up for a merge that stopped after the master list was written, or for a roster edited
 * by hand. Two entries that already share the exact same stored number are a different, raw
 * duplicate that detection never flags; they, and any absorbed entry that would rewrite onto
 * that same duplicated number, are left exactly as they are, not collapsed, so a genuine
 * second bowler is never quietly deleted under an ambiguous, duplicated number.
 */
export function repairRosterPlayers(
  players: readonly Player[],
  members: readonly Member[]
): Player[] {
  const groups = repairGroups(players, members)
  const removedIndexes = new Set<number>()
  const repairedByIndex = new Map<number, Player>()
  for (const group of groups) {
    const keep = keepRosterCandidate(group.candidates, group.targetId)
    for (const candidate of group.candidates) {
      if (candidate.index !== keep.index) removedIndexes.add(candidate.index)
    }
    const original = players[keep.index]
    const secretaryId =
      original.leagueSecretaryId ??
      group.candidates
        .map((candidate) => players[candidate.index].leagueSecretaryId)
        .find((id) => id !== undefined)
    const repaired: Player = { ...original, memberId: keep.sourceId }
    if (secretaryId !== undefined) repaired.leagueSecretaryId = secretaryId
    repairedByIndex.set(keep.index, repaired)
  }
  return players.flatMap((player, index) => {
    if (removedIndexes.has(index)) return []
    return [repairedByIndex.get(index) ?? player]
  })
}

/**
 * A duplicated number cannot say which holder it means, so a repair that would rewrite or
 * remove an entry under one, or rewrite an entry onto one, is refused until the numbers are
 * put right; an unrelated duplicated entry elsewhere on the same roster is left alone.
 */
function refuseDuplicatedRepairEntries(
  season: ReadSeason,
  members: readonly Member[],
  counts: ReadonlyMap<number, number>
): void {
  for (const group of repairGroups(season.file.players, members)) {
    const touchedIds = new Set([group.targetId, ...group.candidates.map((c) => c.memberId)])
    for (const id of touchedIds) {
      if ((counts.get(id) ?? 0) <= 1) continue
      const seasonDir = dirname(season.path)
      throw new UserFacingError(
        `Member number ${id} is duplicated and listed in ${basename(dirname(seasonDir))}/${basename(seasonDir)}, so it must be resolved before repairing`
      )
    }
  }
}

/** Rewrite every live roster that lists an absorbed number; returns how many were changed. */
export async function repairRosters(
  root: string,
  expectedRevision: string,
  io: MemberMergeFileIo = fileIo
): Promise<number> {
  return withRootLock(root, async () => {
    const masterPath = membersFilePath(root)
    const masterRead = await readAppJson(masterPath, membersFileSchema)
    if (masterRead.status === 'missing') {
      throw new UserFacingError('The members database is not enabled for this location')
    }
    if (masterRead.status === 'invalid') throw new UserFacingError(masterRead.message)
    if ((await fileRevision(masterPath)) !== expectedRevision) {
      throw new UserFacingError(STALE_MESSAGE)
    }
    const counts = new Map<number, number>()
    for (const member of masterRead.value.members) {
      counts.set(member.id, (counts.get(member.id) ?? 0) + 1)
    }
    const files: PreparedMemberMergeFile[] = []
    for (const season of await readLiveSeasons(root)) {
      const players = repairRosterPlayers(season.file.players, masterRead.value.members)
      if (JSON.stringify(players) === JSON.stringify(season.file.players)) continue
      refuseDuplicatedRepairEntries(season, masterRead.value.members, counts)
      files.push({
        path: season.path,
        original: season.raw,
        next: serialiseAppJson({ ...season.file, players })
      })
    }
    await commitPreparedMemberMerge(files, io)
    return files.length
  })
}
