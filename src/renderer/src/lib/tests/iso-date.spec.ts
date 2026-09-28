import { describe, expect, test } from 'vitest'
import { parseIsoDate, toIsoDate } from '../iso-date'

describe('iso-date', () => {
  test('reads a local calendar day and writes it back unchanged', () => {
    const date = parseIsoDate('1990-05-04')
    expect(date).toEqual(new Date(1990, 4, 4))
    expect(toIsoDate(date!)).toBe('1990-05-04')
  })

  test('treats a partial or impossible date as none', () => {
    expect(parseIsoDate('')).toBeUndefined()
    expect(parseIsoDate('1990-05')).toBeUndefined()
    expect(parseIsoDate('1990-02-30')).toBeUndefined()
  })
})
