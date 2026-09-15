import { describe, expect, test } from 'vitest'
import { createWorkspaceStore, type WorkspaceStorage } from '../workspace-store'
import { createMemoryWorkspaceStorage } from '../../tests/memory-workspace-storage'
import { parseWorkspaceEnvelope, type WorkspaceEnvelope } from '../../tests/workspace-envelope'

function readEnvelope(storage: WorkspaceStorage): WorkspaceEnvelope | null {
  const raw = storage.getItem('leagues:workspace')
  return raw === null ? null : parseWorkspaceEnvelope(raw)
}

describe('per-root memory', () => {
  test('keeps root A and root B independent', () => {
    const store = createWorkspaceStore({ storage: createMemoryWorkspaceStorage() })

    store.getState().setRoot('/a')
    store.getState().select({ kind: 'league', day: 'monday', folderName: 'Mixed triples' })
    store.getState().setCollapsedDays(['monday'])
    store.getState().setRoot('/b')
    store.getState().select({ kind: 'home' })
    store.getState().setCollapsedDays(['friday'])

    const { locations } = store.getState()
    expect(locations['/a']).toEqual({
      selection: { kind: 'league', day: 'monday', folderName: 'Mixed triples' },
      collapsedDays: ['monday']
    })
    expect(locations['/b']).toEqual({ selection: { kind: 'home' }, collapsedDays: ['friday'] })
  })

  test('round-trips collapsed days, including un-collapsing', () => {
    const store = createWorkspaceStore({ storage: createMemoryWorkspaceStorage() })
    store.getState().setRoot('/a')

    store.getState().setCollapsedDays(['monday'])
    store.getState().setCollapsedDays(['monday', 'friday'])
    expect(store.getState().locations['/a'].collapsedDays).toEqual(['monday', 'friday'])

    store.getState().setCollapsedDays(['friday'])
    expect(store.getState().locations['/a'].collapsedDays).toEqual(['friday'])
  })
})

describe('legacy migration', () => {
  test('migrates leagues:<root>:selection and leagues:<root>:collapsed-days at creation', () => {
    const storage = createMemoryWorkspaceStorage()
    storage.setItem(
      'leagues:/a:selection',
      JSON.stringify({ kind: 'league', day: 'monday', folderName: 'Mixed triples' })
    )
    storage.setItem('leagues:/a:collapsed-days', JSON.stringify(['monday', 'friday']))

    const store = createWorkspaceStore({ storage })

    expect(store.getState().locations['/a']).toEqual({
      selection: { kind: 'league', day: 'monday', folderName: 'Mixed triples' },
      collapsedDays: ['monday', 'friday']
    })
  })

  test('leaves the legacy keys in place after migrating', () => {
    const storage = createMemoryWorkspaceStorage()
    storage.setItem('leagues:/a:selection', JSON.stringify({ kind: 'home' }))

    createWorkspaceStore({ storage })

    expect(storage.getItem('leagues:/a:selection')).toBe(JSON.stringify({ kind: 'home' }))
  })

  test('a valid new-format record always wins over legacy keys for the same root', () => {
    const storage = createMemoryWorkspaceStorage()
    storage.setItem(
      'leagues:workspace',
      JSON.stringify({
        state: {
          locations: {
            '/a': { selection: { kind: 'home' }, collapsedDays: ['friday'] }
          }
        },
        version: 1
      })
    )
    storage.setItem(
      'leagues:/a:selection',
      JSON.stringify({ kind: 'league', day: 'monday', folderName: 'Mixed triples' })
    )
    storage.setItem('leagues:/a:collapsed-days', JSON.stringify(['monday']))

    const store = createWorkspaceStore({ storage })

    expect(store.getState().locations['/a']).toEqual({
      selection: { kind: 'home' },
      collapsedDays: ['friday']
    })
  })

  test('migrates a root missing from the new envelope alongside one already present', () => {
    const storage = createMemoryWorkspaceStorage()
    storage.setItem(
      'leagues:workspace',
      JSON.stringify({
        state: { locations: { '/a': { selection: { kind: 'home' }, collapsedDays: [] } } },
        version: 1
      })
    )
    storage.setItem('leagues:/b:selection', JSON.stringify({ kind: 'home' }))

    const store = createWorkspaceStore({ storage })

    expect(Object.keys(store.getState().locations).sort()).toEqual(['/a', '/b'])
  })

  test('ignores an unparseable or wrongly shaped legacy value for one root', () => {
    const storage = createMemoryWorkspaceStorage()
    storage.setItem('leagues:/a:selection', '{not json')
    storage.setItem('leagues:/b:selection', JSON.stringify({ kind: 'shared' }))
    storage.setItem(
      'leagues:/c:collapsed-days',
      JSON.stringify(['monday', 'someday-not-a-weekday'])
    )

    const store = createWorkspaceStore({ storage })

    expect(store.getState().locations['/a']).toBeUndefined()
    expect(store.getState().locations['/b']).toBeUndefined()
    expect(store.getState().locations['/c']).toBeUndefined()
  })
})

describe('persisted state validation', () => {
  test('falls back to defaults on corrupt JSON', () => {
    const storage = createMemoryWorkspaceStorage()
    storage.setItem('leagues:workspace', '{not json')

    const store = createWorkspaceStore({ storage })

    expect(store.getState().locations).toEqual({})
  })

  test('falls back to defaults on a wrongly shaped envelope', () => {
    const storage = createMemoryWorkspaceStorage()
    storage.setItem(
      'leagues:workspace',
      JSON.stringify({ state: { locations: { '/a': { selection: { kind: 'shared' } } } } })
    )

    const store = createWorkspaceStore({ storage })

    expect(store.getState().locations).toEqual({})
  })

  test('falls back to defaults for an unknown persisted version', () => {
    const storage = createMemoryWorkspaceStorage()
    storage.setItem(
      'leagues:workspace',
      JSON.stringify({
        state: {
          locations: { '/a': { selection: { kind: 'home' }, collapsedDays: [] } }
        },
        version: 99
      })
    )

    const store = createWorkspaceStore({ storage })

    expect(store.getState().locations).toEqual({})
  })

  test('persists selections and collapsed days under the new envelope', () => {
    const storage = createMemoryWorkspaceStorage()
    const store = createWorkspaceStore({ storage })

    store.getState().setRoot('/a')
    store.getState().select({ kind: 'league', day: 'monday', folderName: 'Mixed triples' })
    store.getState().setCollapsedDays(['monday'])

    const envelope = readEnvelope(storage)
    expect(envelope?.version).toBe(1)
    expect(envelope?.state.locations['/a']).toEqual({
      selection: { kind: 'league', day: 'monday', folderName: 'Mixed triples' },
      collapsedDays: ['monday']
    })
  })
})

describe('a throwing storage', () => {
  function throwingStorage(): WorkspaceStorage {
    return {
      getItem: () => {
        throw new Error('storage unavailable')
      },
      setItem: () => {
        throw new Error('storage unavailable')
      },
      removeItem: () => {
        throw new Error('storage unavailable')
      },
      keys: () => {
        throw new Error('storage unavailable')
      }
    }
  }

  test('never breaks select or setCollapsedDays', () => {
    const store = createWorkspaceStore({ storage: throwingStorage() })

    expect(() => {
      store.getState().setRoot('/a')
      store.getState().select({ kind: 'league', day: 'monday', folderName: 'Mixed triples' })
      store.getState().setCollapsedDays(['monday'])
    }).not.toThrow()

    expect(store.getState().locations['/a']).toEqual({
      selection: { kind: 'league', day: 'monday', folderName: 'Mixed triples' },
      collapsedDays: ['monday']
    })
  })
})

describe('root and navigation', () => {
  test('setRoot clears both navigation entries in one set()', () => {
    const store = createWorkspaceStore({ storage: createMemoryWorkspaceStorage() })
    store.getState().setRoot('/a')
    store
      .getState()
      .reportLeagueDir({ ownerPath: '/a/monday/Pairs', currentDir: '/a/monday/Pairs' })
    store.getState().reportHomeDir({ ownerRoot: '/a', currentDir: '/a/_shared' })

    store.getState().setRoot('/b')

    expect(store.getState().leagueNavigation).toBeNull()
    expect(store.getState().homeNavigation).toBeNull()
  })

  test('select clears league navigation and clears home navigation for a non-Home selection', () => {
    const store = createWorkspaceStore({ storage: createMemoryWorkspaceStorage() })
    store.getState().setRoot('/a')
    store
      .getState()
      .reportLeagueDir({ ownerPath: '/a/monday/Pairs', currentDir: '/a/monday/Pairs' })
    store.getState().reportHomeDir({ ownerRoot: '/a', currentDir: '/a/_shared' })

    store.getState().select({ kind: 'league', day: 'monday', folderName: 'Pairs' })

    expect(store.getState().leagueNavigation).toBeNull()
    expect(store.getState().homeNavigation).toBeNull()
  })

  test('select keeps home navigation for a Home selection', () => {
    const store = createWorkspaceStore({ storage: createMemoryWorkspaceStorage() })
    store.getState().setRoot('/a')
    store.getState().reportHomeDir({ ownerRoot: '/a', currentDir: '/a/_templates' })

    store.getState().select({ kind: 'home' })

    expect(store.getState().homeNavigation).toEqual({
      ownerRoot: '/a',
      currentDir: '/a/_templates'
    })
  })
})
