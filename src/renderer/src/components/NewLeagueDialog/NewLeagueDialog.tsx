import { useRef, useState } from 'react'
import { Button, Dialog, Input, Select, Text } from '@cloudflare/kumo'
import { sanitiseFolderName } from '@shared/sanitise'
import { isWeekday, WEEKDAYS, type Weekday } from '@shared/weekday'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { pathBasename } from '@renderer/lib/path-basename'
import { sentenceCase } from '@renderer/lib/sentence-case'
import { useDialogTask } from '@renderer/hooks/use-dialog-task'
import { useWriteOperation } from '@renderer/hooks/use-write-operation'
import { TaskDialog } from '../TaskDialog'
import type { Props } from './interface'

const DAY_ITEMS = WEEKDAYS.map((weekday) => ({
  value: weekday,
  label: sentenceCase(weekday)
}))

interface CreateLeagueVariables {
  day: Weekday
  name: string
}

export function NewLeagueDialog({ open, onOpenChange, onCreated }: Props): React.JSX.Element {
  const [day, setDay] = useState<Weekday>('monday')
  const [name, setName] = useState('')
  const [wasOpen, setWasOpen] = useState(open)
  const nameRef = useRef<HTMLInputElement>(null)
  const operation = useWriteOperation({
    label: () => 'Creating league',
    write: ({ day: selectedDay, name: leagueName }: CreateLeagueVariables) =>
      window.api.createLeague(selectedDay, leagueName)
  })
  const task = useDialogTask({ open, onOpenChange, fieldRef: nameRef })

  // Task 4 requires state to reset whenever this always-mounted dialog opens.
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setDay('monday')
      setName('')
    }
  }

  const folderName = sanitiseFolderName(name)

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (task.busy) return
    if (!folderName) {
      task.reject('That name cannot be used as a folder name — try letters and numbers')
      return
    }

    const ticket = task.begin()
    try {
      const outcome = await operation.run({ day, name })
      if (outcome.status === 'refresh-failed') {
        task.settle(ticket, {
          type: 'failed',
          error: `Created “${name.trim()}”, but the leagues folder could not be refreshed: ${outcome.refreshError}`
        })
        return
      }
      task.settle(ticket, { type: 'completed' })
      // Main owns the real folder name (normalisation, collisions) — read it
      // back from the created path rather than trusting our local guess.
      if (task.isCurrent(ticket)) onCreated(day, pathBasename(outcome.result) || folderName)
    } catch (caught) {
      task.settle(ticket, { type: 'failed', error: ipcErrorMessage(caught) })
    }
  }

  return (
    <TaskDialog open={open} onOpenChange={task.handleOpenChange}>
      <TaskDialog.Header title="New league" description="Add a league night and its folder." />

      <TaskDialog.Body onSubmit={(event) => void submit(event)}>
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
          aria-invalid={task.error ? true : undefined}
          aria-describedby={task.error ? 'new-league-error' : undefined}
          onChange={(event) => {
            setName(event.target.value)
            if (task.error) task.edited()
          }}
        />

        {name && folderName && folderName !== name.trim() ? (
          <Text variant="secondary">Folder will be named “{folderName}”</Text>
        ) : null}

        {task.error ? (
          <Text id="new-league-error" variant="error" role="alert">
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
          <Button type="submit" variant="primary" disabled={task.busy || !name.trim()}>
            {task.busy ? 'Creating…' : 'Create league'}
          </Button>
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}
