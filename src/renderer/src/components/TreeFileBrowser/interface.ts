import type { ReactNode } from 'react'
import type { DirEntry } from '@shared/tree'
import type { Crumb } from '@renderer/lib/crumb'
import type { DirListing } from '@renderer/hooks/use-dir-listing'
import type { TreeFolders } from '@renderer/hooks/use-tree-folders'
import type { BackAction } from '../FileBrowser/interface'

export interface Props {
  currentDir: string
  name: string
  listing: DirListing
  tree: TreeFolders
  sort: Sort
  onSortChange: (sort: Sort) => void
  readOnly: boolean
  onNavigate: (folders: Crumb[], focusFirstRow: boolean) => void
  consumeFocusRequest?: (currentDir: string) => boolean
  onDropFiles?: (paths: string[]) => void | Promise<void>
  onBack: BackAction
  /** App output listed at the top level before it exists; opening it creates it, so it shows no date. */
  pendingEntries?: DirEntry[]
  /** A badge or a different open action for a top-level row the app knows about. */
  decorate?: (entry: DirEntry) => RowDecoration | undefined
}

export interface RowDecoration {
  badge?: ReactNode
  open?: () => Promise<void>
}

export type SortColumn = 'name' | 'type' | 'mtime'

export interface Sort {
  column: SortColumn
  direction: 'ascending' | 'descending'
}

export interface FileRow {
  entry: DirEntry
  ancestors: DirEntry[]
  expanded: boolean
  position: number
  siblings: number
}
