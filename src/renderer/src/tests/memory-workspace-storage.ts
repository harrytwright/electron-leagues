import type { WorkspaceStorage } from '../lib/workspace-store'

/** An in-memory `WorkspaceStorage` for specs that need to seed or inspect persisted state. */
export function createMemoryWorkspaceStorage(): WorkspaceStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
    keys: () => [...values.keys()]
  }
}
