import type { SeasonType } from '@shared/season'
import type { LeagueNode } from '@shared/tree'

export interface SeasonTypeOption {
  value: SeasonType
  label: string
  example: string
}

export const SOURCES = ['templates', 'previous', 'empty'] as const

export type Source = (typeof SOURCES)[number]

export interface NewSeasonDialogProps {
  league: LeagueNode
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export type Props = NewSeasonDialogProps
