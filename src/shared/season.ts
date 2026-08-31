export type SeasonType = 'cross-year' | 'full-year' | 'quarter'

export interface SeasonName {
  type: SeasonType
  name: string
  startYear: number
  endYear: number
  quarter?: number
}

const CROSS_YEAR = /^(\d{4})-(\d{2})$/
const FULL_YEAR = /^(\d{4})$/
const QUARTER = /^(\d{4})-[Qq]([1-4])$/

export function parseSeasonName(raw: string): SeasonName | null {
  const name = raw.trim()

  const quarter = QUARTER.exec(name)
  if (quarter) {
    const startYear = Number(quarter[1])
    return {
      type: 'quarter',
      name: `${startYear}-Q${quarter[2]}`,
      startYear,
      endYear: startYear,
      quarter: Number(quarter[2])
    }
  }

  const crossYear = CROSS_YEAR.exec(name)
  if (crossYear) {
    const startYear = Number(crossYear[1])
    const endYear = startYear + 1
    if (crossYear[2] !== String(endYear % 100).padStart(2, '0')) return null
    return { type: 'cross-year', name, startYear, endYear }
  }

  const fullYear = FULL_YEAR.exec(name)
  if (fullYear) {
    const startYear = Number(fullYear[1])
    return { type: 'full-year', name, startYear, endYear: startYear }
  }

  return null
}

export function formatSeasonName(type: SeasonType, startYear: number, quarter?: number): string {
  switch (type) {
    case 'cross-year':
      return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
    case 'full-year':
      return `${startYear}`
    case 'quarter':
      return `${startYear}-Q${quarter}`
  }
}

export function nextSeasonName(current: SeasonName): SeasonName {
  if (current.type === 'quarter') {
    const rolls = current.quarter === 4
    const startYear = rolls ? current.startYear + 1 : current.startYear
    const quarter = rolls ? 1 : (current.quarter ?? 1) + 1
    return parseSeasonName(formatSeasonName('quarter', startYear, quarter))!
  }
  return parseSeasonName(formatSeasonName(current.type, current.startYear + 1))!
}

export function suggestSeasonName(type: SeasonType, current: SeasonName | null, now: Date): string {
  if (current && current.type === type) return nextSeasonName(current).name
  const year = now.getFullYear()
  const quarter = Math.floor(now.getMonth() / 3) + 1
  return formatSeasonName(type, year, quarter)
}

/**
 * Chronological order by approximate season start: quarters start at their
 * quarter month, full years in January, cross-years in September.
 */
function startKey(season: SeasonName): number {
  const month =
    season.type === 'quarter'
      ? ((season.quarter ?? 1) - 1) * 3 + 1
      : season.type === 'cross-year'
        ? 9
        : 1
  return season.startYear * 100 + month
}

export function compareSeasonNames(a: SeasonName, b: SeasonName): number {
  return startKey(a) - startKey(b)
}
