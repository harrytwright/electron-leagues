import { useEffect, useId, useRef, useState } from 'react'
import { Button, Dialog, Input, Text, useKumoToastManager } from '@cloudflare/kumo'
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
  const [moved, setMoved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const errorId = useId()
  // This protects dialog-local state and focus; an outcome whose dialog has gone
  // is reported globally so closing it cannot hide the result of a disk write.
  const submission = useRef(0)
  const pendingErrorToast = useRef<string | null>(null)
  const feedback = useOperationFeedback()
  const { add } = useKumoToastManager()
  // Kumo may replace this callback as its manager updates; that is not a dialog
  // lifecycle boundary and must not reset confirmation state.
  const addToast = useRef(add)

  useEffect(() => {
    addToast.current = add
  }, [add])

  useEffect(() => {
    // A close or target replacement starts a fresh dialog, even when an earlier
    // filesystem request is still settling.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTyped('')
    setBusy(false)
    setMoved(false)
    setError(null)
    return () => {
      submission.current += 1
      const toast = pendingErrorToast.current
      if (toast) {
        // Inline errors belong to the modal while it exists; promote them when a phase
        // change or close would otherwise erase the only report of the completed work.
        pendingErrorToast.current = null
        addToast.current({ title: toast, variant: 'error' })
      }
    }
  }, [open, target?.path])

  const name = target?.name ?? ''
  const confirmed = name !== '' && comparable(typed) === comparable(name)
  const kind = target?.kind ?? 'league'
  const trash = trashLabel()

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!target || !confirmed || busy || moved) return
    const ticket = submission.current
    const movedMessage = `Moved “${target.name}” to the ${trash}`
    const operationId = feedback.begin(`Deleting ${target.name}`)
    pendingErrorToast.current = null
    setBusy(true)
    setError(null)
    try {
      await window.api.trashFolder(target.path)
      // The target is already gone after this point, so retrying would turn a
      // refresh problem into a misleading second delete failure.
      if (submission.current === ticket) setMoved(true)
      try {
        await onDeleted(target)
      } catch (caught) {
        const message = `${movedMessage}, but the league could not be refreshed: ${ipcErrorMessage(caught)}`
        if (submission.current === ticket) {
          pendingErrorToast.current = message
          setError(message)
          inputRef.current?.focus()
        } else {
          add({ title: message, variant: 'error' })
        }
        return
      }
      if (submission.current === ticket) onOpenChange(false)
      add({ title: movedMessage, variant: 'success' })
    } catch (caught) {
      const message = ipcErrorMessage(caught)
      if (submission.current === ticket) {
        pendingErrorToast.current = `Couldn't delete “${target.name}”: ${message}`
        setError(message)
        inputRef.current?.focus()
      } else {
        add({ title: `Couldn't delete “${target.name}”: ${message}`, variant: 'error' })
      }
    } finally {
      // Completion follows refresh so a successful move is never reported as a plain failure.
      feedback.finish(operationId)
      if (submission.current === ticket) setBusy(false)
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
          // Read-only keeps the completed target immutable without removing the
          // error's focus destination from the modal tab order.
          readOnly={moved}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setTyped(event.target.value)
            setError(null)
            pendingErrorToast.current = null
          }}
        />

        {error ? (
          <Text id={errorId} role="alert" variant="error">
            {error}
          </Text>
        ) : null}

        <TaskDialog.Actions>
          <Dialog.Close
            render={(props) => (
              <Button {...props} type="button" variant="secondary" disabled={busy}>
                Cancel
              </Button>
            )}
          />
          <Button
            type="submit"
            variant="destructive"
            loading={busy}
            disabled={busy || moved || !confirmed}
          >
            {busy ? 'Deleting…' : moved ? `Moved to ${trash}` : `Delete ${kind}`}
          </Button>
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}
