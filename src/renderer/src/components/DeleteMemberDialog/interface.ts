import type { Member, MembersSnapshot } from '@shared/members'

export interface Props {
  snapshot: MembersSnapshot
  member: Member | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}
