import { createContext } from 'react'
import type { WorkspaceStore } from './interface'

export const WorkspaceStoreContext = createContext<WorkspaceStore | null>(null)
