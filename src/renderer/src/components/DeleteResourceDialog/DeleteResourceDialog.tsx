import { useEffect, useId, useRef, useState } from 'react'
import { Button, Dialog, Input, Text, useKumoToastManager } from '@cloudflare/kumo'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { trashLabel } from '@renderer/lib/os-labels'
import { TaskDialog } from '../TaskDialog'
import type { Props } from './interface'
import { useDialogTask } from '@renderer/hooks/use-dialog-task'
import { useWriteOperation } from '@renderer/hooks/use-write-operation'

/** Names on disk may be NFD (macOS) and display names may carry stray spaces. */
function comparable(value: string): string {
  return value.trim().normalize('NFC')
}

/**
 * Type-the-name-to-confirm dialog in the shape of Kumo's DeleteResource block,
 * but honest about what happens: the folder moves to the OS trash rather than
 * being destroyed, and unmanaged files inside it go along.
 */
export function DeleteResourceDialog({ target, open, onOpenChange }: Props): React.JSX.Element {
  const [typed, setTyped] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const errorId = useId()
  const pendingErrorToast = useRef<string | null>(null)
  const { add } = useKumoToastManager()
  const operation = useWriteOperation({
    label: (deleting: NonNullable<Props['target']>) => `Deleting ${deleting.name}`,
    write: (deleting) => window.api.trashFolder(deleting.path)
  })
  // Kumo may replace this callback as its manager updates; that is not a dialog
  // lifecycle boundary and must not reset confirmation state.
  const addToast = useRef(add)
  const task = useDialogTask({ open, onOpenChange, fieldRef: inputRef, resetKey: target?.path })
  const [wasOpen, setWasOpen] = useState(open)
  const [lastTargetPath, setLastTargetPath] = useState(target?.path)

  // A close or target replacement starts a fresh dialog, even when an earlier
  // filesystem request is still settling.
  if (wasOpen !== open || lastTargetPath !== target?.path) {
    setWasOpen(open)
    setLastTargetPath(target?.path)
    setTyped('')
  }

  useEffect(() => {
    addToast.current = add
  }, [add])

  useEffect(() => {
    return () => {
      // Inline errors belong to the modal while it exists; promote them when a phase
      // change or close would otherwise erase the only report of the completed work.
      const toast = pendingErrorToast.current
      if (toast) {
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
    if (!target || !confirmed || task.busy || task.moved) return
    const movedMessage = `Moved “${target.name}” to the ${trash}`
    pendingErrorToast.current = null
    const ticket = task.begin()
    try {
      const outcome = await operation.run(target)
      // The target is already gone after this point, so retrying would turn a
      // refresh problem into a misleading second delete failure.
      if (outcome.status === 'refresh-failed') {
        const message = `${movedMessage}, but the folder could not be refreshed: ${outcome.refreshError}`
        if (task.isCurrent(ticket)) {
          pendingErrorToast.current = message
          task.settle(ticket, { type: 'moved', error: message })
        } else {
          add({ title: message, variant: 'error' })
        }
        return
      }
      task.settle(ticket, { type: 'moved', error: null })
      if (task.isCurrent(ticket)) onOpenChange(false)
      add({ title: movedMessage, variant: 'success' })
    } catch (caught) {
      const message = ipcErrorMessage(caught)
      if (task.isCurrent(ticket)) {
        pendingErrorToast.current = `Couldn’t delete “${target.name}”: ${message}`
        task.settle(ticket, { type: 'failed', error: message })
      } else {
        add({ title: `Couldn’t delete “${target.name}”: ${message}`, variant: 'error' })
      }
    }
  }

  return (
    <TaskDialog open={open} onOpenChange={task.handleOpenChange}>
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
          readOnly={task.moved}
          aria-invalid={task.error ? true : undefined}
          aria-describedby={task.error ? errorId : undefined}
          onChange={(event) => {
            setTyped(event.target.value)
            task.edited()
            pendingErrorToast.current = null
          }}
        />

        {task.error ? (
          <Text id={errorId} role="alert" variant="error">
            {task.error}
          </Text>
        ) : null}

        <TaskDialog.Actions>
          <Dialog.Close
            render={(props) => (
              <Button {...props} type="button" variant="secondary" disabled={task.busy}>
                Cancel
              </Button>
            )}
          />
          <Button
            type="submit"
            variant="destructive"
            loading={task.busy}
            disabled={task.busy || task.moved || !confirmed}
          >
            {task.busy ? 'Deleting…' : task.moved ? `Moved to ${trash}` : `Delete ${kind}`}
          </Button>
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}
