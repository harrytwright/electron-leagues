import { z } from 'zod'
import { isSingleSegment } from './path-segment'
import { parseSeasonName } from './season'
import { WEEKDAYS } from './weekday'
import { isWorkflowId } from './workflows'

// A non-string day is a shape failure; only a string outside the enum is the domain failure.
export const weekdaySchema = z.string().pipe(z.enum(WEEKDAYS, { error: 'Invalid league day' }))
export const leagueFolderSchema = z
  .string()
  .refine(isSingleSegment, { message: 'Invalid league folder' })
export const seasonNameSchema = z
  .string()
  .refine((name) => parseSeasonName(name)?.name === name, { message: 'Invalid season name' })

export const seasonCreateRequestSchema = z.object({
  day: weekdaySchema,
  leagueFolder: leagueFolderSchema,
  seasonName: seasonNameSchema,
  source: z.string().refine(isWorkflowId, { message: 'Unknown season workflow' }),
  archiveOldest: z.boolean()
})

export const seasonSyncRequestSchema = z.object({
  day: weekdaySchema,
  leagueFolder: leagueFolderSchema,
  seasonName: seasonNameSchema
})

export type SeasonCreateRequest = z.infer<typeof seasonCreateRequestSchema>
export type SeasonSyncRequest = z.infer<typeof seasonSyncRequestSchema>
