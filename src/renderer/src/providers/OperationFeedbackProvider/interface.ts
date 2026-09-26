import type { ReactNode } from 'react'
import type { OperationScope } from '@renderer/contexts/OperationFeedbackContext'

export interface Props {
  children: ReactNode
  locationKey?: string
}

export interface PendingOperation {
  label: string
  scope: OperationScope
}

export interface FeedbackState {
  // Completion belongs to toasts; keeping only pending work prevents two result announcements.
  pending: Map<number, PendingOperation>
}
