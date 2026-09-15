import { createContext, use } from 'react'

export type ChooseRootMode = 'select' | 'init'
export interface LocationOperation {
  busy: boolean
  choose(mode: ChooseRootMode): Promise<void>
  switchTo(path: string): Promise<void>
  forget(): Promise<void>
}

export const LocationOperationContext = createContext<LocationOperation | null>(null)

export function useLocationOperation(): LocationOperation {
  const value = use(LocationOperationContext)
  if (!value) throw new Error('useLocationOperation must be used inside LocationOperationProvider')
  return value
}
