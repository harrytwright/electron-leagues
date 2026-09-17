import { useId, useRef, useState } from 'react'
import { Button, Dialog, Input, Text } from '@cloudflare/kumo'
import { sanitiseFolderName } from '@shared/sanitise'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { pathBasename } from '@renderer/lib/path-basename'
import { useDialogTask } from '@renderer/hooks/use-dialog-task'
import { useWriteOperation } from '@renderer/hooks/use-write-operation'
import { TaskDialog } from '../TaskDialog'
import type { Props } from './interface'

export function RenameLeagueDialog({
  league,
  open,
  onOpenChange,
  onRenamed
}: Props): React.JSX.Element {
  const [name, setName] = useState(league.meta.name)
  const [wasOpen, setWasOpen] = useState(open)
  const nameRef = useRef<HTMLInputElement>(null)
  const errorId = useId()
  const operation = useWriteOperation({
    label: (displayName: string) => `Renaming ${league.meta.name} to ${displayName}`,
    write: (displayName) => window.api.renameLeague(league.day, league.folderName, displayName)
  })
  const task = useDialogTask({ open, onOpenChange, fieldRef: nameRef })

  // The dialog stays mounted with its league, so each opening starts from the current name.
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setName(league.meta.name)
  }

  const trimmed = name.trim()
  const folderName = sanitiseFolderName(name)
  const folderChanges = folderName !== null && folderName !== league.folderName
  const unchanged = trimmed === league.meta.name

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (task.busy || unchanged || !trimmed) return
    if (!folderName) {
      task.reject('That name cannot be used as a folder name. Try letters and numbers')
      return
    }

    const ticket = task.begin()
    try {
      const outcome = await operation.run(trimmed)
      if (outcome.status === 'refresh-failed') {
        task.settle(ticket, {
          type: 'failed',
          error: `Renamed to “${trimmed}”, but the leagues folder could not be refreshed: ${outcome.refreshError}`
        })
        return
      }
      task.settle(ticket, { type: 'completed' })
      // Main owns the real folder name; read it back from the renamed path.
      if (task.isCurrent(ticket)) onRenamed(league.day, pathBasename(outcome.result) || folderName)
    } catch (caught) {
      task.settle(ticket, { type: 'failed', error: ipcErrorMessage(caught) })
    }
  }

  return (
    <TaskDialog open={open} onOpenChange={task.handleOpenChange}>
      <TaskDialog.Header
        title={`Rename league “${league.meta.name}”`}
        description="Changes the name shown here and the league's folder on disk. Archived seasons move with it."
      />

      <TaskDialog.Body onSubmit={(event) => void submit(event)}>
        <Input
          ref={nameRef}
          label="League name"
          name="league-name"
          autoComplete="off"
          autoFocus
          value={name}
          aria-invalid={task.error ? true : undefined}
          aria-describedby={task.error ? errorId : undefined}
          onChange={(event) => {
            setName(event.target.value)
            if (task.error) task.edited()
          }}
        />

        {folderChanges ? (
          <Text variant="secondary">Folder will be renamed to “{folderName}”</Text>
        ) : trimmed && !unchanged ? (
          <Text variant="secondary">The folder keeps its current name</Text>
        ) : null}

        {task.error ? (
          <Text id={errorId} variant="error" role="alert">
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
          <Button type="submit" variant="primary" disabled={task.busy || !trimmed || unchanged}>
            {task.busy ? 'Renaming…' : 'Rename league'}
          </Button>
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}
