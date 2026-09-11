import { createContext, use } from 'react'

export type ChooseRootMode = 'select' | 'init'
export type RefreshResult = 'ready' | 'no-root' | 'error' | 'superseded'
type RefreshLocation = () => Promise<RefreshResult>

export interface SwitchOptions {
  root: string
  onChanged: RefreshLocation
  onMissingRecent?: () => void | Promise<void>
}

export interface LocationOperation {
  busy: boolean
  choose: (mode: ChooseRootMode, onChanged: RefreshLocation) => Promise<void>
  switchTo: (path: string, options: SwitchOptions) => Promise<void>
}

export const LocationOperationContext = createContext<LocationOperation | null>(null)

export function useLocationOperation(): LocationOperation {
  const value = use(LocationOperationContext)
  if (!value) throw new Error('useLocationOperation must be used inside LocationOperationProvider')
  return value
}
