import { useId, useRef, useState } from 'react'
import { Button, Dialog, Input, Text } from '@cloudflare/kumo'
import type { Team } from '@shared/members'
import { useDialogTask } from '@renderer/hooks/use-dialog-task'
import { TaskDialog } from '../../TaskDialog'

export interface TeamDialogProps {
  /** null adds a team; otherwise the team being edited. */
  team: Team | null
  /** Numbers already taken by other teams, so the form can refuse a clash before saving. */
  takenNumbers: number[]
  nextNumber: number
  open: boolean
  busy: boolean
  onOpenChange: (open: boolean) => void
  /** Resolves null once saved, or the message that stopped it. */
  onSave: (team: Omit<Team, 'id'>) => Promise<string | null>
}

export function TeamDialog({
  team,
  takenNumbers,
  nextNumber,
  open,
  busy,
  onOpenChange,
  onSave
}: TeamDialogProps): React.JSX.Element {
  const [name, setName] = useState(team?.name ?? '')
  const [teamNo, setTeamNo] = useState(String(team?.teamNo ?? nextNumber))
  const [wasOpen, setWasOpen] = useState(open)
  const nameRef = useRef<HTMLInputElement>(null)
  const errorId = useId()
  const task = useDialogTask({ open, onOpenChange, fieldRef: nameRef, resetKey: team?.id ?? null })

  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setName(team?.name ?? '')
      setTeamNo(String(team?.teamNo ?? nextNumber))
    }
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (task.busy || busy) return
    const number = Number(teamNo)
    if (!name.trim()) {
      task.reject('A team needs a name')
      return
    }
    if (!Number.isInteger(number) || number < 1) {
      task.reject('The team number must be a whole number from 1')
      return
    }
    if (takenNumbers.includes(number)) {
      task.reject(`Another team already has number ${number}`)
      return
    }
    const ticket = task.begin()
    const failure = await onSave({ name: name.trim(), teamNo: number })
    task.settle(ticket, failure ? { type: 'failed', error: failure } : { type: 'completed' })
    if (!failure && task.isCurrent(ticket)) onOpenChange(false)
  }

  return (
    <TaskDialog open={open} onOpenChange={task.handleOpenChange}>
      <TaskDialog.Header
        title={team ? `Edit ${team.name}` : 'Add team'}
        description="The team number is this season’s lane draw; the team itself keeps its identity from season to season."
      />
      <TaskDialog.Body onSubmit={(event) => void submit(event)}>
        <Input
          ref={nameRef}
          label="Team name"
          name="team-name"
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
        <Input
          label="Team number"
          name="team-number"
          type="number"
          min={1}
          value={teamNo}
          onChange={(event) => {
            setTeamNo(event.target.value)
            if (task.error) task.edited()
          }}
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
          <Button type="submit" variant="primary" disabled={task.busy || busy || !name.trim()}>
            {task.busy ? 'Saving…' : team ? 'Save team' : 'Add team'}
          </Button>
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}
