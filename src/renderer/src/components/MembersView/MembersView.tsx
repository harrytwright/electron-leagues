import { useMemo, useRef, useState } from 'react'
import {
  Badge,
  Button,
  DropdownMenu,
  Input,
  Select,
  Table,
  Text,
  useKumoToastManager
} from '@cloudflare/kumo'
import { ArrowsClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowsClockwise'
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple'
import { IdentificationCardIcon } from '@phosphor-icons/react/dist/csr/IdentificationCard'
import { DotsThreeIcon } from '@phosphor-icons/react/dist/csr/DotsThree'
import { UserPlusIcon } from '@phosphor-icons/react/dist/csr/UserPlus'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle'
import type { Member, MembersProblem, MembersSnapshot } from '@shared/members'
import { useAppCommandHandler } from '@renderer/hooks/use-app-commands'
import { useImportDrop } from '@renderer/hooks/use-import-drop'
import { useMembers } from '@renderer/hooks/use-members'
import { useQueryRefresh } from '@renderer/hooks/use-query-refresh'
import { useWriteOperation } from '@renderer/hooks/use-write-operation'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import {
  buildMemberRows,
  compareMemberRows,
  filterMemberRows,
  isQuickFilter,
  leagueChoices,
  QUICK_FILTER_LABELS,
  QUICK_FILTERS,
  type MemberRow,
  type QuickFilter
} from '@renderer/lib/members-filter'
import { pathTail } from '@renderer/lib/path-basename'
import { plural } from '@renderer/lib/plural'
import { DeleteMemberDialog } from '../DeleteMemberDialog'
import { ErrorState } from '../ErrorState'
import { ExportCsvDialog } from '../ExportCsvDialog'
import { MbdSyncDialog } from '../MbdSyncDialog'
import { IconButton } from '../IconButton'
import { MemberDialog } from '../MemberDialog'
import { MergeMemberDialog } from '../MergeMemberDialog'
import { FILE_TABLE_CLASS, STATIC_ROW_CLASS } from '../FileBrowser/styles'
import type { Props } from './interface'

const ALL_LEAGUES = '*'

const QUICK_FILTER_ITEMS = Object.fromEntries(
  QUICK_FILTERS.map((filter) => [filter, QUICK_FILTER_LABELS[filter]])
)

const born = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' })

function formatBorn(dob: string | undefined): string {
  if (!dob) return '—'
  const [year, month, day] = dob.split('-').map(Number)
  return born.format(new Date(year, month - 1, day))
}

function contactSummary(row: MemberRow): string {
  const member = row.member
  if (member.guardianContact && !member.email && !member.phone) {
    return `Guardian: ${member.guardianContact}`
  }
  return [member.email, member.phone].filter(Boolean).join(' · ') || '—'
}

function describeProblem(problem: MembersProblem): string {
  switch (problem.kind) {
    case 'invalid-file':
      return problem.message
    case 'unlinked-player':
      return `${pathTail(problem.path)} lists member ${problem.memberId}, who is not in the master list`
    case 'unknown-team':
      return `${pathTail(problem.path)} puts member ${problem.memberId} in a team that no longer exists`
    case 'duplicate-number':
      return `Member number ${problem.id} is used ${plural(problem.count, 'time')}`
  }
}

function EnableMembers({ root }: { root: string }): React.JSX.Element {
  const { add } = useKumoToastManager()
  const operation = useWriteOperation({
    label: () => 'Enabling members',
    write: () => window.api.enableMembers()
  })

  const enable = async (): Promise<void> => {
    try {
      const outcome = await operation.run(undefined)
      if (outcome.status === 'refresh-failed') {
        add({
          title: `Enabled members, but the location could not be refreshed: ${outcome.refreshError}`,
          variant: 'error'
        })
      }
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-5">
      <div className="grid max-w-md gap-1.5 text-center">
        <Text as="h2" variant="heading">
          Members database is off for this location
        </Text>
        <Text variant="secondary">
          Turning it on adds a members.json file to {pathTail(root)} and gives every new season a
          roster, teams and settings.
        </Text>
      </div>
      <Button
        variant="primary"
        loading={operation.pending}
        disabled={operation.pending}
        onClick={() => void enable()}
      >
        {operation.pending ? 'Enabling…' : 'Enable members database'}
      </Button>
    </div>
  )
}

type MemberAction =
  | { kind: 'new' }
  | { kind: 'edit'; member: Member }
  | { kind: 'merge'; member: Member }
  | { kind: 'delete'; member: Member }

function MembersTable({ snapshot }: { snapshot: MembersSnapshot }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [quick, setQuick] = useState<QuickFilter>('all')
  const [leagueFolder, setLeagueFolder] = useState<string>(ALL_LEAGUES)
  const [action, setAction] = useState<MemberAction | null>(null)
  const [syncPath, setSyncPath] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const drop = useImportDrop(setSyncPath)
  const filterRef = useRef<HTMLInputElement>(null)
  const coordinator = useQueryRefresh()
  const { add } = useKumoToastManager()
  const renumber = useWriteOperation({
    label: () => 'Renumbering members',
    write: ({ id, keepIndex }: { id: number; keepIndex: number }) =>
      window.api.renumberDuplicates(id, keepIndex, snapshot.revision)
  })

  const cards = useWriteOperation({
    label: (ids: number[]) => `Printing ${plural(ids.length, 'card')}`,
    write: (ids) => window.api.printCards(ids, snapshot.revision)
  })

  const printCards = async (ids: number[]): Promise<void> => {
    if (ids.length === 0 || cards.pending) return
    try {
      const outcome = await cards.run(ids)
      const done = `Made a sheet of ${plural(ids.length, 'card')} and opened it for printing`
      add({
        title:
          outcome.status === 'refresh-failed'
            ? `${done}, but the list could not be refreshed: ${outcome.refreshError}`
            : done,
        variant: outcome.status === 'refresh-failed' ? 'error' : 'success'
      })
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    }
  }

  const keepNumber = async (member: Member): Promise<void> => {
    const holders = snapshot.members.filter((candidate) => candidate.id === member.id)
    try {
      const outcome = await renumber.run({ id: member.id, keepIndex: holders.indexOf(member) })
      const done = `Gave ${plural(outcome.result.length, 'other record')} a new number`
      add({
        title:
          outcome.status === 'refresh-failed'
            ? `${done}, but the list could not be refreshed: ${outcome.refreshError}`
            : done,
        variant: outcome.status === 'refresh-failed' ? 'error' : 'success'
      })
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    }
  }
  const duplicatedIds = new Set(
    snapshot.problems.flatMap((problem) =>
      problem.kind === 'duplicate-number' ? [problem.id] : []
    )
  )
  const closeAction = (open: boolean): void => {
    if (!open) setAction(null)
  }
  const pickExport = async (): Promise<void> => {
    try {
      const path = await window.api.pickImportFile()
      if (path) setSyncPath(path)
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    }
  }

  useAppCommandHandler('refresh', () => void coordinator.refresh())
  useAppCommandHandler('focus-filter', () => {
    const filter = filterRef.current
    if (!filter) return
    if (document.activeElement === filter) filter.select()
    else filter.focus()
  })

  const rows = useMemo(() => buildMemberRows(snapshot, new Date()), [snapshot])
  const leagues = leagueChoices(snapshot)
  // The count reads "of" the quick filter's population, so Deleted counts deleted members.
  const population = filterMemberRows(rows, snapshot, { query: '', quick, leagueFolder: null })
  const visible = filterMemberRows(rows, snapshot, {
    query,
    quick,
    leagueFolder: leagueFolder === ALL_LEAGUES ? null : leagueFolder
  }).sort(compareMemberRows)
  const nothingYet = quick === 'all' && population.length === 0
  // Cards and exports are for people on the list today; a hidden record is neither.
  const listed = visible.flatMap((row) => (row.member.deleted ? [] : [row.member.id]))
  const leagueItems = {
    [ALL_LEAGUES]: 'All leagues',
    ...Object.fromEntries(leagues.map((league) => [league.folder, league.name]))
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-import-drop-target
      onDragOver={drop.onDragOver}
      onDrop={drop.onDrop}
    >
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-kumo-line px-4 py-2">
        <div className="relative w-64">
          <Input
            ref={filterRef}
            type="search"
            aria-label="Filter members"
            placeholder="Name, alias or number"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pr-8 pl-8"
          />
          <MagnifyingGlassIcon
            aria-hidden
            size={14}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-kumo-subtle"
          />
          {query ? (
            <IconButton
              variant="ghost"
              size="xs"
              icon={<XIcon aria-hidden />}
              aria-label="Clear filter"
              className="absolute top-1/2 right-1 -translate-y-1/2"
              onClick={() => setQuery('')}
            />
          ) : null}
        </div>
        <Select
          aria-label="Show"
          value={quick}
          items={QUICK_FILTER_ITEMS}
          onValueChange={(value) => {
            if (value && isQuickFilter(value)) setQuick(value)
          }}
        />
        {leagues.length > 0 ? (
          <Select
            aria-label="League"
            value={leagueFolder}
            items={leagueItems}
            onValueChange={(value) => {
              if (value) setLeagueFolder(value)
            }}
          />
        ) : null}
        <span className="ml-auto">
          <Text variant="secondary" size="sm">
            Showing {visible.length} of {population.length}
          </Text>
        </span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={<IdentificationCardIcon aria-hidden size={14} />}
          disabled={cards.pending || listed.length === 0}
          onClick={() => void printCards(listed)}
        >
          {cards.pending
            ? 'Printing…'
            : listed.length === 0
              ? 'Print cards'
              : `Print ${plural(listed.length, 'card')}`}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={<DownloadSimpleIcon aria-hidden size={14} />}
          disabled={listed.length === 0}
          onClick={() => setExporting(true)}
        >
          Export CSV…
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={<ArrowsClockwiseIcon aria-hidden size={14} />}
          onClick={() => void pickExport()}
        >
          Sync from MBD…
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={<UserPlusIcon aria-hidden size={14} />}
          onClick={() => setAction({ kind: 'new' })}
        >
          New member…
        </Button>
      </div>
      {snapshot.problems.length > 0 ? (
        <section
          aria-label="Problems"
          className="flex shrink-0 items-start gap-2 border-b border-kumo-line px-4 py-2 text-sm"
        >
          <WarningCircleIcon aria-hidden size={16} className="mt-0.5 shrink-0 text-kumo-danger" />
          <ul className="grid gap-0.5">
            {snapshot.problems.map((problem, index) => (
              <li key={index}>{describeProblem(problem)}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        <Table aria-label="Members" layout="fixed" className={FILE_TABLE_CLASS}>
          <Table.Header sticky>
            <Table.Row className="text-kumo-subtle">
              <Table.Head className="w-24">Number</Table.Head>
              <Table.Head>Name</Table.Head>
              <Table.Head className="w-28">Born</Table.Head>
              <Table.Head>Contact</Table.Head>
              <Table.Head>Leagues</Table.Head>
              <Table.Head className="w-12">
                <span className="sr-only">Actions</span>
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {visible.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={6} className="py-10 text-center text-kumo-subtle">
                  {nothingYet
                    ? 'No members yet. New seasons add players here as you build their rosters.'
                    : 'No members match this filter.'}
                </Table.Cell>
              </Table.Row>
            ) : (
              // Duplicate numbers are a real state this table exists to show, so the key needs the index.
              visible.map((row, index) => (
                <Table.Row key={`${row.member.id}-${index}`} className={STATIC_ROW_CLASS}>
                  <Table.Cell className="font-mono text-kumo-subtle">{row.number}</Table.Cell>
                  <Table.Cell>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{row.name}</span>
                      {row.member.deleted ? <Badge variant="secondary">Deleted</Badge> : null}
                      {row.needsDetails && !row.member.deleted ? (
                        <Badge variant="warning">Needs details</Badge>
                      ) : null}
                    </div>
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap text-kumo-subtle">
                    {formatBorn(row.member.dob)}
                  </Table.Cell>
                  <Table.Cell className="truncate text-kumo-subtle">
                    {contactSummary(row)}
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-wrap gap-1">
                      {row.memberships.map((membership, index) => (
                        <Badge
                          key={`${membership.seasonPath}-${index}`}
                          variant={membership.team ? 'info' : 'secondary'}
                        >
                          {membership.leagueName}
                          {membership.team ? '' : ' (sub)'}
                        </Badge>
                      ))}
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <DropdownMenu>
                      <DropdownMenu.Trigger
                        render={
                          <IconButton
                            variant="ghost"
                            size="sm"
                            icon={<DotsThreeIcon aria-hidden size={16} weight="bold" />}
                            aria-label={`Actions for ${row.name}`}
                          />
                        }
                      />
                      <DropdownMenu.Content>
                        {duplicatedIds.has(row.member.id) ? (
                          // Main addresses a member by number, so a shared number must be
                          // resolved before any other action can be trusted to hit this record.
                          <DropdownMenu.Item
                            disabled={renumber.pending}
                            onClick={() => void keepNumber(row.member)}
                          >
                            Keep this number, renumber the others
                          </DropdownMenu.Item>
                        ) : (
                          <>
                            <DropdownMenu.Item
                              disabled={row.member.deleted}
                              onClick={() => setAction({ kind: 'edit', member: row.member })}
                            >
                              Edit…
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              disabled={row.member.deleted}
                              onClick={() => setAction({ kind: 'merge', member: row.member })}
                            >
                              Merge into…
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              disabled={row.member.deleted || cards.pending}
                              onClick={() => void printCards([row.member.id])}
                            >
                              Print card
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator />
                            <DropdownMenu.Item
                              variant="danger"
                              disabled={row.member.deleted}
                              onClick={() => setAction({ kind: 'delete', member: row.member })}
                            >
                              Delete…
                            </DropdownMenu.Item>
                          </>
                        )}
                      </DropdownMenu.Content>
                    </DropdownMenu>
                  </Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table>
      </div>

      <MemberDialog
        snapshot={snapshot}
        member={action?.kind === 'edit' ? action.member : null}
        open={action?.kind === 'new' || action?.kind === 'edit'}
        onOpenChange={closeAction}
        onSaved={() => setAction(null)}
      />
      <MergeMemberDialog
        snapshot={snapshot}
        member={action?.kind === 'merge' ? action.member : null}
        open={action?.kind === 'merge'}
        onOpenChange={closeAction}
        onMerged={() => setAction(null)}
      />
      <ExportCsvDialog ids={listed} open={exporting} onOpenChange={setExporting} />
      <MbdSyncDialog
        snapshot={snapshot}
        path={syncPath}
        onOpenChange={(open) => {
          if (!open) setSyncPath(null)
        }}
      />
      <DeleteMemberDialog
        snapshot={snapshot}
        member={action?.kind === 'delete' ? action.member : null}
        open={action?.kind === 'delete'}
        onOpenChange={closeAction}
        onDeleted={() => setAction(null)}
      />
    </div>
  )
}

export function MembersView({ tree }: Props): React.JSX.Element {
  const members = useMembers()
  const coordinator = useQueryRefresh()

  let body: React.JSX.Element
  if (members.isPending) {
    body = <div className="flex flex-1 items-center justify-center text-kumo-subtle">Loading…</div>
  } else if (members.isError) {
    body = (
      <ErrorState>
        <ErrorState.Title as="h2">Couldn’t read the members files</ErrorState.Title>
        <ErrorState.Message>{ipcErrorMessage(members.error)}</ErrorState.Message>
        <ErrorState.Actions>
          <Button variant="primary" onClick={() => void coordinator.refresh()}>
            Try again
          </Button>
        </ErrorState.Actions>
      </ErrorState>
    )
  } else if (!members.data.enabled) {
    body = <EnableMembers root={tree.root} />
  } else {
    body = <MembersTable snapshot={members.data} />
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="sticky top-0 z-10 shrink-0 border-b border-kumo-line bg-kumo-base">
        <div className="flex items-start justify-between gap-4 px-4 pt-3 pb-2">
          <div className="flex min-w-0 items-center gap-2">
            <Text as="h1" variant="heading" size="lg">
              Members
            </Text>
            {members.data?.enabled ? (
              <Badge variant="neutral">
                {plural(
                  members.data.members.filter((m) => m.mergedInto === undefined && !m.deleted)
                    .length,
                  'member'
                )}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
      {body}
    </div>
  )
}
