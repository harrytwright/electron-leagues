import type { LeaguesTree } from '@shared/tree'
import type { Selection } from '@renderer/lib/selection'

export type Props = {
  tree: LeaguesTree
  selection: Selection
  onSelect: (selection: Selection) => void
}
