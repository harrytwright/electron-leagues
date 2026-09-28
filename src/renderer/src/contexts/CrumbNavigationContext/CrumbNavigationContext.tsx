import { createContext } from 'react'
import type { CrumbNavigation } from './interface'

export const CrumbNavigationContext = createContext<CrumbNavigation>(() => {})
