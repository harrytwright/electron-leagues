import type { SeasonType } from '@shared/season'
import type { LeagueNode } from '@shared/tree'

export interface SeasonTypeOption {
  value: SeasonType
  label: string
  example: string
}

export type Source = 'templates' | 'previous' | 'empty'

export interface NewSeasonDialogProps {
  league: LeagueNode
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export type Props = NewSeasonDialogProps
