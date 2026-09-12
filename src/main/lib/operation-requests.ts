import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { parseSeasonName } from '../../shared/season'
import type { Weekday } from '../../shared/weekday'
import { isWeekday } from '../../shared/weekday'
import { UserFacingError } from './fs-errors'
import { assertLeagueFolderName } from './paths'

export interface ArchiveZipRequest {
  leagueFolder: string
  seasons: string[]
}

export interface ImportFilesRequest {
  dest: string
  sources: string[]
}

export interface LeagueCreateRequest {
  day: Weekday
  name: string
}

export interface SeasonSyncRequest {
  day: Weekday
  leagueFolder: string
  seasonName: string
}

const absolutePath = z.string().min(1).refine(isAbsolute)

const archiveZipInput = z.object({
  leagueFolder: z.string(),
  seasons: z.array(z.string())
})

const importFilesInput = z.object({
  dest: absolutePath,
  sources: z.array(z.string())
})

const leagueCreateInput = z.object({
  day: z.string(),
  name: z.string()
})

const seasonSyncInput = z.object({
  day: z.string(),
  leagueFolder: z.string(),
  seasonName: z.string()
})

/** Parse the untrusted IPC payload before it reaches archive operations. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- IPC is an untrusted process boundary
export function parseArchiveZipRequest(input: unknown): ArchiveZipRequest {
  const parsed = archiveZipInput.safeParse(input)
  if (!parsed.success) throw new UserFacingError('Invalid archive request')
  return parsed.data
}

/** Parse the untrusted IPC payload before it reaches file operations. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- IPC is an untrusted process boundary
export function parseImportFilesRequest(input: unknown): ImportFilesRequest {
  const parsed = importFilesInput.safeParse(input)
  if (!parsed.success) throw new UserFacingError('Invalid file import request')
  return parsed.data
}

/** Parse the untrusted IPC payload before it changes the selected location. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- IPC is an untrusted process boundary
export function parseRootSetRequest(input: unknown): string {
  const parsed = absolutePath.safeParse(input)
  if (!parsed.success) throw new UserFacingError('Invalid location request')
  return parsed.data
}

/** Parse a path supplied by the renderer before it reaches shell operations. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- IPC is an untrusted process boundary
export function parsePathRequest(input: unknown): string {
  const parsed = absolutePath.safeParse(input)
  if (!parsed.success) throw new UserFacingError('Invalid file path')
  return parsed.data
}

/** Parse the untrusted IPC payload before it reaches league operations. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- IPC is an untrusted process boundary
export function parseLeagueCreateRequest(input: unknown): LeagueCreateRequest {
  const parsed = leagueCreateInput.safeParse(input)
  if (!parsed.success) throw new UserFacingError('Invalid league request')
  if (!isWeekday(parsed.data.day)) throw new UserFacingError('Invalid league day')
  return { day: parsed.data.day, name: parsed.data.name }
}

/** Parse the untrusted IPC payload before it reaches season template operations. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- IPC is an untrusted process boundary
export function parseSeasonSyncRequest(input: unknown): SeasonSyncRequest {
  const parsed = seasonSyncInput.safeParse(input)
  if (!parsed.success) throw new UserFacingError('Invalid season sync request')
  if (!isWeekday(parsed.data.day)) throw new UserFacingError('Invalid league day')
  assertLeagueFolderName(parsed.data.leagueFolder)
  const season = parseSeasonName(parsed.data.seasonName)
  if (!season || season.name !== parsed.data.seasonName) {
    throw new UserFacingError('Invalid season name')
  }
  return { ...parsed.data, day: parsed.data.day }
}
