import type { ReactNode } from 'react'

export interface Props {
  name: string
  heading: string
  readOnly: boolean
  query: string
  filterLabel: string
  onQueryChange: (value: string) => void
  onFilterTab: () => boolean
  onRefresh: () => void
  onDropFiles?: (paths: string[]) => void | Promise<void>
  actions?: ReactNode
  summary: string
  selection?: string
  children: ReactNode
}
