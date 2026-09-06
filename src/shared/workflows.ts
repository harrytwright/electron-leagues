export const WORKFLOW_IDS = ['templates', 'previous', 'empty'] as const

export type WorkflowId = (typeof WORKFLOW_IDS)[number]

export interface WorkflowDefinition {
  id: WorkflowId
  label: string
  description: string
}

export const WORKFLOWS: Record<WorkflowId, WorkflowDefinition> = {
  templates: {
    id: 'templates',
    label: 'Copy from templates',
    description: 'Copy every template into the new season.'
  },
  previous: {
    id: 'previous',
    label: 'Copy from previous season',
    description: 'Copy the previous season, then add any newly available templates.'
  },
  empty: {
    id: 'empty',
    label: 'Start empty',
    description: 'Create the season without documents.'
  }
}

/** The creation form owns the available workflows and their display order. */
export const NEW_SEASON_WORKFLOWS: readonly WorkflowId[] = ['templates', 'previous', 'empty']

export const RUNNING_SEASON_WORKFLOWS: readonly WorkflowId[] = NEW_SEASON_WORKFLOWS

export const STOPPED_SEASON_WORKFLOWS: readonly WorkflowId[] = ['templates', 'empty']

export function isWorkflowId(value: string): value is WorkflowId {
  return WORKFLOW_IDS.some((id) => id === value)
}
