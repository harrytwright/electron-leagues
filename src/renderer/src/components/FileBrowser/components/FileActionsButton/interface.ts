import type { MouseEventHandler } from 'react'

export interface Props {
  name: string
  menuId: string
  expanded: boolean
  onClick: MouseEventHandler<HTMLButtonElement>
}
