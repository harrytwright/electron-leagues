import { use } from 'react'
import { useStore } from 'zustand'
import { WorkspaceStoreContext } from '@renderer/contexts/WorkspaceStoreContext'
import type { WorkspaceState } from '@renderer/lib/workspace-store'

export function useWorkspace<T>(selector: (state: WorkspaceState) => T): T {
  const store = use(WorkspaceStoreContext)
  if (!store) throw new Error('useWorkspace must be used inside WorkspaceStoreProvider')
  return useStore(store, selector)
}
