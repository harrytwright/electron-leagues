import { createContext, use } from 'react'
import { useStore } from 'zustand'
import type { WorkspaceState, WorkspaceStore } from '@renderer/lib/workspace-store'

export const WorkspaceStoreContext = createContext<WorkspaceStore | null>(null)

export function useWorkspace<T>(selector: (state: WorkspaceState) => T): T {
  const store = use(WorkspaceStoreContext)
  if (!store) throw new Error('useWorkspace must be used inside WorkspaceStoreProvider')
  return useStore(store, selector)
}
