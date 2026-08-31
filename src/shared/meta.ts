import { z } from 'zod'
import { compareSeasonNames, type SeasonName, type SeasonType } from './season'
import type { Weekday } from './weekday'

export type SeasonStatus = 'active' | 'previous' | 'live'

export interface SeasonMeta {
  name: string
  type: SeasonType
  status: SeasonStatus
  createdAt?: string
}

export interface LeagueMeta {
  schemaVersion: 1
  name: string
  day: Weekday
  seasons: SeasonMeta[]
  archivedSeasons: string[]
  extra: Record<string, JsonValue>
}

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema)
  ])
)

const seasonInputSchema = z.object({
  name: z.string(),
  createdAt: z.string().optional()
})

/**
 * The fields of a prior meta.json this app trusts. Parsing is tolerant:
 * unusable fields fall back to their empty value instead of failing the file.
 */
const leagueMetaInputSchema = z.object({
  name: z.string().catch(''),
  seasons: z
    .array(jsonValueSchema)
    .catch([])
    .transform((items) =>
      items.flatMap((item) => {
        const season = seasonInputSchema.safeParse(item)
        return season.success ? [season.data] : []
      })
    ),
  extra: z.record(z.string(), jsonValueSchema).catch({})
})

export type LeagueMetaInput = z.infer<typeof leagueMetaInputSchema>

/**
 * Parse whatever a meta.json contained into the fields healMeta trusts.
 * Anything that is not an object yields null (treated as no prior meta).
 */
export function parseLeagueMetaInput(raw: JsonValue | undefined): LeagueMetaInput | null {
  const result = leagueMetaInputSchema.safeParse(raw)
  return result.success ? result.data : null
}

export interface ScanFacts {
  folderName: string
  day: Weekday
  liveSeasons: SeasonName[]
  archivedSeasons: string[]
}

/**
 * Reconcile a parsed prior meta.json with what a scan of the folder tree
 * actually found. Scan-derived truth always wins for seasons/archives;
 * user-facing fields (display name, extra, per-season createdAt) survive.
 */
export function healMeta(prior: LeagueMetaInput | null, scan: ScanFacts): LeagueMeta {
  const sorted = [...scan.liveSeasons].sort(compareSeasonNames)
  const seasons: SeasonMeta[] = sorted.map((season, index) => {
    const status: SeasonStatus =
      index === sorted.length - 1 ? 'active' : index === sorted.length - 2 ? 'previous' : 'live'
    const entry: SeasonMeta = { name: season.name, type: season.type, status }
    const createdAt = prior?.seasons.find((s) => s.name === season.name)?.createdAt
    if (createdAt) entry.createdAt = createdAt
    return entry
  })

  return {
    schemaVersion: 1,
    name: prior?.name.trim() ? prior.name : scan.folderName,
    day: scan.day,
    seasons,
    archivedSeasons: [...scan.archivedSeasons],
    extra: prior?.extra ?? {}
  }
}
