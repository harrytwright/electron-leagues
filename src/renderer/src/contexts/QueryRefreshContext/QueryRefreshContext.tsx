import { createContext } from 'react'
import type { RefreshCoordinator } from './interface'

export const QueryRefreshContext = createContext<RefreshCoordinator | null>(null)
