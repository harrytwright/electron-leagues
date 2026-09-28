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
