import { useState } from 'react'
import { Button, Dialog } from '@cloudflare/kumo'
import { TaskDialog } from '../TaskDialog'
import type { DraftSubject, Props } from './interface'

interface Wording {
  title: string
  description: string
}

function wording(subject: DraftSubject | null): Wording {
  if (subject?.kind === 'edit') {
    return {
      title: `Discard changes to ${subject.name}?`,
      description: 'Their record keeps the details it had before you started editing.'
    }
  }
  if (subject?.kind === 'merge') {
    return {
      title: 'Discard the merge?',
      description: 'No records are changed; the merge can be started again from a row’s menu.'
    }
  }
  return {
    title: 'Discard the new member?',
    description: 'Nothing has been saved, so nobody is added to the list.'
  }
}

function sameSubject(a: DraftSubject | null, b: DraftSubject | null): boolean {
  if (a === null || b === null) return a === b
  if (a.kind === 'edit' && b.kind === 'edit') return a.name === b.name
  return a.kind === b.kind
}

/** Asks before an unsaved form or merge is replaced; Keep editing is the safe default. */
export function DiscardDraftDialog({
  subject,
  open,
  onOpenChange,
  onDiscard
}: Props): React.JSX.Element {
  // The wording is kept through the closing fade, when the pane it named has already gone.
  const [shown, setShown] = useState(subject)
  if (subject && !sameSubject(subject, shown)) setShown(subject)
  const { title, description } = wording(shown)

  return (
    <TaskDialog open={open} onOpenChange={onOpenChange}>
      <TaskDialog.Header title={title} description={description} />
      <TaskDialog.Body
        onSubmit={(event) => {
          event.preventDefault()
          onDiscard()
        }}
      >
        <TaskDialog.Actions>
          <Dialog.Close
            render={(props) => (
              <Button {...props} type="button" variant="secondary">
                Keep editing
              </Button>
            )}
          />
          <Button type="submit" variant="destructive">
            Discard
          </Button>
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}
