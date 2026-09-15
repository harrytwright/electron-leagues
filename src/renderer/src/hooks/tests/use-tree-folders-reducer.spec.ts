import { expect, it } from 'vitest'
import { treeFoldersReducer, type TreeFoldersState } from '../use-tree-folders'

const scope = '/leagues/monday/Triples/2025-26'
const inside = `${scope}/Weekly results`
const outside = '/leagues/tuesday/Pairs/2025-26/Weekly results'

function stateWith(overrides: Partial<TreeFoldersState> = {}): TreeFoldersState {
  return {
    scope,
    visited: new Set<string>(),
    expanded: new Set<string>(),
    ...overrides
  }
}

it('navigated prunes paths outside the new scope from both sets', () => {
  const state = stateWith({
    scope: outside,
    visited: new Set([inside, outside]),
    expanded: new Set([inside, outside])
  })

  const next = treeFoldersReducer(state, { type: 'navigated', scope })

  expect([...next.visited]).toEqual([inside])
  expect([...next.expanded]).toEqual([inside])
  expect(next.scope).toBe(scope)
})

it('navigated to the same scope returns the same state object', () => {
  const state = stateWith({ visited: new Set([inside]), expanded: new Set([inside]) })

  expect(treeFoldersReducer(state, { type: 'navigated', scope })).toBe(state)
})

it('visited adds a path only to the visited set', () => {
  const state = stateWith()

  const next = treeFoldersReducer(state, { type: 'visited', path: inside })

  expect([...next.visited]).toEqual([inside])
  expect(next.expanded.size).toBe(0)
})

it('visited for an already visited path returns the same state object', () => {
  const state = stateWith({ visited: new Set([inside]) })

  expect(treeFoldersReducer(state, { type: 'visited', path: inside })).toBe(state)
})

it('opened adds the path to both visited and expanded', () => {
  const state = stateWith()

  const next = treeFoldersReducer(state, { type: 'opened', path: inside })

  expect([...next.visited]).toEqual([inside])
  expect([...next.expanded]).toEqual([inside])
})

it('opened an already open path returns the same state object', () => {
  const state = stateWith({ visited: new Set([inside]), expanded: new Set([inside]) })

  expect(treeFoldersReducer(state, { type: 'opened', path: inside })).toBe(state)
})

it('closed keeps the path visited but removes it from expanded', () => {
  const state = stateWith({ visited: new Set([inside]), expanded: new Set([inside]) })

  const next = treeFoldersReducer(state, { type: 'closed', path: inside })

  expect([...next.visited]).toEqual([inside])
  expect(next.expanded.size).toBe(0)
})

it('closed for a path that was never expanded returns the same state object', () => {
  const state = stateWith({ visited: new Set([inside]) })

  expect(treeFoldersReducer(state, { type: 'closed', path: inside })).toBe(state)
})

it('collapsed clears expanded but keeps visited', () => {
  const state = stateWith({ visited: new Set([inside]), expanded: new Set([inside]) })

  const next = treeFoldersReducer(state, { type: 'collapsed' })

  expect([...next.visited]).toEqual([inside])
  expect(next.expanded.size).toBe(0)
})

it('collapsed with nothing expanded returns the same state object', () => {
  const state = stateWith({ visited: new Set([inside]) })

  expect(treeFoldersReducer(state, { type: 'collapsed' })).toBe(state)
})
