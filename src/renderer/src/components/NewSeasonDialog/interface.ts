import type { SeasonType } from '@shared/season'
import type { LeagueNode } from '@shared/tree'

export interface SeasonTypeOption {
  value: SeasonType
  label: string
  example: string
}

/** Present only where the location has the members database enabled. */
export interface RosterOptions {
  /** The previous season's players per team, when it has a season file. */
  defaultFormat?: number
}

export interface NewSeasonDialogProps {
  league: LeagueNode
  /** null keeps the dialog to documents only. */
  roster?: RosterOptions | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export type Props = NewSeasonDialogProps
