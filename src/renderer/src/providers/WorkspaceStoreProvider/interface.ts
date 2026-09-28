import type { ReactNode } from 'react'
import type { WorkspaceStore } from '@renderer/contexts/WorkspaceStoreContext'

export interface Props {
  store: WorkspaceStore
  children: ReactNode
}
