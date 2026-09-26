import { useId, useRef, useState } from 'react'
import { Button, Checkbox, Combobox, Dialog, Select, Text } from '@cloudflare/kumo'
import {
  formatMemberNumber,
  memberDisplayName,
  isSingles,
  normaliseName,
  sortTeams,
  type Member,
  type MembersSnapshot,
  type Player,
  type RosterSeason
} from '@shared/members'
import { useDialogTask } from '@renderer/hooks/use-dialog-task'
import { plural } from '@renderer/lib/plural'
import { TaskDialog } from '../../TaskDialog'

const SUBS = 'subs'

export interface AddPlayerDialogProps {
  season: RosterSeason
  snapshot: MembersSnapshot
  open: boolean
  busy: boolean
  onOpenChange: (open: boolean) => void
  /** Resolves null once the roster is saved with the new rows, or the message that stopped it. */
  onAdd: (players: Player[]) => Promise<string | null>
}

/** Members who can still join this roster: live records not already on it, by surname. */
function availableMembers(season: RosterSeason, snapshot: MembersSnapshot): Member[] {
  const onRoster = new Set(season.file.players.map((player) => player.memberId))
  return snapshot.members
    .filter(
      (member) => member.mergedInto === undefined && !member.deleted && !onRoster.has(member.id)
    )
    .sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName, undefined, { sensitivity: 'base' }) ||
        a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' })
    )
}

/** The same loose match as the Members page: part of a name, an alias or the number's last digits. */
function matches(member: Member, number: string, query: string): boolean {
  const trimmed = query.trim()
  if (!trimmed) return true
  if (/^\d+$/.test(trimmed) && number.endsWith(trimmed)) return true
  const needle = normaliseName(trimmed, '')
  return (
    normaliseName(member.firstName, member.lastName).includes(needle) ||
    member.aliases.some((alias) => normaliseName(alias, '').includes(needle))
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
  const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set())
  const [query, setQuery] = useState('')
  const [teamId, setTeamId] = useState(SUBS)
  const [wasOpen, setWasOpen] = useState(open)
  const fieldRef = useRef<HTMLInputElement>(null)
  const errorId = useId()
  const task = useDialogTask({ open, onOpenChange, fieldRef })

  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setChosen(new Set())
      setQuery('')
      setTeamId(SUBS)
    }
  }

  const candidates = availableMembers(season, snapshot)
  const numberOf = (member: Member): string => formatMemberNumber(member.id, snapshot.nextId)
  const selectedMembers = candidates.filter((member) => chosen.has(member.id))
  const remainingMembers = candidates.filter((member) => !chosen.has(member.id))
  const singles = isSingles(season.file)

  const toggle = (id: number, checked: boolean): void => {
    setChosen((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
    if (task.error) task.edited()
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (task.busy || busy) return
    // Only members still available count, so a refresh mid-dialog cannot add someone twice.
    const players = selectedMembers.map((member): Player => ({
      memberId: member.id,
      teamId: teamId === SUBS || singles ? null : teamId
    }))
    if (players.length === 0) {
      task.reject('Select at least one member to add')
      return
    }
    const ticket = task.begin()
    const failure = await onAdd(players)
    task.settle(ticket, failure ? { type: 'failed', error: failure } : { type: 'completed' })
    if (!failure && task.isCurrent(ticket)) onOpenChange(false)
  }

  return (
    <TaskDialog open={open} onOpenChange={task.handleOpenChange}>
      <TaskDialog.Header
        title="Add players"
        description={`Find and select members to add to the ${season.season} roster for ${season.leagueName}.`}
      />
      <TaskDialog.Body onSubmit={(event) => void submit(event)}>
        <Combobox<Member>
          label="Find a member"
          items={remainingMembers}
          value={null}
          inputValue={query}
          onInputValueChange={(value, details) =>
            setQuery(details.reason === 'item-press' ? '' : value)
          }
          onValueChange={(member) => {
            if (member) toggle(member.id, true)
          }}
          itemToStringLabel={(member) => `${numberOf(member)} ${memberDisplayName(member)}`}
          filteredItems={remainingMembers.filter((member) =>
            matches(member, numberOf(member), query)
          )}
          autoHighlight
          autoComplete="off"
        >
          <Combobox.TriggerInput
            ref={fieldRef}
            placeholder="Name or member number"
            aria-invalid={task.error ? true : undefined}
            aria-describedby={task.error ? errorId : undefined}
          />
          <Combobox.Content>
            <Combobox.Empty>
              {candidates.length === 0
                ? 'Everyone is already on this roster.'
                : remainingMembers.length === 0
                  ? 'All available members are selected.'
                  : 'No members match.'}
            </Combobox.Empty>
            <Combobox.List>
              {(member: Member) => (
                <Combobox.Item key={member.id} value={member}>
                  {numberOf(member)} {memberDisplayName(member)}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Content>
        </Combobox>
        <div
          role="group"
          aria-label="Players to add"
          className="max-h-64 overflow-y-auto rounded-md border border-kumo-line px-3 py-2"
        >
          {candidates.length === 0 ? (
            <Text variant="secondary">Everyone is already on this roster.</Text>
          ) : selectedMembers.length === 0 ? (
            <Text variant="secondary">Select members above to add them here.</Text>
          ) : (
            <div className="grid gap-1.5">
              {selectedMembers.map((member) => (
                <Checkbox
                  key={member.id}
                  label={`${numberOf(member)} ${memberDisplayName(member)}`}
                  checked
                  onCheckedChange={(checked) => toggle(member.id, checked)}
                />
              ))}
            </div>
          )}
        </div>
        <Text variant="secondary" size="sm">
          {selectedMembers.length === 0
            ? 'No players selected'
            : `${plural(selectedMembers.length, 'player')} selected. Untick to remove.`}
        </Text>
        {singles ? null : (
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
          <Button
            type="submit"
            variant="primary"
            disabled={task.busy || busy || selectedMembers.length === 0}
          >
            {task.busy ? 'Adding…' : `Add ${plural(Math.max(selectedMembers.length, 1), 'player')}`}
          </Button>
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}
