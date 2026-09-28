import { createContext } from 'react'
import type { LocationOperation } from './interface'

export const LocationOperationContext = createContext<LocationOperation | null>(null)
