export const WORKFLOW_IDS = ['templates', 'previous'] as const

export type WorkflowId = (typeof WORKFLOW_IDS)[number]

export function isWorkflowId(value: string): value is WorkflowId {
  return WORKFLOW_IDS.some((id) => id === value)
}
