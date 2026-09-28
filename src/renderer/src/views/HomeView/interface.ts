import type { LeaguesTree } from '@shared/tree'
import type { Selection } from '@renderer/lib/selection'

export interface Props {
  tree: LeaguesTree
  onSelect: (selection: Selection) => void
  /** The folder visible in Home changed, for the application status bar. */
  onCurrentDirChange: (path: string) => void
}
