import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { DiscardDraftDialog } from './index'
import type { DraftSubject } from './interface'

function Harness(): React.JSX.Element {
  const [subject, setSubject] = useState<DraftSubject | null>({ kind: 'edit', name: 'Ann Lee' })
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setSubject({ kind: 'edit', name: 'Bob Kay' })}>
        Switch subject while open
      </button>
      <button
        type="button"
        onClick={() => {
          // Discard closes this prompt and opens a differently worded one in the same update,
          // the way MembersView opens the next pane straight from discardDraft.
          setOpen(false)
          setSubject({ kind: 'new' })
        }}
      >
        Discard then open a new member
      </button>
      <DiscardDraftDialog
        subject={subject}
        open={open}
        onOpenChange={setOpen}
        onDiscard={() => {}}
      />
    </>
  )
}

it('updates its wording immediately when the subject changes while still open', () => {
  render(<Harness />)
  // The dialog is modal, so the harness's own buttons are inert; a text query still
  // finds them behind it, where a role query correctly would not.
  fireEvent.click(screen.getByText('Switch subject while open'))
  expect(screen.getByText('Discard changes to Bob Kay?')).toBeInTheDocument()
})

it('keeps its wording steady through the closing fade, rather than flipping to the next pane', async () => {
  render(<Harness />)
  expect(screen.getByText('Discard changes to Ann Lee?')).toBeInTheDocument()

  fireEvent.click(screen.getByText('Discard then open a new member'))

  // Still fading out; the title must stay the one this prompt opened with.
  expect(screen.getByText('Discard changes to Ann Lee?')).toBeInTheDocument()
  expect(screen.queryByText('Discard the new member?')).not.toBeInTheDocument()

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})
