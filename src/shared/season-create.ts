import { z } from 'zod'
import { isSingleSegment } from './path-segment'
import { parseSeasonName } from './season'
import { WEEKDAYS } from './weekday'
import { MAX_FORMAT, MIN_FORMAT } from './members'
import { isWorkflowId } from './workflows'

// A non-string day is a shape failure; only a string outside the enum is the domain failure.
export const weekdaySchema = z.string().pipe(z.enum(WEEKDAYS, { error: 'Invalid league day' }))
export const leagueFolderSchema = z
  .string()
  .refine(isSingleSegment, { message: 'Invalid league folder' })
export const seasonNameSchema = z
  .string()
  .refine((name) => parseSeasonName(name)?.name === name, { message: 'Invalid season name' })

/** How a season's roster file starts: the format, and whether last season's line-up carries over. */
export const seasonRosterRequestSchema = z.object({
  /** Players per team. */
  format: z.number().int().min(MIN_FORMAT).max(MAX_FORMAT),
  /** Copy the previous season's teams and players into the season file. */
  carryOver: z.boolean()
})

export type SeasonRosterRequest = z.infer<typeof seasonRosterRequestSchema>

export const seasonCreateRequestSchema = z.object({
  day: weekdaySchema,
  leagueFolder: leagueFolderSchema,
  seasonName: seasonNameSchema,
  source: z.string().refine(isWorkflowId, { message: 'Unknown season workflow' }),
  archiveOldest: z.boolean(),
  /** Only honoured where the members database is enabled; see `roster`. */
  roster: seasonRosterRequestSchema.optional()
})

export const seasonSyncRequestSchema = z.object({
  day: weekdaySchema,
  leagueFolder: leagueFolderSchema,
  seasonName: seasonNameSchema
})

export type SeasonCreateRequest = z.infer<typeof seasonCreateRequestSchema>
export type SeasonSyncRequest = z.infer<typeof seasonSyncRequestSchema>
