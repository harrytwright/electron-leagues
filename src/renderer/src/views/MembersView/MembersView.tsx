import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  DropdownMenu,
  InputGroup,
  Select,
  Text,
  Toolbar,
  useKumoToastManager
} from '@cloudflare/kumo'
import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { UserPlusIcon } from '@phosphor-icons/react/dist/csr/UserPlus'
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle'
import {
  memberDisplayName,
  type Member,
  type MembersProblem,
  type MembersSnapshot
} from '@shared/members'
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
  nextMembersSort,
  QUICK_FILTER_LABELS,
  QUICK_FILTERS,
  type MembersSortColumn,
  type QuickFilter
} from '@renderer/lib/members-filter'
import {
  loadMembersTable,
  saveMembersTable,
  type MembersTablePreference
} from '@renderer/lib/members-table-store'
import { pathTail } from '@renderer/lib/path-basename'
import { plural } from '@renderer/lib/plural'
import { membersQueryKey } from '@renderer/queries/members'
import { DeleteMemberDialog } from '@renderer/components/DeleteMemberDialog'
import { DiscardDraftDialog, type DraftSubject } from '@renderer/components/DiscardDraftDialog'
import { ErrorState } from '@renderer/components/ErrorState'
import { ExportCsvDialog } from '@renderer/components/ExportCsvDialog'
import { MbdSyncDialog } from '@renderer/components/MbdSyncDialog'
import { ResetMembersDialog } from '@renderer/components/ResetMembersDialog'
import type { Props } from './interface'
import { MembersWorkspace, type PaneAction } from './MembersWorkspace'

const ALL_LEAGUES = '*'

/** Cards stay parked until the desk can choose a template for them; the actions say so. */
const CARDS_PARKED = 'needs a card template'

const QUICK_FILTER_ITEMS = Object.fromEntries(
  QUICK_FILTERS.map((filter) => [filter, `Show: ${QUICK_FILTER_LABELS[filter]}`])
)

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
    case 'absorbed-number':
      return `${pathTail(problem.path)} lists member ${problem.memberId} under a number that was merged into member ${problem.into}`
  }
}

function EnableMembers({ root }: { root: string }): React.JSX.Element {
  const { add } = useKumoToastManager()
  const operation = useWriteOperation({
    operation: 'enableMembers',
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
  Exclude<PaneAction, null> | { kind: 'reset' } | { kind: 'delete'; member: Member }

function MembersTable({
  snapshot,
  tree
}: {
  snapshot: MembersSnapshot
  tree: Props['tree']
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [quick, setQuick] = useState<QuickFilter>('all')
  const [leagueFolder, setLeagueFolder] = useState<string>(ALL_LEAGUES)
  const [action, setAction] = useState<MemberAction | null>(null)
  const [syncPath, setSyncPath] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [paneBusy, setPaneBusy] = useState(false)
  // A guardian link write holds the workspace on its own, separately from a form or merge
  // pane's own hold, so the two can never clear each other's while both are in flight.
  const [linkBusy, setLinkBusy] = useState(false)
  const busy = paneBusy || linkBusy
  const [paneDirty, setPaneDirty] = useState(false)
  const [departure, setDeparture] = useState<{
    proceed: () => void
    revision: string
  } | null>(null)
  const paneInstance = useRef(0)
  const [table, setTable] = useState<MembersTablePreference>(loadMembersTable)
  const [compact, setCompact] = useState(false)
  const tableRoot = useRef<HTMLDivElement>(null)
  // A watcher refresh mid-prompt would let Discard reopen a pane seeded from a record that is
  // no longer current, saving it against the fresh revision the editor stamps; closing the
  // prompt instead keeps the desk's own draft open, untouched, to retry against the new list.
  if (departure !== null && departure.revision !== snapshot.revision) {
    setDeparture(null)
  }
  const leavePane = (proceed: () => void): void => {
    if (paneDirty) setDeparture({ proceed, revision: snapshot.revision })
    else proceed()
  }
  const discardDraft = (): void => {
    const proceed = departure?.proceed
    setDeparture(null)
    proceed?.()
  }
  const drop = useImportDrop((path) => {
    if (busy) return
    leavePane(() => {
      setAction(null)
      setSyncPath(path)
    })
  })
  const filterRef = useRef<HTMLInputElement>(null)
  const coordinator = useQueryRefresh()
  const { add } = useKumoToastManager()
  const renumber = useWriteOperation({
    operation: 'renumberDuplicates',
    label: () => 'Renumbering members',
    write: ({ id, keepIndex }: { id: number; keepIndex: number }) =>
      window.api.renumberDuplicates(id, keepIndex, snapshot.revision)
  })
  const repair = useWriteOperation({
    operation: 'repairRosters',
    label: () => 'Tidying rosters',
    write: () => window.api.repairRosters(snapshot.revision),
    refreshQueryKey: membersQueryKey
  })
  const repairRosters = async (): Promise<void> => {
    try {
      const outcome = await repair.run(undefined)
      const done = `Tidied ${plural(outcome.result, 'roster')}`
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
  const absorbedNumbers = snapshot.problems.some((problem) => problem.kind === 'absorbed-number')

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
  const setPaneAction = (next: PaneAction): void => setAction(next)
  const updatePaneAction = (update: (current: PaneAction) => PaneAction): void => {
    setAction((current) => {
      const pane =
        current?.kind === 'new' || current?.kind === 'edit' || current?.kind === 'merge'
          ? current
          : null
      return update(pane)
    })
  }
  const startPaneAction = (kind: 'new' | 'edit' | 'merge' | 'guardian', member?: Member): void => {
    paneInstance.current += 1
    const instance = paneInstance.current
    if (kind === 'guardian' && member) {
      setAction({ kind: 'new', instance, guardianFor: member })
    } else if (kind === 'merge' && member) {
      setAction({
        kind,
        instance,
        openingSnapshot: snapshot,
        selectedIds: [member.id],
        mainId: member.id,
        selectionFrozen: false
      })
    } else if (kind === 'edit' && member) {
      setAction({ kind, member, instance })
    } else {
      setAction({ kind: 'new', instance })
    }
  }
  const pickExport = async (): Promise<void> => {
    try {
      const path = await window.api.pickImportFile()
      if (path) setSyncPath(path)
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    }
  }

  const arrange = (next: MembersTablePreference): void => {
    setTable(next)
    saveMembersTable(next)
  }
  const sortBy = (column: MembersSortColumn): void => {
    arrange({ ...table, sort: nextMembersSort(table.sort, column) })
  }

  useAppCommandHandler('refresh', () => void coordinator.refresh())
  useAppCommandHandler('focus-filter', () => {
    const filter = filterRef.current
    if (!filter) return
    if (document.activeElement === filter) filter.select()
    else filter.focus()
  })

  useEffect(() => {
    const node = tableRoot.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 720))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const draftSubject: DraftSubject | null =
    action?.kind === 'edit'
      ? { kind: 'edit', name: memberDisplayName(action.member) }
      : action?.kind === 'new'
        ? { kind: 'new' }
        : action?.kind === 'merge'
          ? { kind: 'merge' }
          : null

  const rows = useMemo(() => buildMemberRows(snapshot, new Date()), [snapshot])
  const leagues = leagueChoices(snapshot)
  // The count reads "of" the quick filter's population, so Deleted counts deleted members.
  const population = useMemo(
    () => filterMemberRows(rows, snapshot, { query: '', quick, leagueFolder: null }),
    [rows, snapshot, quick]
  )
  const visible = useMemo(
    () =>
      filterMemberRows(rows, snapshot, {
        query,
        quick,
        leagueFolder: leagueFolder === ALL_LEAGUES ? null : leagueFolder
      }).sort((a, b) => compareMemberRows(a, b, table.sort)),
    [rows, snapshot, query, quick, leagueFolder, table.sort]
  )
  // Cards and exports are for people on the list today; a hidden record is neither.
  const listed = visible.flatMap((row) => (row.member.deleted ? [] : [row.member.id]))
  const leagueItems = {
    [ALL_LEAGUES]: 'All leagues',
    ...Object.fromEntries(leagues.map((league) => [league.folder, league.name]))
  }

  return (
    <div
      ref={tableRoot}
      className="flex min-h-0 flex-1 flex-col"
      data-import-drop-target
      onDragOver={drop.onDragOver}
      onDrop={drop.onDrop}
    >
      <div
        className={`shrink-0 border-b border-kumo-line bg-kumo-base ${compact ? 'px-3 py-2' : 'px-4 pt-3 pb-3'}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="grid min-w-0 gap-1">
            <Text as="h1" variant="heading" size="lg">
              Members
            </Text>
            {compact ? null : (
              <Text variant="secondary" size="sm">
                Find contact details, manage records and prepare member cards.
              </Text>
            )}
          </div>
          <Toolbar aria-label="Member actions">
            <DropdownMenu>
              <DropdownMenu.Trigger render={<Toolbar.Button>More actions</Toolbar.Button>} />
              <DropdownMenu.Content align="end">
                <DropdownMenu.Item
                  disabled={busy}
                  onClick={() =>
                    leavePane(() => {
                      setAction(null)
                      void pickExport()
                    })
                  }
                >
                  Sync from MBD…
                </DropdownMenu.Item>
                {/* The `printCards` channel is wired in main; this item wakes up with a template. */}
                <DropdownMenu.Item disabled>
                  {`Print ${plural(listed.length, 'card')} (${CARDS_PARKED})`}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  disabled={listed.length === 0 || busy}
                  onClick={() =>
                    leavePane(() => {
                      setAction(null)
                      setExporting(true)
                    })
                  }
                >
                  Export list to CSV…
                </DropdownMenu.Item>
                {import.meta.env.DEV ? (
                  <>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item
                      variant="danger"
                      disabled={busy}
                      onClick={() => leavePane(() => setAction({ kind: 'reset' }))}
                    >
                      Delete all members…
                    </DropdownMenu.Item>
                  </>
                ) : null}
              </DropdownMenu.Content>
            </DropdownMenu>
            <Toolbar.Button
              type="button"
              icon={<UserPlusIcon aria-hidden size={14} />}
              disabled={busy}
              onClick={() => leavePane(() => startPaneAction('new'))}
            >
              New member…
            </Toolbar.Button>
          </Toolbar>
        </div>
      </div>
      <div className={`shrink-0 border-b border-kumo-line ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
        <Toolbar aria-label="Find members" className="w-full">
          <Toolbar.InputGroup>
            <InputGroup.Addon>
              <MagnifyingGlassIcon />
            </InputGroup.Addon>
            <InputGroup.Input
              ref={filterRef}
              type="search"
              aria-label="Filter members"
              placeholder="Search by name or member number"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1"
            />
          </Toolbar.InputGroup>
          <Select
            aria-label="Show"
            value={quick}
            items={QUICK_FILTER_ITEMS}
            onValueChange={(value) => {
              if (value && isQuickFilter(value)) setQuick(value)
            }}
            render={<Toolbar.Button focusableWhenDisabled={false} />}
          />
          {leagues.length > 0 ? (
            <Select
              aria-label="League"
              value={leagueFolder}
              items={leagueItems}
              onValueChange={(value) => {
                if (value) setLeagueFolder(value)
              }}
              render={<Toolbar.Button focusableWhenDisabled={false} />}
            />
          ) : null}
        </Toolbar>
      </div>
      {snapshot.problems.length > 0 ? (
        <section
          aria-label="Problems"
          className={`flex shrink-0 items-start gap-2 border-b border-kumo-line bg-kumo-tint ${compact ? 'px-3 py-1.5' : 'px-4 py-2.5'}`}
        >
          <WarningCircleIcon aria-hidden size={16} className="mt-0.5 shrink-0 text-kumo-danger" />
          <div className="grid gap-1">
            {compact ? null : (
              <Text as="h2" variant="heading">
                Some records need attention
              </Text>
            )}
            <ul className="grid gap-0.5 text-kumo-subtle">
              {snapshot.problems.map((problem, index) => (
                <li key={index}>{describeProblem(problem)}</li>
              ))}
            </ul>
            {absorbedNumbers ? (
              <Text variant="secondary" size="sm">
                On a folder shared through OneDrive, wait until syncing has finished before tidying
                up: the members list can arrive before the rosters that go with it.
              </Text>
            ) : null}
          </div>
          {absorbedNumbers ? (
            <Button
              type="button"
              size="sm"
              className="ml-auto shrink-0"
              loading={repair.pending}
              disabled={repair.pending || busy}
              onClick={() => void repairRosters()}
            >
              {repair.pending ? 'Tidying…' : 'Tidy up rosters'}
            </Button>
          ) : null}
        </section>
      ) : null}
      <MembersWorkspace
        snapshot={snapshot}
        tree={tree}
        rows={rows}
        visible={visible}
        duplicatedIds={duplicatedIds}
        renumbering={renumber.pending}
        compact={compact}
        paneBusy={busy}
        sort={table.sort}
        onSort={sortBy}
        onAction={(kind, member) => {
          if (kind === 'delete') setAction({ kind, member })
          else startPaneAction(kind, member)
        }}
        onKeepNumber={(member) =>
          leavePane(() => {
            setAction(null)
            void keepNumber(member)
          })
        }
        paneAction={
          action?.kind === 'new' || action?.kind === 'edit' || action?.kind === 'merge'
            ? action
            : null
        }
        onPaneActionChange={setPaneAction}
        onPaneActionUpdate={updatePaneAction}
        onPaneBusyChange={setPaneBusy}
        onLinkBusyChange={setLinkBusy}
        onPaneDirtyChange={setPaneDirty}
        onLeavePane={leavePane}
        onBackgroundError={(message) => add({ title: message, variant: 'error' })}
        onBackgroundSuccess={(message) => add({ title: message, variant: 'success' })}
      />
      <div className="flex shrink-0 items-center justify-between border-t border-kumo-line px-4 py-1.5">
        <Text variant="secondary" size="sm">
          {visible.length === population.length
            ? plural(visible.length, 'member')
            : `Showing ${visible.length} of ${population.length} members`}
        </Text>
        {query || quick !== 'all' || leagueFolder !== ALL_LEAGUES ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery('')
              setQuick('all')
              setLeagueFolder(ALL_LEAGUES)
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      <ExportCsvDialog ids={listed} open={exporting} onOpenChange={setExporting} />
      <MbdSyncDialog
        snapshot={snapshot}
        path={syncPath}
        onOpenChange={(open) => {
          if (!open) setSyncPath(null)
        }}
      />
      <DiscardDraftDialog
        subject={draftSubject}
        open={departure !== null}
        onOpenChange={(open) => {
          if (!open) setDeparture(null)
        }}
        onDiscard={discardDraft}
      />
      <DeleteMemberDialog
        snapshot={snapshot}
        member={action?.kind === 'delete' ? action.member : null}
        open={action?.kind === 'delete'}
        onOpenChange={closeAction}
        onDeleted={() => setAction(null)}
      />
      {import.meta.env.DEV ? (
        <ResetMembersDialog
          snapshot={snapshot}
          open={action?.kind === 'reset'}
          onOpenChange={closeAction}
          onReset={() => setAction(null)}
        />
      ) : null}
    </div>
  )
}

export function MembersView({ tree }: Props): React.JSX.Element {
  const members = useMembers()
  const coordinator = useQueryRefresh()

  let body: React.JSX.Element
  if (members.isPending && !members.data) {
    body = <div className="flex flex-1 items-center justify-center text-kumo-subtle">Loading…</div>
  } else if (members.isError && !members.data) {
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
    body = <MembersTable snapshot={members.data} tree={tree} />
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {members.data?.enabled ? null : (
        <div className="shrink-0 border-b border-kumo-line px-4 pt-3 pb-2">
          <Text as="h1" variant="heading" size="lg">
            Members
          </Text>
        </div>
      )}
      {members.isError && members.data ? (
        <section
          aria-label="Members list problem"
          aria-live="polite"
          className="flex shrink-0 items-center justify-between gap-3 border-b border-kumo-line bg-kumo-tint px-4 py-2"
        >
          <div className="min-w-0">
            <Text as="h2" variant="heading">
              Couldn’t refresh the members list
            </Text>
            <Text variant="secondary" size="sm">
              {ipcErrorMessage(members.error)}
            </Text>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={members.isFetching}
            onClick={() => void coordinator.refresh({ queryKey: membersQueryKey(tree.root) })}
          >
            {members.isFetching ? 'Retrying…' : 'Try again'}
          </Button>
        </section>
      ) : null}
      {body}
    </div>
  )
}
