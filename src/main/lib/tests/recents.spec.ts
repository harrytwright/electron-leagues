import { describe, expect, test } from 'vitest'
import { MAX_RECENT_ROOTS, updateRecents } from '../recents'

describe('updateRecents', () => {
  test('puts the new root first', () => {
    expect(updateRecents(['/a', '/b'], '/c')).toEqual(['/c', '/a', '/b'])
  })

  test('moves an existing root to the front instead of duplicating it', () => {
    expect(updateRecents(['/a', '/b', '/c'], '/b')).toEqual(['/b', '/a', '/c'])
  })

  test('drops the oldest entries past the cap', () => {
    const many = Array.from({ length: MAX_RECENT_ROOTS + 3 }, (_, i) => `/r${i}`)
    expect(updateRecents(many, '/new')).toEqual(['/new', ...many.slice(0, MAX_RECENT_ROOTS - 1)])
  })
})
