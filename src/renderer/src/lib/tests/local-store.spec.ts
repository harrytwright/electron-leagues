import { describe, expect, test } from 'vitest'
import { loadCollapsedDays, loadSelection, saveCollapsedDays, saveSelection } from '../local-store'

describe('selection memory', () => {
  test('round-trips per location', () => {
    saveSelection('/a', { kind: 'league', day: 'monday', folderName: 'Mixed triples' })
    saveSelection('/b', { kind: 'home' })
    expect(loadSelection('/a')).toEqual({
      kind: 'league',
      day: 'monday',
      folderName: 'Mixed triples'
    })
    expect(loadSelection('/b')).toEqual({ kind: 'home' })
    expect(loadSelection('/c')).toBeNull()
  })

  test('ignores unparseable or wrongly shaped values', () => {
    localStorage.setItem('leagues:/a:selection', '{not json')
    expect(loadSelection('/a')).toBeNull()
    localStorage.setItem('leagues:/a:selection', JSON.stringify({ kind: 'shared' }))
    expect(loadSelection('/a')).toBeNull()
    localStorage.setItem(
      'leagues:/a:selection',
      JSON.stringify({ kind: 'league', day: 'someday', folderName: 'x' })
    )
    expect(loadSelection('/a')).toBeNull()
  })
})

describe('collapsed days memory', () => {
  test('defaults to nothing collapsed', () => {
    expect(loadCollapsedDays('/a')).toEqual([])
  })

  test('round-trips and drops unknown days', () => {
    saveCollapsedDays('/a', ['monday', 'friday'])
    expect(loadCollapsedDays('/a')).toEqual(['monday', 'friday'])
    localStorage.setItem('leagues:/a:collapsed-days', JSON.stringify(['monday', 'funday']))
    expect(loadCollapsedDays('/a')).toEqual([])
  })
})
