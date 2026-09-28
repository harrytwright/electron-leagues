import type { Member, MembersSnapshot } from '@shared/members'

export interface Props {
  snapshot: MembersSnapshot
  /** null creates a new member; otherwise the member being edited. */
  member: Member | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (member: Member) => void
}
