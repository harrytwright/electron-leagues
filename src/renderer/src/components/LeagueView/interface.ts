import type { LeagueNode } from '@shared/tree'

export interface Props {
  league: LeagueNode
  /** Something on disk changed (import, zip, delete, new season); the caller rescans. */
  onChanged: () => void | Promise<void>
  /** The visible folder changed through this view's own navigation. */
  onCurrentDirChange: (path: string) => void
}
