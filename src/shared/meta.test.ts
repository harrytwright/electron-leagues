import { describe, expect, test } from 'vitest'
import { healMeta, parseLeagueMetaInput, type ScanFacts } from './meta'
import { parseSeasonName } from './season'

const scan: ScanFacts = {
  folderName: 'Mens Triples',
  day: 'monday',
  liveSeasons: [parseSeasonName('2024-25')!, parseSeasonName('2025-26')!],
  archivedSeasons: ['2023-24']
}

describe('parseLeagueMetaInput', () => {
  test('accepts a well-formed prior meta', () => {
    const input = parseLeagueMetaInput({
      name: "Men's Triples League",
      seasons: [{ name: '2025-26', createdAt: '2025-09-01T00:00:00Z' }],
      extra: { contact: 'Dave' }
    })
    expect(input).toEqual({
      name: "Men's Triples League",
      seasons: [{ name: '2025-26', createdAt: '2025-09-01T00:00:00Z' }],
      extra: { contact: 'Dave' }
    })
  })

  test('rejects non-object input entirely', () => {
    expect(parseLeagueMetaInput('not even an object')).toBeNull()
    expect(parseLeagueMetaInput(undefined)).toBeNull()
    expect(parseLeagueMetaInput(null)).toBeNull()
  })

  test('drops unusable fields instead of failing the file', () => {
    const input = parseLeagueMetaInput({
      name: 42,
      seasons: [{ name: '2025-26' }, { noName: true }, 'junk'],
      extra: 'junk'
    })
    expect(input).toEqual({ name: '', seasons: [{ name: '2025-26' }], extra: {} })
  })
})

describe('healMeta', () => {
  test('builds fresh meta from scan facts when none exists', () => {
    const meta = healMeta(null, scan)
    expect(meta).toEqual({
      schemaVersion: 1,
      name: 'Mens Triples',
      day: 'monday',
      seasons: [
        { name: '2024-25', type: 'cross-year', status: 'previous' },
        { name: '2025-26', type: 'cross-year', status: 'active' }
      ],
      archivedSeasons: ['2023-24'],
      extra: {}
    })
  })

  test('marks the newest season active regardless of scan order', () => {
    const meta = healMeta(null, {
      ...scan,
      liveSeasons: [parseSeasonName('2025-26')!, parseSeasonName('2024-25')!]
    })
    expect(meta.seasons.at(-1)).toMatchObject({ name: '2025-26', status: 'active' })
  })

  test('marks seasons older than the newest two as live', () => {
    const meta = healMeta(null, {
      ...scan,
      liveSeasons: [
        parseSeasonName('2023-24')!,
        parseSeasonName('2024-25')!,
        parseSeasonName('2025-26')!
      ]
    })
    expect(meta.seasons.map((s) => s.status)).toEqual(['live', 'previous', 'active'])
  })

  test('preserves display name and extra from existing meta', () => {
    const existing = parseLeagueMetaInput({
      schemaVersion: 1,
      name: "Men's Triples League",
      day: 'monday',
      seasons: [],
      archivedSeasons: [],
      extra: { contact: 'Dave' }
    })
    const meta = healMeta(existing, scan)
    expect(meta.name).toBe("Men's Triples League")
    expect(meta.extra).toEqual({ contact: 'Dave' })
  })

  test('scan truth overrides stale seasons and archives in existing meta', () => {
    const existing = parseLeagueMetaInput({
      schemaVersion: 1,
      name: 'Mens Triples',
      day: 'monday',
      seasons: [{ name: '2019-20', type: 'cross-year', status: 'active' }],
      archivedSeasons: ['2018-19'],
      extra: {}
    })
    const meta = healMeta(existing, scan)
    expect(meta.seasons.map((s) => s.name)).toEqual(['2024-25', '2025-26'])
    expect(meta.archivedSeasons).toEqual(['2023-24'])
  })

  test('preserves createdAt for seasons that still exist', () => {
    const existing = parseLeagueMetaInput({
      schemaVersion: 1,
      name: 'Mens Triples',
      day: 'monday',
      seasons: [
        { name: '2025-26', type: 'cross-year', status: 'active', createdAt: '2025-09-01T00:00:00Z' }
      ],
      archivedSeasons: [],
      extra: {}
    })
    const meta = healMeta(existing, scan)
    expect(meta.seasons.find((s) => s.name === '2025-26')?.createdAt).toBe('2025-09-01T00:00:00Z')
  })

  test('recovers from malformed existing meta', () => {
    expect(healMeta(parseLeagueMetaInput('not even an object'), scan).name).toBe('Mens Triples')
    expect(healMeta(parseLeagueMetaInput({ name: 42 }), scan).name).toBe('Mens Triples')
  })

  test('a league with no live seasons yields an empty seasons list', () => {
    const meta = healMeta(null, { ...scan, liveSeasons: [], archivedSeasons: [] })
    expect(meta.seasons).toEqual([])
  })
})
