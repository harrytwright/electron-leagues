import { describe, expect, test } from 'vitest'
import { isSingleSegment } from '../path-segment'

describe('isSingleSegment', () => {
  test.each(['Pairs', 'Pairs League', '_archives', '..dots'])('accepts %j', (name) => {
    expect(isSingleSegment(name)).toBe(true)
  })

  test.each(['', '.', '..', '../Pairs', 'Pairs/2025', 'Pairs\\2025', 'C:Pairs', 'z:'])(
    'rejects %j',
    (name) => {
      expect(isSingleSegment(name)).toBe(false)
    }
  )
})
