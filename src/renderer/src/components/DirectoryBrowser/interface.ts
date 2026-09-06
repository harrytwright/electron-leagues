import type { DirListing } from '@renderer/hooks/use-dir-listing'
import type { BrowserRow } from '../FileBrowser/row'
import type { BackAction } from '../FileBrowser/interface'

export type { BrowserRow } from '../FileBrowser/row'

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
