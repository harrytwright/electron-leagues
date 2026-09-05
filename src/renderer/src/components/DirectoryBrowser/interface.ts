import type { DirListing } from '@renderer/lib/use-dir-listing'
import type { DirectoryRow } from '../DirectoryTable'
import type { BackAction } from '../ListingPanel/interface'

export interface BrowserRow extends DirectoryRow {
  typeLabel?: string
  contents?: string
}

export interface Props {
  name: string
  heading: string
  rows: BrowserRow[]
  metadataColumn: 'contents' | 'modified'
  readOnly: boolean
  listing?: DirListing
  onRefresh: () => void
  onNavigate: (row: BrowserRow) => void
  onDropFiles?: (paths: string[]) => void | Promise<void>
  onBack?: BackAction
  emptyTitle: string
  emptyDescription?: string
}
