import type { LeaguesTree } from '@shared/tree'
import type { Selection } from '@renderer/lib/selection'

export interface Props {
  tree: LeaguesTree
  onSelect: (selection: Selection) => void
  /** A write completed; rejects when the follow-up scan cannot refresh the view. */
  onChanged: () => void | Promise<void>
  /** Separate so ordinary refresh cannot inherit post-write rejection semantics. */
  onRefresh: () => void | Promise<void>
  /** The folder visible in Home changed, for the application status bar. */
  onCurrentDirChange: (path: string) => void
}
