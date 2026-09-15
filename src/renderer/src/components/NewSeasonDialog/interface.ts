import type { SeasonType } from '@shared/season'
import type { LeagueNode } from '@shared/tree'
import type { WorkflowId } from '@shared/workflows'

export interface SeasonTypeOption {
  value: SeasonType
  label: string
  example: string
}

export type Source = WorkflowId

export interface NewSeasonDialogProps {
  league: LeagueNode
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export type Props = NewSeasonDialogProps
