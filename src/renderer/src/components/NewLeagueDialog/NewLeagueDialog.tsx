import { useEffect, useRef, useState } from 'react'
import { Button, Dialog, Input, Select, Text } from '@cloudflare/kumo'
import { sanitiseFolderName } from '@shared/sanitise'
import { isWeekday, WEEKDAYS, type Weekday } from '@shared/weekday'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { pathBasename } from '@renderer/lib/path-basename'
import { sentenceCase } from '@renderer/lib/sentence-case'
import type { Props } from './interface'

const DAY_ITEMS = WEEKDAYS.map((weekday) => ({
  value: weekday,
  label: sentenceCase(weekday)
}))

export function NewLeagueDialog({ open, onOpenChange, onCreated }: Props): React.JSX.Element {
  const [day, setDay] = useState<Weekday>('monday')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  // Bumped on every open so a create left pending across close/reopen can
  // never write its stale outcome onto the fresh form.
  const submission = useRef(0)

  useEffect(() => {
    if (!open) return
    submission.current += 1
    // Task 4 requires state to reset whenever this always-mounted dialog opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDay('monday')
    setName('')
    setError(null)
    setBusy(false)
  }, [open])

  const folderName = sanitiseFolderName(name)

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (busy) return
    if (!folderName) {
      setError('That name cannot be used as a folder name — try letters and numbers')
      nameRef.current?.focus()
      return
    }

    const ticket = (submission.current += 1)
    setBusy(true)
    setError(null)
    try {
      const createdPath = await window.api.createLeague(day, name)
      if (submission.current !== ticket) return
      setBusy(false)
      // Main owns the real folder name (normalisation, collisions) — read it
      // back from the created path rather than trusting our local guess.
      onCreated(day, pathBasename(createdPath) || folderName)
    } catch (caught) {
      if (submission.current !== ticket) return
      setError(ipcErrorMessage(caught))
      setBusy(false)
      nameRef.current?.focus()
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
          <Dialog.Title>New league</Dialog.Title>
          <Dialog.Description className="text-kumo-subtle">
            Add a league night and its folder.
          </Dialog.Description>
        </div>

        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <Select
            label="League night"
            value={day}
            items={DAY_ITEMS}
            onValueChange={(value) => {
              if (value && isWeekday(value)) setDay(value)
            }}
          />

          <Input
            ref={nameRef}
            label="League name"
            name="league-name"
            autoComplete="off"
            autoFocus
            placeholder="e.g. Monday Trios"
            value={name}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'new-league-error' : undefined}
            onChange={(event) => {
              setName(event.target.value)
              if (error) setError(null)
            }}
          />

          {name && folderName && folderName !== name.trim() ? (
            <Text variant="secondary">Folder will be named “{folderName}”</Text>
          ) : null}

          {error ? (
            <Text id="new-league-error" variant="error" role="alert">
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
            <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create league'}
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  )
}
