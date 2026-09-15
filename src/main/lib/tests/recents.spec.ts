import { describe, expect, test } from 'vitest'
import { MAX_RECENT_ROOTS, pruneRecents, seedRecents, updateRecents } from '../recents'

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

describe('seedRecents', () => {
  test('keeps an existing list untouched', () => {
    expect(seedRecents(['/a'], '/b')).toEqual(['/a'])
    expect(seedRecents([], '/b')).toEqual([])
  })

  test('starts from the current root when no list was ever stored', () => {
    expect(seedRecents(undefined, '/b')).toEqual(['/b'])
    expect(seedRecents(undefined, undefined)).toEqual([])
  })
})

describe('pruneRecents', () => {
  test('drops missing roots but keeps unreachable ones', async () => {
    const pruned = await pruneRecents(['/dir', '/gone', '/usb'], async (path) =>
      path === '/dir' ? 'dir' : path === '/gone' ? 'missing' : 'unavailable'
    )
    expect(pruned).toEqual(['/dir', '/usb'])
  })
})
