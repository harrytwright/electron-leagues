import { useId, useRef, useState } from 'react'
import { Button, Dialog, Radio, Select, Text } from '@cloudflare/kumo'
import { formatMemberNumber, memberDisplayName } from '@shared/members'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { useDialogTask } from '@renderer/hooks/use-dialog-task'
import { useQueryRefresh } from '@renderer/hooks/use-query-refresh'
import { useWriteOperation } from '@renderer/hooks/use-write-operation'
import { TaskDialog } from '../TaskDialog'
import type { Props } from './interface'

const NONE = ''

/** Which of the two records survives: the one chosen in the list, or the one the menu was opened on. */
type Survivor = 'other' | 'this'

export function MergeMemberDialog({
  snapshot,
  member,
  open,
  onOpenChange,
  onMerged
}: Props): React.JSX.Element {
  const [otherId, setOtherId] = useState(NONE)
  const [survivor, setSurvivor] = useState<Survivor>('other')
  const selectRef = useRef<HTMLDivElement>(null)
  const errorId = useId()
  const coordinator = useQueryRefresh()
  const operation = useWriteOperation({
    label: () => `Merging ${member ? memberDisplayName(member) : 'members'}`,
    write: ({ from, into }: { from: number; into: number }) =>
      window.api.mergeMembers(from, into, snapshot.revision)
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
    if (open) {
      setOtherId(NONE)
      setSurvivor('other')
    }
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
  const other = candidates.find((candidate) => String(candidate.id) === otherId) ?? null
  const describe = (candidate: { id: number; firstName: string; lastName: string }): string =>
    `${formatMemberNumber(candidate.id, snapshot.nextId)} ${memberDisplayName(candidate)}`

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (task.busy || !member) return
    if (!other) {
      task.reject('Choose the member this one is a copy of')
      return
    }
    const ticket = task.begin()
    try {
      const outcome = await operation.run(
        survivor === 'other'
          ? { from: member.id, into: other.id }
          : { from: other.id, into: member.id }
      )
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
        title={member ? `Merge ${memberDisplayName(member)} with…` : 'Merge member'}
        description="The record that stays keeps its number and gains the other’s MBD ids, spellings and any details it was missing. Live rosters move across; archived seasons keep the old number."
      />
      <TaskDialog.Body onSubmit={(event) => void submit(event)}>
        {/* Kumo's Select owns its trigger, so a failure focuses this wrapper instead. */}
        <div ref={selectRef} tabIndex={-1} className="outline-none">
          <Select
            label="Merge with"
            value={otherId}
            items={items}
            aria-invalid={task.error ? true : undefined}
            aria-describedby={task.error ? errorId : undefined}
            onValueChange={(value) => {
              setOtherId(value ?? NONE)
              if (task.error) task.edited()
            }}
          />
        </div>
        {member && other ? (
          <Radio.Group
            value={survivor}
            onValueChange={(value) => setSurvivor(value === 'this' ? 'this' : 'other')}
          >
            <Radio.Legend>Which record stays</Radio.Legend>
            <Radio.Item value="other" label={`Keep ${describe(other)}`} />
            <Radio.Item value="this" label={`Keep ${describe(member)}`} />
          </Radio.Group>
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
          <Button type="submit" variant="primary" disabled={task.busy || !other}>
            {task.busy ? 'Merging…' : 'Merge members'}
          </Button>
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}
