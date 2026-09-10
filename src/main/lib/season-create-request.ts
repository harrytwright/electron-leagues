import { z } from 'zod'
import type { SeasonCreateRequest } from '../../shared/season-create'
import { isWeekday } from '../../shared/weekday'
import { isWorkflowId } from '../../shared/workflows'
import { UserFacingError } from './fs-errors'
import { assertLeagueFolderName } from './paths'

const seasonCreateInput = z.object({
  day: z.string(),
  leagueFolder: z.string(),
  seasonName: z.string(),
  source: z.string(),
  archiveOldest: z.boolean()
})

/** Parse the untrusted IPC payload once before it reaches typed operations. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- IPC is an untrusted process boundary
export function parseSeasonCreateRequest(input: unknown): SeasonCreateRequest {
  const parsed = seasonCreateInput.safeParse(input)
  if (!parsed.success) throw new UserFacingError('Invalid season request')
  if (!isWeekday(parsed.data.day)) throw new UserFacingError('Invalid league day')
  if (!isWorkflowId(parsed.data.source)) throw new UserFacingError('Unknown season workflow')
  assertLeagueFolderName(parsed.data.leagueFolder)
  return { ...parsed.data, day: parsed.data.day, source: parsed.data.source }
}
