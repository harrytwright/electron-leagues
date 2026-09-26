import { use } from 'react'
import {
  OperationFeedbackContext,
  type OperationFeedback
} from '@renderer/contexts/OperationFeedbackContext'

export function useOperationFeedback(): OperationFeedback {
  const value = use(OperationFeedbackContext)
  if (!value) throw new Error('useOperationFeedback must be used inside OperationFeedbackProvider')
  return value
}
