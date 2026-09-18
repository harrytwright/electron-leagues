import { useState } from 'react'
import { Badge, Button, DropdownMenu, Table, Text, useKumoToastManager } from '@cloudflare/kumo'
import { DotsThreeIcon } from '@phosphor-icons/react/dist/csr/DotsThree'
import { FileArrowUpIcon } from '@phosphor-icons/react/dist/csr/FileArrowUp'
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus'
import { UserPlusIcon } from '@phosphor-icons/react/dist/csr/UserPlus'
import {
  formatMemberNumber,
  memberDisplayName,
  newTeamId,
  resolveMember,
  sortTeams,
  type Member,
  type Player,
  type RosterSeason,
  type SeasonFile,
  type Team
} from '@shared/members'
import { useImportDrop } from '@renderer/hooks/use-import-drop'
import { useSeasonSave } from '@renderer/hooks/use-season-save'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { plural } from '@renderer/lib/plural'
import { formatLabel } from '@renderer/lib/season-format'
import { FILE_TABLE_CLASS, STATIC_ROW_CLASS } from '../FileBrowser/styles'
import { IconButton } from '../IconButton'
import { MemberDialog } from '../MemberDialog'
import { RosterImportDialog } from '../RosterImportDialog'
import { AddPlayerDialog } from './components/AddPlayerDialog'
import { SettingsForm } from './components/SettingsForm'
import { TeamDialog } from './components/TeamDialog'
import type { Props } from './interface'

/** Positioned players in order, then anyone without a position in roster order. */
function byPositionThenUnplaced(a: Player, b: Player): number {
  if (a.position === undefined) return b.position === undefined ? 0 : 1
  if (b.position === undefined) return -1
  return a.position - b.position
}

interface PlayerGroup {
  key: string
  title: string
  team: Team | null
  players: Player[]
}

function groupPlayers(season: RosterSeason): PlayerGroup[] {
  const groups: PlayerGroup[] = sortTeams(season.file.teams).map((team) => ({
    key: team.id,
    title: `${team.teamNo}. ${team.name}`,
    team,
    players: season.file.players
      .filter((player) => player.teamId === team.id)
      .sort(byPositionThenUnplaced)
  }))
  const subs = season.file.players.filter(
    (player) => player.teamId === null || !season.file.teams.some((t) => t.id === player.teamId)
  )
  if (subs.length > 0 || groups.length === 0) {
    groups.push({ key: 'subs', title: 'Subs', team: null, players: subs })
  }
  return groups
}

/** The roster with one player's row replaced, dropped, or appended. */
function withPlayer(file: SeasonFile, memberId: number, next: Player | null): SeasonFile {
  const players = file.players.filter((player) => player.memberId !== memberId)
  if (next) players.push(next)
  return { ...file, players }
}

function randomToken(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 12)
}

type PlayersDialog = { kind: 'add' } | { kind: 'new-member' } | null

function PlayersTab({ season, snapshot }: Omit<Props, 'tab'>): React.JSX.Element {
  const [dialog, setDialog] = useState<PlayersDialog>(null)
  const [importPath, setImportPath] = useState<string | null>(null)
  const saver = useSeasonSave(season)
  const readOnly = season.archived
  const { add } = useKumoToastManager()
  const drop = useImportDrop(setImportPath)
  const pickExport = async (): Promise<void> => {
    try {
      const path = await window.api.pickImportFile()
      if (path) setImportPath(path)
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    }
  }
  const groups = groupPlayers(season)
  const teams = sortTeams(season.file.teams)
  const total = season.file.players.length

  const addPlayer = (player: Player): Promise<string | null> =>
    saver.save(withPlayer(season.file, player.memberId, player), 'Added to the roster')

  // A move changes only the team; the seat and any LeagueSecretary id travel with the player.
  const move = (player: Player, teamId: string | null): void => {
    void saver.save(withPlayer(season.file, player.memberId, { ...player, teamId }), 'Moved player')
  }

  const remove = (player: Player, member: Member | null): void => {
    void saver.save(
      withPlayer(season.file, player.memberId, null),
      `Removed ${member ? memberDisplayName(member) : 'player'} from the roster`
    )
  }

  const onMemberSaved = (member: Member): void => {
    setDialog(null)
    void addPlayer({ memberId: member.id, teamId: null })
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-import-drop-target={readOnly ? undefined : true}
      onDragOver={readOnly ? undefined : drop.onDragOver}
      onDrop={readOnly ? undefined : drop.onDrop}
    >
      {readOnly ? null : (
        <div className="flex shrink-0 items-center gap-2 border-b border-kumo-line px-4 py-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={<PlusIcon aria-hidden size={14} />}
            disabled={saver.pending}
            onClick={() => setDialog({ kind: 'add' })}
          >
            Add player…
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={<FileArrowUpIcon aria-hidden size={14} />}
            disabled={saver.pending}
            onClick={() => void pickExport()}
          >
            Add from export…
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={<UserPlusIcon aria-hidden size={14} />}
            disabled={saver.pending}
            onClick={() => setDialog({ kind: 'new-member' })}
          >
            New member…
          </Button>
          <span className="ml-auto">
            <Text variant="secondary" size="sm">
              {plural(total, 'player')} · {formatLabel(season.file.format)}
            </Text>
          </span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <Table aria-label="Players" layout="fixed" className={FILE_TABLE_CLASS}>
          <Table.Header sticky>
            <Table.Row className="text-kumo-subtle">
              <Table.Head>Team</Table.Head>
              <Table.Head className="w-24">Number</Table.Head>
              <Table.Head>Player</Table.Head>
              <Table.Head className="w-24">Position</Table.Head>
              <Table.Head className="w-12">
                <span className="sr-only">Actions</span>
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {total === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={5} className="py-10 text-center text-kumo-subtle">
                  {readOnly
                    ? 'This season had no players on record.'
                    : 'No players yet. Add teams and players to build this season’s roster.'}
                </Table.Cell>
              </Table.Row>
            ) : (
              groups.flatMap((group) =>
                group.players.length === 0
                  ? [
                      <Table.Row key={group.key} className={STATIC_ROW_CLASS}>
                        <Table.Cell className="font-medium">{group.title}</Table.Cell>
                        <Table.Cell colSpan={4} className="text-kumo-subtle">
                          {group.team ? 'No players' : 'No subs'}
                        </Table.Cell>
                      </Table.Row>
                    ]
                  : group.players.map((player, index) => {
                      const member = resolveMember(snapshot.members, player.memberId)
                      const name = member ? memberDisplayName(member) : `member ${player.memberId}`
                      return (
                        <Table.Row
                          key={`${group.key}-${player.memberId}`}
                          className={STATIC_ROW_CLASS}
                        >
                          <Table.Cell className="font-medium">
                            {index === 0 ? group.title : ''}
                          </Table.Cell>
                          <Table.Cell className="font-mono text-kumo-subtle">
                            {formatMemberNumber(player.memberId, snapshot.nextId)}
                          </Table.Cell>
                          <Table.Cell>
                            {member ? (
                              memberDisplayName(member)
                            ) : (
                              <span className="flex items-center gap-2">
                                <span className="text-kumo-subtle">Unknown member</span>
                                <Badge variant="warning">Unlinked</Badge>
                              </span>
                            )}
                          </Table.Cell>
                          <Table.Cell className="text-kumo-subtle">
                            {player.position ?? '—'}
                          </Table.Cell>
                          <Table.Cell>
                            {readOnly ? null : (
                              <DropdownMenu>
                                <DropdownMenu.Trigger
                                  render={
                                    <IconButton
                                      variant="ghost"
                                      size="sm"
                                      icon={<DotsThreeIcon aria-hidden size={16} weight="bold" />}
                                      aria-label={`Actions for ${name}`}
                                      disabled={saver.pending}
                                    />
                                  }
                                />
                                <DropdownMenu.Content>
                                  {teams
                                    .filter((team) => team.id !== player.teamId)
                                    .map((team) => (
                                      <DropdownMenu.Item
                                        key={team.id}
                                        onClick={() => move(player, team.id)}
                                      >
                                        Move to {team.teamNo}. {team.name}
                                      </DropdownMenu.Item>
                                    ))}
                                  {player.teamId !== null ? (
                                    <DropdownMenu.Item onClick={() => move(player, null)}>
                                      Make a sub
                                    </DropdownMenu.Item>
                                  ) : null}
                                  <DropdownMenu.Separator />
                                  <DropdownMenu.Item
                                    variant="danger"
                                    onClick={() => remove(player, member)}
                                  >
                                    Remove from roster
                                  </DropdownMenu.Item>
                                </DropdownMenu.Content>
                              </DropdownMenu>
                            )}
                          </Table.Cell>
                        </Table.Row>
                      )
                    })
              )
            )}
          </Table.Body>
        </Table>
      </div>

      <RosterImportDialog
        season={season}
        snapshot={snapshot}
        path={importPath}
        onOpenChange={(open) => {
          if (!open) setImportPath(null)
        }}
      />
      <AddPlayerDialog
        season={season}
        snapshot={snapshot}
        open={dialog?.kind === 'add'}
        busy={saver.pending}
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
        onAdd={addPlayer}
      />
      <MemberDialog
        snapshot={snapshot}
        member={null}
        open={dialog?.kind === 'new-member'}
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
        onSaved={onMemberSaved}
      />
    </div>
  )
}

type TeamsDialog = { kind: 'add' } | { kind: 'edit'; team: Team } | null

function TeamsTab({ season }: Omit<Props, 'tab' | 'snapshot'>): React.JSX.Element {
  const [dialog, setDialog] = useState<TeamsDialog>(null)
  const saver = useSeasonSave(season)
  const readOnly = season.archived
  const teams = sortTeams(season.file.teams)
  const editing = dialog?.kind === 'edit' ? dialog.team : null
  const nextNumber = teams.reduce((highest, team) => Math.max(highest, team.teamNo), 0) + 1

  const saveTeam = async (details: Omit<Team, 'id'>): Promise<string | null> => {
    const team: Team = { id: editing?.id ?? newTeamId(randomToken), ...details }
    const others = season.file.teams.filter((candidate) => candidate.id !== team.id)
    return saver.save(
      { ...season.file, teams: [...others, team] },
      editing ? `Saved ${team.name}` : `Added ${team.name}`
    )
  }

  const removeTeam = (team: Team): void => {
    void saver.save(
      {
        ...season.file,
        teams: season.file.teams.filter((candidate) => candidate.id !== team.id),
        players: season.file.players.map((player) =>
          player.teamId === team.id ? { ...player, teamId: null } : player
        )
      },
      `Removed ${team.name}; its players are now subs`
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {readOnly ? null : (
        <div className="flex shrink-0 items-center gap-2 border-b border-kumo-line px-4 py-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon={<PlusIcon aria-hidden size={14} />}
            disabled={saver.pending}
            onClick={() => setDialog({ kind: 'add' })}
          >
            Add team…
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <Table aria-label="Teams" layout="fixed" className={FILE_TABLE_CLASS}>
          <Table.Header sticky>
            <Table.Row className="text-kumo-subtle">
              <Table.Head className="w-20">No.</Table.Head>
              <Table.Head>Team</Table.Head>
              <Table.Head className="w-32">Players</Table.Head>
              <Table.Head className="w-12">
                <span className="sr-only">Actions</span>
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {teams.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={4} className="py-10 text-center text-kumo-subtle">
                  No teams yet.
                </Table.Cell>
              </Table.Row>
            ) : (
              teams.map((team) => (
                <Table.Row key={team.id} className={STATIC_ROW_CLASS}>
                  <Table.Cell className="text-kumo-subtle">{team.teamNo}</Table.Cell>
                  <Table.Cell className="font-medium">{team.name}</Table.Cell>
                  <Table.Cell className="text-kumo-subtle">
                    {plural(
                      season.file.players.filter((player) => player.teamId === team.id).length,
                      'player'
                    )}{' '}
                    of {season.file.format}
                  </Table.Cell>
                  <Table.Cell>
                    {readOnly ? null : (
                      <DropdownMenu>
                        <DropdownMenu.Trigger
                          render={
                            <IconButton
                              variant="ghost"
                              size="sm"
                              icon={<DotsThreeIcon aria-hidden size={16} weight="bold" />}
                              aria-label={`Actions for ${team.name}`}
                              disabled={saver.pending}
                            />
                          }
                        />
                        <DropdownMenu.Content>
                          <DropdownMenu.Item onClick={() => setDialog({ kind: 'edit', team })}>
                            Edit…
                          </DropdownMenu.Item>
                          <DropdownMenu.Separator />
                          <DropdownMenu.Item variant="danger" onClick={() => removeTeam(team)}>
                            Remove team
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table>
      </div>

      <TeamDialog
        team={editing}
        takenNumbers={teams.filter((team) => team.id !== editing?.id).map((team) => team.teamNo)}
        nextNumber={nextNumber}
        open={dialog !== null}
        busy={saver.pending}
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
        onSave={saveTeam}
      />
    </div>
  )
}

function SettingsTab({ season }: Omit<Props, 'tab' | 'snapshot'>): React.JSX.Element {
  const saver = useSeasonSave(season)
  return (
    <div className="min-h-0 flex-1 overflow-auto" role="region" aria-label="Settings">
      <SettingsForm
        file={season.file}
        revision={season.revision}
        readOnly={season.archived}
        busy={saver.pending}
        onSave={(file) => saver.save(file, 'Saved settings')}
      />
    </div>
  )
}

/** The season's roster, teams and settings, editable while the season is live. */
export function SeasonRoster({ season, snapshot, tab }: Props): React.JSX.Element {
  switch (tab) {
    case 'players':
      return <PlayersTab season={season} snapshot={snapshot} />
    case 'teams':
      return <TeamsTab season={season} />
    case 'settings':
      return <SettingsTab season={season} />
  }
}
