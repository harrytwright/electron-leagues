import type { DirListing } from '@renderer/lib/use-dir-listing'
import type { DirectoryRow } from '../DirectoryTable'

export interface BackAction {
  label: string
  action: () => void
}

export interface Props {
  listing: DirListing
  rows: DirectoryRow[]
  onNavigate: (row: DirectoryRow) => void
  onDropFiles?: (paths: string[]) => void | Promise<void>
  /** Offered beside "Try again" when the folder can't be read. */
  onBack?: BackAction
  emptyTitle?: string
  emptyDescription?: string
  'aria-label': string
}
