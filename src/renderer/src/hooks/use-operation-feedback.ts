import { createContext, use, type ReactNode } from 'react'

export type OperationScope = 'application' | 'location'

export interface OperationActivity {
  id: number
  label: string
}

export interface OperationFeedback {
  activity: OperationActivity | null
  begin: (label: string, scope?: OperationScope) => number
  finish: (id: number) => void
}

export const OperationFeedbackContext = createContext<OperationFeedback | null>(null)

export function useOperationFeedback(): OperationFeedback {
  const value = use(OperationFeedbackContext)
  if (!value) throw new Error('useOperationFeedback must be used inside OperationFeedbackProvider')
  return value
}

export interface OperationFeedbackProviderProps {
  children: ReactNode
  locationKey?: string
}
