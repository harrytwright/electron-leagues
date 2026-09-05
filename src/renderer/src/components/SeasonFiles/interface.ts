import type { DirEntry } from '@shared/tree'
import type { Crumb } from '@renderer/lib/crumb'
import type { DirListing } from '@renderer/lib/use-dir-listing'

export interface Props {
  name: string
  listing: DirListing
  readOnly: boolean
  onNavigate: (folders: Crumb[]) => void
  onDropFiles?: (paths: string[]) => void | Promise<void>
  onBack: { label: string; action: () => void }
}

export interface Branch {
  entries: DirEntry[] | null
  error: string | null
}

export interface TreeFolders {
  branches: Map<string, Branch>
  expanded: Set<string>
  toggle: (path: string) => void
  collapse: () => void
  reload: () => void
  load: (path: string) => Promise<void>
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
