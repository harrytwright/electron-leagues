import { describe, expect, test } from 'vitest'
import { compareSeasonNames, nextSeasonName, parseSeasonName, suggestSeasonName } from './season'

describe('parseSeasonName', () => {
  test('parses a cross-year season', () => {
    expect(parseSeasonName('2025-26')).toEqual({
      type: 'cross-year',
      name: '2025-26',
      startYear: 2025,
      endYear: 2026
    })
  })

  test('parses a full-year season', () => {
    expect(parseSeasonName('2025')).toEqual({
      type: 'full-year',
      name: '2025',
      startYear: 2025,
      endYear: 2025
    })
  })

  test('parses a quarter season', () => {
    expect(parseSeasonName('2026-Q1')).toEqual({
      type: 'quarter',
      name: '2026-Q1',
      startYear: 2026,
      endYear: 2026,
      quarter: 1
    })
  })

  test('canonicalises a lowercase quarter to uppercase Q', () => {
    expect(parseSeasonName('2026-q3')?.name).toBe('2026-Q3')
  })

  test('rejects a short cross-year form', () => {
    expect(parseSeasonName('25-26')).toBeNull()
  })

  test('rejects a long cross-year form', () => {
    expect(parseSeasonName('2025-2026')).toBeNull()
  })

  test('rejects a cross-year whose second year is not start+1', () => {
    expect(parseSeasonName('2025-27')).toBeNull()
  })

  test('accepts a cross-year spanning a century boundary', () => {
    expect(parseSeasonName('2099-00')).not.toBeNull()
  })

  test('rejects an out-of-range quarter', () => {
    expect(parseSeasonName('2026-Q5')).toBeNull()
  })

  test('rejects arbitrary folder names', () => {
    expect(parseSeasonName('Old Stuff')).toBeNull()
    expect(parseSeasonName('')).toBeNull()
    expect(parseSeasonName('_archive')).toBeNull()
  })
})

describe('nextSeasonName', () => {
  test('increments a cross-year season', () => {
    expect(nextSeasonName(parseSeasonName('2025-26')!).name).toBe('2026-27')
  })

  test('increments a full-year season', () => {
    expect(nextSeasonName(parseSeasonName('2025')!).name).toBe('2026')
  })

  test('increments a mid-year quarter', () => {
    expect(nextSeasonName(parseSeasonName('2026-Q1')!).name).toBe('2026-Q2')
  })

  test('rolls a Q4 quarter into the next year', () => {
    expect(nextSeasonName(parseSeasonName('2026-Q4')!).name).toBe('2027-Q1')
  })
})

describe('suggestSeasonName', () => {
  test('suggests the increment of the current season when types match', () => {
    expect(
      suggestSeasonName('cross-year', parseSeasonName('2025-26')!, new Date('2026-08-01'))
    ).toBe('2026-27')
  })

  test('suggests from the current date when no current season exists', () => {
    expect(suggestSeasonName('full-year', null, new Date('2026-03-15'))).toBe('2026')
  })

  test('suggests a cross-year from the current date when types differ', () => {
    expect(suggestSeasonName('cross-year', parseSeasonName('2025')!, new Date('2026-08-01'))).toBe(
      '2026-27'
    )
  })

  test('suggests the current quarter from the date', () => {
    expect(suggestSeasonName('quarter', null, new Date('2026-05-10'))).toBe('2026-Q2')
  })
})

describe('compareSeasonNames', () => {
  test('orders seasons chronologically by start year then quarter', () => {
    const names = ['2026-Q2', '2024-25', '2026-Q1', '2025', '2026-27']
    const sorted = names
      .map((n) => parseSeasonName(n)!)
      .sort(compareSeasonNames)
      .map((s) => s.name)
    expect(sorted).toEqual(['2024-25', '2025', '2026-Q1', '2026-Q2', '2026-27'])
  })
})
