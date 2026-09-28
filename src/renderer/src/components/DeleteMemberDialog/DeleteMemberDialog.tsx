import { useId, useRef } from 'react'
import { Button, Dialog, Text, useKumoToastManager } from '@cloudflare/kumo'
import { memberDisplayName } from '@shared/members'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { useDialogTask } from '@renderer/hooks/use-dialog-task'
import { useQueryRefresh } from '@renderer/hooks/use-query-refresh'
import { useWriteOperation } from '@renderer/hooks/use-write-operation'
import { TaskDialog } from '../TaskDialog'
import type { Props } from './interface'

export function DeleteMemberDialog({
  snapshot,
  member,
  open,
  onOpenChange,
  onDeleted
}: Props): React.JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const errorId = useId()
  const { add } = useKumoToastManager()
  const coordinator = useQueryRefresh()
  const operation = useWriteOperation({
    label: () => `Deleting ${member ? memberDisplayName(member) : 'member'}`,
    write: (id: number) => window.api.deleteMember(id, snapshot.revision)
  })
  const task = useDialogTask({
    open,
    onOpenChange,
    fieldRef: cancelRef,
    resetKey: member ? String(member.id) : null
  })

  const referenced =
    member !== null &&
    snapshot.seasons.some((season) =>
      season.file.players.some((player) => player.memberId === member.id)
    )
  const name = member ? memberDisplayName(member) : ''

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (task.busy || !member) return
    const ticket = task.begin()
    try {
      const outcome = await operation.run(member.id)
      const done =
        outcome.result === 'soft'
          ? `Hid ${name}; their number stays on the rosters that list them`
          : `Deleted ${name}`
      if (outcome.status === 'refresh-failed') {
        task.settle(ticket, {
          type: 'failed',
          error: `${done}, but the list could not be refreshed: ${outcome.refreshError}`
        })
        return
      }
      task.settle(ticket, { type: 'completed' })
      add({ title: done, variant: 'success' })
      if (task.isCurrent(ticket)) onDeleted()
    } catch (caught) {
      task.settle(ticket, { type: 'failed', error: ipcErrorMessage(caught) })
      void coordinator.refresh()
    }
  }

  return (
    <TaskDialog open={open} onOpenChange={task.handleOpenChange}>
      <TaskDialog.Header
        title={`Delete ${name}?`}
        description={
          referenced
            ? 'This member is on at least one roster, so they are hidden from the list rather than removed; those rosters keep their number.'
            : 'This member is on no roster, so their record is removed. Their number is never reused.'
        }
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
          <Button type="submit" variant="destructive" disabled={task.busy || !member}>
            {task.busy ? 'Deleting…' : referenced ? 'Hide member' : 'Delete member'}
          </Button>
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}
