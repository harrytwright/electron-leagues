import { useEffect, useRef, useState } from 'react'
import { Button, Dialog, Input, Text } from '@cloudflare/kumo'
import { ipcErrorMessage } from '../lib/ipc-error'
import { trashLabel } from '../lib/trash-label'

export interface DeleteTarget {
  kind: 'league' | 'season'
  /** Display name the user must type to confirm. */
  name: string
  path: string
  /** A league's `_archives` folder goes with it; say so when there is one. */
  hasArchives?: boolean
}

interface Props {
  target: DeleteTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: (target: DeleteTarget) => void | Promise<void>
}

/** Names on disk may be NFD (macOS) and display names may carry stray spaces. */
function comparable(value: string): string {
  return value.trim().normalize('NFC')
}

/**
 * Type-the-name-to-confirm dialog in the shape of Kumo's DeleteResource block,
 * but honest about what happens: the folder moves to the OS trash rather than
 * being destroyed, and unmanaged files inside it go along.
 */
function DeleteResourceDialog({ target, open, onOpenChange, onDeleted }: Props): React.JSX.Element {
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Bumped on every close so a delete left pending across close/reopen can
  // never write its stale outcome onto the fresh dialog.
  const submission = useRef(0)

  useEffect(() => {
    if (open) return
    submission.current += 1
    // Reset on close so nothing stale is visible for the reopening frame.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTyped('')
    setError(null)
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
    setBusy(true)
    setError(null)
    try {
      await window.api.trashFolder(target.path)
      if (submission.current !== ticket) return
      setBusy(false)
      await onDeleted(target)
    } catch (caught) {
      if (submission.current !== ticket) return
      setError(ipcErrorMessage(caught))
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  const handleOpenChange = (next: boolean): void => {
    if (busy && !next) return
    onOpenChange(next)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog className="p-6">
        <div className="mb-6 grid gap-1.5">
          <Dialog.Title>
            Delete {kind} “{name}”
          </Dialog.Title>
          <Dialog.Description className="text-kumo-subtle">
            Everything inside the {kind} folder moves to the {trash}, including files this app
            doesn’t manage.
            {target?.hasArchives ? ` Its archived seasons in _archives move too.` : ''} You can
            restore it from there.
          </Dialog.Description>
        </div>

        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
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
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'delete-resource-error' : undefined}
            onChange={(event) => {
              setTyped(event.target.value)
              if (error) setError(null)
            }}
          />

          {error ? (
            <Text id="delete-resource-error" variant="error" role="alert">
              {error}
            </Text>
          ) : null}

          <div className="flex justify-end gap-2">
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
              disabled={busy || !confirmed}
            >
              {busy ? 'Deleting…' : `Delete ${kind}`}
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  )
}

export default DeleteResourceDialog
