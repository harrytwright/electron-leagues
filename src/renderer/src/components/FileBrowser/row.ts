import type { ReactNode } from 'react'

export interface RowMenuItem {
  label: string
  separatorBefore?: boolean
  variant?: 'default' | 'danger'
  disabled?: boolean
  onSelect: () => void
}

export interface BrowserRow {
  key: string
  name: string
  kind: 'file' | 'folder'
  path: string
  /** Epoch ms; omitted for synthetic rows, which show "—". */
  mtime?: number
  badge?: ReactNode
  /** Shown after the built-in Open / reveal actions. */
  menuItems?: RowMenuItem[]
  typeLabel?: string
  contents?: string
}
