import { createContext } from 'react'
import type { OperationFeedback } from './interface'

export const OperationFeedbackContext = createContext<OperationFeedback | null>(null)
