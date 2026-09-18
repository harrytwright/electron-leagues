import { useId, useRef, useState } from 'react'
import { Button, Dialog, Select, Text } from '@cloudflare/kumo'
import { formatMemberNumber, memberDisplayName } from '@shared/members'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { useDialogTask } from '@renderer/hooks/use-dialog-task'
import { useQueryRefresh } from '@renderer/hooks/use-query-refresh'
import { useWriteOperation } from '@renderer/hooks/use-write-operation'
import { TaskDialog } from '../TaskDialog'
import type { Props } from './interface'

const NONE = ''

export function MergeMemberDialog({
  snapshot,
  member,
  open,
  onOpenChange,
  onMerged
}: Props): React.JSX.Element {
  const [intoId, setIntoId] = useState(NONE)
  const selectRef = useRef<HTMLDivElement>(null)
  const errorId = useId()
  const coordinator = useQueryRefresh()
  const operation = useWriteOperation({
    label: () => `Merging ${member ? memberDisplayName(member) : 'members'}`,
    write: (target: number) => window.api.mergeMembers(member?.id ?? 0, target, snapshot.revision)
  })
  const task = useDialogTask({
    open,
    onOpenChange,
    fieldRef: selectRef,
    resetKey: member ? String(member.id) : null
  })
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setIntoId(NONE)
  }

  const candidates = snapshot.members.filter(
    (candidate) =>
      candidate.id !== member?.id && candidate.mergedInto === undefined && !candidate.deleted
  )
  const items = {
    [NONE]: 'Choose a member…',
    ...Object.fromEntries(
      candidates.map((candidate) => [
        String(candidate.id),
        `${formatMemberNumber(candidate.id, snapshot.nextId)} ${memberDisplayName(candidate)}`
      ])
    )
  }
  const target = candidates.find((candidate) => String(candidate.id) === intoId) ?? null

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (task.busy || !member) return
    if (!target) {
      task.reject('Choose the member to keep')
      return
    }
    const ticket = task.begin()
    try {
      const outcome = await operation.run(target.id)
      if (outcome.status === 'refresh-failed') {
        task.settle(ticket, {
          type: 'failed',
          error: `Merged, but the list could not be refreshed: ${outcome.refreshError}`
        })
        return
      }
      task.settle(ticket, { type: 'completed' })
      if (task.isCurrent(ticket)) onMerged()
    } catch (caught) {
      task.settle(ticket, { type: 'failed', error: ipcErrorMessage(caught) })
      void coordinator.refresh()
    }
  }

  return (
    <TaskDialog open={open} onOpenChange={task.handleOpenChange}>
      <TaskDialog.Header
        title={member ? `Merge ${memberDisplayName(member)} into…` : 'Merge member'}
        description="The member you choose keeps their number and gains this one’s MBD ids, spellings and any details they were missing. Live rosters move across; archived seasons keep the old number."
      />
      <TaskDialog.Body onSubmit={(event) => void submit(event)}>
        {/* Kumo's Select owns its trigger, so a failure focuses this wrapper instead. */}
        <div ref={selectRef} tabIndex={-1} className="outline-none">
          <Select
            label="Keep"
            value={intoId}
            items={items}
            aria-invalid={task.error ? true : undefined}
            aria-describedby={task.error ? errorId : undefined}
            onValueChange={(value) => {
              setIntoId(value ?? NONE)
              if (task.error) task.edited()
            }}
          />
        </div>
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
          <Button type="submit" variant="primary" disabled={task.busy || !target}>
            {task.busy ? 'Merging…' : 'Merge members'}
          </Button>
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}
