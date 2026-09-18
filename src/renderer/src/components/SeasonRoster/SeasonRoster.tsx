import { Badge, Table, Text } from '@cloudflare/kumo'
import {
  formatMemberNumber,
  memberDisplayName,
  resolveMember,
  sortTeams,
  type Player,
  type RosterSeason,
  type Team
} from '@shared/members'
import { plural } from '@renderer/lib/plural'
import { formatLabel } from '@renderer/lib/season-format'
import { FILE_TABLE_CLASS, STATIC_ROW_CLASS } from '../FileBrowser/styles'
import type { Props } from './interface'

const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })
const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' })

function formatDate(value: string | undefined): string {
  if (!value) return '—'
  const [year, month, day] = value.split('-').map(Number)
  return date.format(new Date(year, month - 1, day))
}

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

function PlayersTab({ season, snapshot }: Omit<Props, 'tab'>): React.JSX.Element {
  const groups = groupPlayers(season)
  const total = season.file.players.length
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <Table aria-label="Players" layout="fixed" className={FILE_TABLE_CLASS}>
        <Table.Header sticky>
          <Table.Row className="text-kumo-subtle">
            <Table.Head>Team</Table.Head>
            <Table.Head className="w-24">Number</Table.Head>
            <Table.Head>Player</Table.Head>
            <Table.Head className="w-24">Position</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {total === 0 ? (
            <Table.Row>
              <Table.Cell colSpan={4} className="py-10 text-center text-kumo-subtle">
                No players yet. Add teams and players to build this season’s roster.
              </Table.Cell>
            </Table.Row>
          ) : (
            groups.flatMap((group) =>
              group.players.length === 0
                ? [
                    <Table.Row key={group.key} className={STATIC_ROW_CLASS}>
                      <Table.Cell className="font-medium">{group.title}</Table.Cell>
                      <Table.Cell colSpan={3} className="text-kumo-subtle">
                        {group.team ? 'No players' : 'No subs'}
                      </Table.Cell>
                    </Table.Row>
                  ]
                : group.players.map((player, index) => {
                    const member = resolveMember(snapshot.members, player.memberId)
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
                      </Table.Row>
                    )
                  })
            )
          )}
        </Table.Body>
      </Table>
    </div>
  )
}

function TeamsTab({ season }: Omit<Props, 'tab' | 'snapshot'>): React.JSX.Element {
  const teams = sortTeams(season.file.teams)
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <Table aria-label="Teams" layout="fixed" className={FILE_TABLE_CLASS}>
        <Table.Header sticky>
          <Table.Row className="text-kumo-subtle">
            <Table.Head className="w-20">No.</Table.Head>
            <Table.Head>Team</Table.Head>
            <Table.Head className="w-32">Players</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {teams.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan={3} className="py-10 text-center text-kumo-subtle">
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
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table>
    </div>
  )
}

function SettingsTab({ season }: Omit<Props, 'tab' | 'snapshot'>): React.JSX.Element {
  const file = season.file
  const rows: [string, React.ReactNode][] = [
    ['Format', formatLabel(file.format)],
    ['Start date', formatDate(file.startDate)],
    ['Start time', file.startTime ?? '—'],
    ['Weeks', file.weeks ?? '—'],
    [
      'Fee per week',
      file.fees ? (
        <span>
          {money.format(file.fees.total)}
          {file.fees.breakdown.length > 0 ? (
            <span className="text-kumo-subtle">
              {' '}
              (
              {file.fees.breakdown
                .map((part) => `${part.label} ${money.format(part.amount)}`)
                .join(', ')}
              )
            </span>
          ) : null}
        </span>
      ) : (
        '—'
      )
    ],
    ['Sub fee', file.subFee !== undefined ? money.format(file.subFee) : '—'],
    ['LeagueSecretary id', file.leagueSecretaryId ?? '—']
  ]
  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-3" role="region" aria-label="Settings">
      <dl className="grid max-w-xl grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-base">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-kumo-subtle">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4">
        <Text variant="secondary" size="sm">
          Settings are read-only for now; editing arrives with the roster editor.
        </Text>
      </p>
    </div>
  )
}

/** The season's roster, teams and settings, read from its season file. */
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
