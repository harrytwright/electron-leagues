import type { WorkspaceStorage } from '../lib/workspace-store'

/**
 * Adapts the browser's real `localStorage` to `WorkspaceStorage`, for specs that seed legacy
 * keys directly or assert against the persisted envelope.
 */
export function createLocalStorageWorkspaceStorage(): WorkspaceStorage {
  return {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
    keys: () => Object.keys(localStorage)
  }
}
