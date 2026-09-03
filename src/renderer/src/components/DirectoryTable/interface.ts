import type { ReactNode } from 'react'

export interface RowMenuItem {
  label: string
  variant?: 'default' | 'danger'
  disabled?: boolean
  onSelect: () => void
}

export interface DirectoryRow {
  key: string
  name: string
  kind: 'file' | 'folder'
  path: string
  /** Epoch ms; omitted for synthetic rows, which show "—". */
  mtime?: number
  badge?: ReactNode
  /** Shown after the built-in Open / reveal actions. */
  menuItems?: RowMenuItem[]
}

export interface Props {
  rows: DirectoryRow[]
  /** Folder rows navigate here; without it they reveal in the file manager. */
  onNavigate?: (row: DirectoryRow) => void
  /** Enables the drop target; receives absolute paths of the dropped files. */
  onDropFiles?: (paths: string[]) => void | Promise<void>
  emptyTitle?: string
  emptyDescription?: string
  'aria-label': string
}

export interface RowMenuProps {
  row: DirectoryRow
}
