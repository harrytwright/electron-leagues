import type { LeagueNode } from '@shared/tree'

export interface Props {
  league: LeagueNode
  /** A write completed; rejects when the follow-up scan cannot refresh the view. */
  onChanged: () => void | Promise<void>
  /** Separate so ordinary refresh cannot inherit post-write rejection semantics. */
  onRefresh: () => void | Promise<void>
  /** The visible folder changed through this view's own navigation. */
  onCurrentDirChange: (path: string) => void
}
