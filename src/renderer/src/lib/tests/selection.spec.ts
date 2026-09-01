import { describe, expect, test } from 'vitest'
import { makeLeague, makeTree } from '../../tests/fixtures'
import { findLeague, restoreSelection } from '../selection'

const tree = makeTree({ days: { ...makeTree().days, monday: [makeLeague()] } })

describe('restoreSelection', () => {
  test('keeps a remembered league that still exists', () => {
    const stored = { kind: 'league' as const, day: 'monday' as const, folderName: 'Mixed triples' }
    expect(restoreSelection(tree, stored)).toEqual(stored)
  })

  test('falls back to home when the league is gone or the day changed', () => {
    expect(
      restoreSelection(tree, { kind: 'league', day: 'monday', folderName: 'Deleted' })
    ).toEqual({ kind: 'home' })
    expect(
      restoreSelection(tree, { kind: 'league', day: 'tuesday', folderName: 'Mixed triples' })
    ).toEqual({ kind: 'home' })
  })

  test('falls back to home with nothing remembered', () => {
    expect(restoreSelection(tree, null)).toEqual({ kind: 'home' })
    expect(restoreSelection(tree, { kind: 'home' })).toEqual({ kind: 'home' })
  })
})

describe('findLeague', () => {
  test('resolves a league selection against the tree', () => {
    expect(
      findLeague(tree, { kind: 'league', day: 'monday', folderName: 'Mixed triples' })?.meta.name
    ).toBe('Mixed triples')
    expect(findLeague(tree, { kind: 'league', day: 'monday', folderName: 'Nope' })).toBeNull()
    expect(findLeague(tree, { kind: 'home' })).toBeNull()
  })
})
