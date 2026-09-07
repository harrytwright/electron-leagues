import type { RowMenuItem } from '../../row'

export interface Props {
  id: string
  label: string
  open: boolean
  anchor: { left: number; top: number }
  actions: RowMenuItem[]
  onOpenChange: (open: boolean) => void
}
