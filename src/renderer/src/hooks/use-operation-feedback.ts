import { createContext, use, type ReactNode } from 'react'

export type OperationResult = 'success' | 'error'

export interface OperationActivity {
  id: number
  label: string
  state: 'pending' | OperationResult
  message?: string
}

export interface OperationFeedback {
  activity: OperationActivity | null
  begin: (label: string) => number
  finish: (id: number, result: OperationResult, message?: string) => void
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
