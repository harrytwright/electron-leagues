import { z } from 'zod'
import type { Weekday } from '../../shared/weekday'
import { isWeekday } from '../../shared/weekday'
import { UserFacingError } from './fs-errors'

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

const archiveZipInput = z.object({
  leagueFolder: z.string(),
  seasons: z.array(z.string())
})

const importFilesInput = z.object({
  dest: z.string(),
  sources: z.array(z.string())
})

const leagueCreateInput = z.object({
  day: z.string(),
  name: z.string()
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
  const parsed = z.string().safeParse(input)
  if (!parsed.success) throw new UserFacingError('Invalid location request')
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
