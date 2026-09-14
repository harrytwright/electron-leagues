import type { LeagueNode } from '@shared/tree'

export interface Props {
  league: LeagueNode
  /** The visible folder changed through this view's own navigation. */
  onCurrentDirChange: (path: string) => void
}
