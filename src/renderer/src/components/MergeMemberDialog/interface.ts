import type { Member, MembersSnapshot } from '@shared/members'

export interface Props {
  snapshot: MembersSnapshot
  /** The member being merged away; null keeps the dialog mounted but idle. */
  member: Member | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onMerged: () => void
}
