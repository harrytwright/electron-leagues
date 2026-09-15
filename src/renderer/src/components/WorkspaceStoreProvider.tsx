import type { ReactNode } from 'react'
import { WorkspaceStoreContext } from '@renderer/hooks/use-workspace'
import type { WorkspaceStore } from '@renderer/lib/workspace-store'

export function WorkspaceStoreProvider({
  store,
  children
}: {
  store: WorkspaceStore
  children: ReactNode
}): React.JSX.Element {
  return <WorkspaceStoreContext value={store}>{children}</WorkspaceStoreContext>
}
