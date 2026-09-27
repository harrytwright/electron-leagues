/** What the unsaved pane holds, which decides how the prompt names it. */
export type DraftSubject = { kind: 'edit'; name: string } | { kind: 'new' } | { kind: 'merge' }

export interface Props {
  subject: DraftSubject | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDiscard: () => void
}
