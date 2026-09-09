import { useEffect, useRef, useState } from 'react'
import { Button, Dialog, Input, useKumoToastManager } from '@cloudflare/kumo'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { trashLabel } from '@renderer/lib/trash-label'
import { TaskDialog } from '../TaskDialog'
import type { Props } from './interface'
import { useOperationFeedback } from '@renderer/hooks/use-operation-feedback'

/** Names on disk may be NFD (macOS) and display names may carry stray spaces. */
function comparable(value: string): string {
  return value.trim().normalize('NFC')
}

/**
 * Type-the-name-to-confirm dialog in the shape of Kumo's DeleteResource block,
 * but honest about what happens: the folder moves to the OS trash rather than
 * being destroyed, and unmanaged files inside it go along.
 */
export function DeleteResourceDialog({
  target,
  open,
  onOpenChange,
  onDeleted
}: Props): React.JSX.Element {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Bumped on every close so a delete left pending across close/reopen can
  // never write its stale outcome onto the fresh dialog.
  const submission = useRef(0)
  const feedback = useOperationFeedback()
  const { add } = useKumoToastManager()

  useEffect(() => {
    if (open) return
    submission.current += 1
    // Reset on close so nothing stale is visible for the reopening frame.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTyped('')
    setBusy(false)
  }, [open])

  const name = target?.name ?? ''
  const confirmed = name !== '' && comparable(typed) === comparable(name)
  const kind = target?.kind ?? 'league'
  const trash = trashLabel()

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!target || !confirmed || busy) return
    const ticket = submission.current
    const operationId = feedback.begin(`Deleting ${target.name}`)
    setBusy(true)
    try {
      await window.api.trashFolder(target.path)
      feedback.finish(operationId, 'success', `Deleted ${target.name}`)
      add({ title: `Moved “${target.name}” to the ${trash}`, variant: 'success' })
      if (submission.current !== ticket) return
      setBusy(false)
      try {
        await onDeleted(target)
      } catch (caught) {
        add({ title: ipcErrorMessage(caught), variant: 'error' })
      }
    } catch (caught) {
      const message = ipcErrorMessage(caught)
      feedback.finish(operationId, 'error', message)
      add({ title: message, variant: 'error' })
      if (submission.current !== ticket) return
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  const handleOpenChange = (next: boolean): void => {
    if (busy && !next) return
    onOpenChange(next)
  }

  return (
    <TaskDialog open={open} onOpenChange={handleOpenChange}>
      <TaskDialog.Header
        title={`Delete ${kind} “${name}”`}
        description={
          <>
            Everything inside the {kind} folder moves to the {trash}, including files this app
            doesn’t manage.
            {target?.hasArchives ? ` Its archived seasons in _archives move too.` : ''} You can
            restore it from there.
          </>
        }
      />

      <TaskDialog.Body onSubmit={(event) => void submit(event)}>
        <Input
          ref={inputRef}
          label={`Type ${name} to confirm`}
          name="confirm-name"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus
          placeholder={name}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value)
          }}
        />

        <TaskDialog.Actions>
          <Dialog.Close
            render={(props) => (
              <Button {...props} type="button" variant="secondary" disabled={busy}>
                Cancel
              </Button>
            )}
          />
          <Button type="submit" variant="destructive" loading={busy} disabled={busy || !confirmed}>
            {busy ? 'Deleting…' : `Delete ${kind}`}
          </Button>
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}
