import { useId, useRef, useState } from 'react'
import { Button, Dialog, Text } from '@cloudflare/kumo'
import { memberDisplayName, type MemberInput } from '@shared/members'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { useDialogTask } from '@renderer/hooks/use-dialog-task'
import { useQueryRefresh } from '@renderer/hooks/use-query-refresh'
import { useWriteOperation } from '@renderer/hooks/use-write-operation'
import { MemberForm, memberDraftFrom, memberInputFromDraft, type MemberDraft } from '../MemberForm'
import { TaskDialog } from '../TaskDialog'
import type { Props } from './interface'

export function MemberDialog({
  snapshot,
  member,
  open,
  onOpenChange,
  onSaved
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState<MemberDraft>(() => memberDraftFrom(member))
  const [wasOpen, setWasOpen] = useState(open)
  const [editedMemberId, setEditedMemberId] = useState(member?.id)
  const [invalidNames, setInvalidNames] = useState<{
    firstName: boolean
    lastName: boolean
  } | null>(null)
  const firstNameRef = useRef<HTMLInputElement>(null)
  const errorId = useId()
  const coordinator = useQueryRefresh()
  const operation = useWriteOperation({
    label: (input: MemberInput) =>
      input.id === undefined
        ? `Adding ${input.firstName} ${input.lastName}`
        : `Saving ${input.firstName} ${input.lastName}`,
    write: (input) => window.api.saveMember(input, snapshot.revision)
  })
  const task = useDialogTask({ open, onOpenChange, fieldRef: firstNameRef })

  // Each opening starts from the member as they are now; a refresh mid-edit keeps the draft.
  if (wasOpen !== open || editedMemberId !== member?.id) {
    setWasOpen(open)
    setEditedMemberId(member?.id)
    if (open) {
      setDraft(memberDraftFrom(member))
      setInvalidNames(null)
    }
  }

  const update = <Key extends keyof MemberDraft>(key: Key, value: MemberDraft[Key]): void => {
    setDraft((current) => ({ ...current, [key]: value }))
    if (key === 'firstName' || key === 'lastName') {
      const nextInvalidNames = invalidNames
        ? { ...invalidNames, [key]: !String(value).trim() }
        : null
      setInvalidNames(nextInvalidNames)
      if (task.error && (!nextInvalidNames || !Object.values(nextInvalidNames).includes(true))) {
        task.edited()
      }
      return
    }
    if (task.error) task.edited()
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (task.busy) return
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setInvalidNames({
        firstName: !draft.firstName.trim(),
        lastName: !draft.lastName.trim()
      })
      task.reject('A member needs a first and last name')
      return
    }
    setInvalidNames(null)
    const ticket = task.begin()
    try {
      const outcome = await operation.run(memberInputFromDraft(draft, member))
      const saved = outcome.result
      if (outcome.status === 'refresh-failed') {
        task.settle(ticket, {
          type: 'failed',
          error: `Saved ${memberDisplayName(saved)}, but the list could not be refreshed: ${outcome.refreshError}`
        })
        return
      }
      task.settle(ticket, { type: 'completed' })
      if (task.isCurrent(ticket)) onSaved(saved)
    } catch (caught) {
      task.settle(ticket, { type: 'failed', error: ipcErrorMessage(caught) })
      void coordinator.refresh()
    }
  }

  return (
    <TaskDialog open={open} onOpenChange={task.handleOpenChange} size="lg">
      <TaskDialog.Header
        title={member ? `Edit ${memberDisplayName(member)}` : 'New member'}
        description={
          member
            ? 'Details are kept in this location’s members list.'
            : 'The next member number is given out when you save.'
        }
      />

      <TaskDialog.Body onSubmit={(event) => void submit(event)}>
        <MemberForm
          ref={firstNameRef}
          draft={draft}
          errorId={errorId}
          invalidNames={invalidNames ?? undefined}
          onChange={update}
        />

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
          <Button type="submit" variant="primary" disabled={task.busy}>
            {task.busy ? 'Saving…' : member ? 'Save member' : 'Add member'}
          </Button>
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}
