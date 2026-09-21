import type { MembersSnapshot } from '@shared/members'

export interface Props {
  snapshot: MembersSnapshot
  open: boolean
  onOpenChange: (open: boolean) => void
  onReset: () => void
}
