import type { ReactNode, RefObject } from 'react'

export interface Props {
  name: string
  heading: string
  readOnly: boolean
  query: string
  filterLabel: string
  filterRef: RefObject<HTMLInputElement | null>
  onQueryChange: (value: string) => void
  onRefresh: () => void
  onDropFiles?: (paths: string[]) => void | Promise<void>
  actions?: ReactNode
  summary: string
  selection?: string
  children: ReactNode
}
