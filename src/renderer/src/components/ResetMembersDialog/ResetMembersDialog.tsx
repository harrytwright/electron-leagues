import { useId, useRef } from 'react'
import { Button, Dialog, Text, useKumoToastManager } from '@cloudflare/kumo'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { plural } from '@renderer/lib/plural'
import { useDialogTask } from '@renderer/hooks/use-dialog-task'
import { useQueryRefresh } from '@renderer/hooks/use-query-refresh'
import { useWriteOperation } from '@renderer/hooks/use-write-operation'
import { TaskDialog } from '../TaskDialog'
import type { Props } from './interface'

/** Development only: wipes every roster and the master list so a sync can be run again. */
export function ResetMembersDialog({
  snapshot,
  open,
  onOpenChange,
  onReset
}: Props): React.JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const errorId = useId()
  const { add } = useKumoToastManager()
  const coordinator = useQueryRefresh()
  const operation = useWriteOperation({
    label: () => 'Deleting every member',
    write: () => window.api.resetMembers(snapshot.revision)
  })
  const task = useDialogTask({ open, onOpenChange, fieldRef: cancelRef })
  const rosters = snapshot.seasons.filter((season) => season.file.players.length > 0).length

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (task.busy) return
    const ticket = task.begin()
    try {
      const outcome = await operation.run(undefined)
      const done = 'Deleted every member and emptied every roster'
      if (outcome.status === 'refresh-failed') {
        task.settle(ticket, {
          type: 'failed',
          error: `${done}, but the list could not be refreshed: ${outcome.refreshError}`
        })
        return
      }
      task.settle(ticket, { type: 'completed' })
      add({ title: done, variant: 'success' })
      if (task.isCurrent(ticket)) onReset()
    } catch (caught) {
      task.settle(ticket, { type: 'failed', error: ipcErrorMessage(caught) })
      void coordinator.refresh()
    }
  }

  return (
    <TaskDialog open={open} onOpenChange={task.handleOpenChange}>
      <TaskDialog.Header
        title="Delete every member?"
        description={`Empties ${plural(rosters, 'roster')} and their teams, then removes all ${plural(snapshot.members.length, 'member record')}. Season settings and documents stay. This is a development shortcut for rerunning a sync and cannot be undone.`}
      />
      <TaskDialog.Body onSubmit={(event) => void submit(event)}>
        {task.error ? (
          <Text id={errorId} variant="error" role="alert">
            {task.error}
          </Text>
        ) : null}
        <TaskDialog.Actions>
          <Dialog.Close
            render={(props) => (
              <Button
                {...props}
                ref={cancelRef}
                type="button"
                variant="secondary"
                disabled={task.busy}
              >
                Cancel
              </Button>
            )}
          />
          <Button type="submit" variant="destructive" disabled={task.busy}>
            {task.busy ? 'Deleting…' : 'Delete everything'}
          </Button>
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}
