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
  extra: Record<string, unknown>
}

export interface ScanFacts {
  folderName: string
  day: Weekday
  liveSeasons: SeasonName[]
  archivedSeasons: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Reconcile whatever is on disk in meta.json with what a scan of the folder
 * tree actually found. Scan-derived truth always wins for seasons/archives;
 * user-facing fields (display name, extra, per-season createdAt) survive.
 */
export function healMeta(existing: unknown, scan: ScanFacts): LeagueMeta {
  const prior = isRecord(existing) ? existing : {}
  const priorSeasons = Array.isArray(prior.seasons)
    ? prior.seasons.filter(isRecord).filter((s) => typeof s.name === 'string')
    : []

  const sorted = [...scan.liveSeasons].sort(compareSeasonNames)
  const seasons: SeasonMeta[] = sorted.map((season, index) => {
    const status: SeasonStatus =
      index === sorted.length - 1 ? 'active' : index === sorted.length - 2 ? 'previous' : 'live'
    const priorSeason = priorSeasons.find((s) => s.name === season.name)
    const createdAt = typeof priorSeason?.createdAt === 'string' ? priorSeason.createdAt : undefined
    return { name: season.name, type: season.type, status, ...(createdAt ? { createdAt } : {}) }
  })

  return {
    schemaVersion: 1,
    name: typeof prior.name === 'string' && prior.name.trim() ? prior.name : scan.folderName,
    day: scan.day,
    seasons,
    archivedSeasons: [...scan.archivedSeasons],
    extra: isRecord(prior.extra) ? prior.extra : {}
  }
}
