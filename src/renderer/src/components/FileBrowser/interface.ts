import type { ReactNode } from 'react'
import type { FileEntry } from '@shared/tree'

export interface FrameProps {
  name: string
  heading: string
  readOnly: boolean
  query: string
  filterLabel: string
  onQueryChange: (value: string) => void
  onRefresh: () => void
  onDropFiles?: (paths: string[]) => void | Promise<void>
  actions?: ReactNode
  summary: string
  selection?: string
  children: ReactNode
}

export interface EntryIconProps {
  entry: FileEntry
  expanded?: boolean
}
