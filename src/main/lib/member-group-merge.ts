import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import {
  buildMergedMember,
  memberGroupMergeRequestSchema,
  type MemberGroupMergeRequest
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
import { fileRevision, membersFilePath, seasonFilePath, STALE_MESSAGE } from './members'
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
  const order = new Map(request.sourceIds.map((id, index) => [id, index] as const))
  const candidates = players.flatMap((player, index) => {
    const resolved = resolveMember(members, player.memberId)
    if (!resolved) return []
    const sourceOrder = order.get(resolved.id)
    return sourceOrder === undefined ? [] : [{ index, sourceId: resolved.id, sourceOrder }]
  })
  if (candidates.length === 0) return [...players]
  const directMain = candidates.find(
    (candidate) => players[candidate.index].memberId === request.mainId
  )
  const resolvedMain = candidates.find((candidate) => candidate.sourceId === request.mainId)
  const keep =
    directMain ??
    resolvedMain ??
    candidates.reduce((earliest, candidate) =>
      candidate.sourceOrder < earliest.sourceOrder ? candidate : earliest
    )
  const selectedIndexes = new Set(candidates.map((candidate) => candidate.index))
  return players.flatMap((player, index) => {
    if (!selectedIndexes.has(index)) return [player]
    return index === keep.index ? [{ ...player, memberId: request.mainId }] : []
  })
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
 * Merge two or more live records in one locked operation. Archived season files
 * stay byte-for-byte unchanged and continue resolving through `mergedInto` links.
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
    const seasons = await readLiveSeasons(root)
    const files: PreparedMemberMergeFile[] = []
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

    const nextMaster: MembersFile = {
      ...masterRead.value,
      members: masterRead.value.members.map((member) => {
        if (member.id === request.mainId) return survivor
        return request.sourceIds.includes(member.id)
          ? { ...member, mergedInto: request.mainId }
          : member
      })
    }
    files.push({ path: masterPath, original: masterRead.raw, next: serialiseAppJson(nextMaster) })
    await commitPreparedMemberMerge(files, io)
    return survivor
  })
}
