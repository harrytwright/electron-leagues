import type { LeagueNode } from '@shared/tree'
import type { Weekday } from '@shared/weekday'

export interface RenameLeagueDialogProps {
  league: LeagueNode
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The league now lives under `folderName`; reselect it so the view follows the rename. */
  onRenamed: (day: Weekday, folderName: string) => void
}

export type Props = RenameLeagueDialogProps
