import type { LeagueNode } from '@shared/tree'
import type { Weekday } from '@shared/weekday'

export interface Props {
  league: LeagueNode
  /** The visible folder changed through this view's own navigation. */
  onCurrentDirChange: (path: string) => void
  /** The league was renamed and may now live under a different folder name. */
  onRenamed: (day: Weekday, folderName: string) => void
}
