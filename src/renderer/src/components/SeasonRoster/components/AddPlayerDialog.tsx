import { useId, useRef, useState } from 'react'
import { Button, Dialog, Select, Text } from '@cloudflare/kumo'
import {
  formatMemberNumber,
  memberDisplayName,
  isSingles,
  sortTeams,
  type Member,
  type MembersSnapshot,
  type Player,
  type RosterSeason
} from '@shared/members'
import { useDialogTask } from '@renderer/hooks/use-dialog-task'
import { TaskDialog } from '../../TaskDialog'

const SUBS = 'subs'
const NONE = ''

export interface AddPlayerDialogProps {
  season: RosterSeason
  snapshot: MembersSnapshot
  open: boolean
  busy: boolean
  onOpenChange: (open: boolean) => void
  /** Resolves null once the roster is saved with the new row, or the message that stopped it. */
  onAdd: (player: Player) => Promise<string | null>
}

/** Members who can still join this roster: live records not already on it. */
function availableMembers(season: RosterSeason, snapshot: MembersSnapshot): Member[] {
  const onRoster = new Set(season.file.players.map((player) => player.memberId))
  return snapshot.members.filter(
    (member) => member.mergedInto === undefined && !member.deleted && !onRoster.has(member.id)
  )
}

/** Select items: a sub entry first, then each team by lane draw. */
function teamItems(season: RosterSeason): { value: string; label: string }[] {
  return [
    { value: SUBS, label: 'Sub (no team)' },
    ...sortTeams(season.file.teams).map((team) => ({
      value: team.id,
      label: `${team.teamNo}. ${team.name}`
    }))
  ]
}

export function AddPlayerDialog({
  season,
  snapshot,
  open,
  busy,
  onOpenChange,
  onAdd
}: AddPlayerDialogProps): React.JSX.Element {
  const [memberId, setMemberId] = useState(NONE)
  const [teamId, setTeamId] = useState(SUBS)
  const [wasOpen, setWasOpen] = useState(open)
  const fieldRef = useRef<HTMLDivElement>(null)
  const errorId = useId()
  const task = useDialogTask({ open, onOpenChange, fieldRef })

  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setMemberId(NONE)
      setTeamId(SUBS)
    }
  }

  const candidates = availableMembers(season, snapshot)
  const memberItems = {
    [NONE]: candidates.length === 0 ? 'Everyone is already on this roster' : 'Choose a member…',
    ...Object.fromEntries(
      candidates.map((member) => [
        String(member.id),
        `${formatMemberNumber(member.id, snapshot.nextId)} ${memberDisplayName(member)}`
      ])
    )
  }
  const chosen = candidates.find((member) => String(member.id) === memberId) ?? null

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (task.busy || busy) return
    if (!chosen) {
      task.reject('Choose a member to add')
      return
    }
    const ticket = task.begin()
    const failure = await onAdd({
      memberId: chosen.id,
      teamId: teamId === SUBS || isSingles(season.file) ? null : teamId
    })
    task.settle(ticket, failure ? { type: 'failed', error: failure } : { type: 'completed' })
    if (!failure && task.isCurrent(ticket)) onOpenChange(false)
  }

  return (
    <TaskDialog open={open} onOpenChange={task.handleOpenChange}>
      <TaskDialog.Header
        title="Add player"
        description={`Put a member on the ${season.season} roster for ${season.leagueName}.`}
      />
      <TaskDialog.Body onSubmit={(event) => void submit(event)}>
        {/* Kumo's Select owns its trigger, so a failure focuses this wrapper instead. */}
        <div ref={fieldRef} tabIndex={-1} className="outline-none">
          <Select
            label="Member"
            value={memberId}
            items={memberItems}
            aria-invalid={task.error ? true : undefined}
            aria-describedby={task.error ? errorId : undefined}
            onValueChange={(value) => {
              setMemberId(value ?? NONE)
              if (task.error) task.edited()
            }}
          />
        </div>
        {isSingles(season.file) ? null : (
          <Select
            label="Team"
            value={teamId}
            items={teamItems(season)}
            onValueChange={(value) => {
              if (value) setTeamId(value)
            }}
          />
        )}
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
          <Button type="submit" variant="primary" disabled={task.busy || busy || !chosen}>
            {task.busy ? 'Adding…' : 'Add player'}
          </Button>
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}
