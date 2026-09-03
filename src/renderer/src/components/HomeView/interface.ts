import type { ReactNode } from 'react'
import type { LeaguesTree } from '@shared/tree'
import type { Selection } from '@renderer/lib/selection'

export interface Props {
  tree: LeaguesTree
  onSelect: (selection: Selection) => void
  /** May be async — creation waits for the rescan before selecting the new league. */
  onChanged: () => void | Promise<void>
}

export interface SectionProps {
  title: string
  description: string
  children: ReactNode
}
