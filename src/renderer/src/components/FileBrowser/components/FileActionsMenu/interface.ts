import type { ReactNode } from 'react'

export interface Props {
  name: string
  onOpen: () => void
  onReveal: () => void
  children?: ReactNode
}
