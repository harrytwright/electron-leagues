import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Badge, Button, Collapsible, DropdownMenu, Empty, Table, Text } from '@cloudflare/kumo'
import { CaretRightIcon, DotsThreeIcon, UserCircleIcon } from '@phosphor-icons/react'
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle'
import { MinusCircleIcon } from '@phosphor-icons/react/dist/csr/MinusCircle'
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle'
import type { Member, MemberInput, Membership, MembersSnapshot } from '@shared/members'
import type { LeaguesTree } from '@shared/tree'
import {
  deriveMemberships,
  formatMemberNumber,
  guardianOf,
  isUnder18,
  memberDisplayName,
  needsDetails
} from '@shared/members'
import { useQueryClient } from '@tanstack/react-query'
import { useQueryRefresh } from '@renderer/hooks/use-query-refresh'
import { useWriteOperation } from '@renderer/hooks/use-write-operation'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { membersQueryKey } from '@renderer/queries/members'
import {
  type MemberRow,
  type MembersSort,
  type MembersSortColumn
} from '@renderer/lib/members-filter'
import { useWorkspace } from '@renderer/hooks/use-workspace'
import { IconButton } from '@renderer/components/IconButton'
import { STATIC_ROW_CLASS } from '@renderer/components/FileBrowser/styles'
import { MemberEditor } from './MemberEditor'
import { MergeMemberPane } from './MergeMemberPane'

const SPLIT_KEY = 'leagues:members-workspace:v1'
const DEFAULT_LIST_PERCENT = 34
const MIN_LIST_PERCENT = 24
const MAX_LIST_PERCENT = 55
const RESIZE_STEP = 2
const born = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' })

function formatBorn(dob: string | undefined): string {
  if (!dob) return '—'
  const [year, month, day] = dob.split('-').map(Number)
  return born.format(new Date(year, month - 1, day))
}

function loadListPercent(): number {
  try {
    const value = Number(localStorage.getItem(SPLIT_KEY))
    return Number.isFinite(value) && value >= MIN_LIST_PERCENT && value <= MAX_LIST_PERCENT
      ? value
      : DEFAULT_LIST_PERCENT
  } catch {
    return DEFAULT_LIST_PERCENT
  }
}

function saveListPercent(value: number): void {
  try {
    localStorage.setItem(SPLIT_KEY, String(value))
  } catch {
    // Losing a layout preference is harmless when storage is unavailable.
  }
}

function dividerTarget(key: string, current: number): number | undefined {
  switch (key) {
    case 'ArrowLeft':
      return current - RESIZE_STEP
    case 'ArrowRight':
      return current + RESIZE_STEP
    case 'Home':
      return MIN_LIST_PERCENT
    case 'End':
      return MAX_LIST_PERCENT
    default:
      return undefined
  }
}

function clampListPercent(value: number): number {
  return Math.min(MAX_LIST_PERCENT, Math.max(MIN_LIST_PERCENT, Math.round(value)))
}

interface MemberStatus {
  label: string
  variant: 'secondary' | 'warning' | 'success'
}

function status(row: MemberRow): MemberStatus {
  if (row.member.deleted) return { label: 'Deleted', variant: 'secondary' }
  if (row.needsDetails) return { label: 'Needs details', variant: 'warning' }
  return { label: 'Active', variant: 'success' }
}

/** Each status has its own shape as well as its colour, so the list reads without colour. */
function StatusMark({ status: memberStatus }: { status: MemberStatus }): React.JSX.Element {
  const icon =
    memberStatus.variant === 'warning' ? (
      <WarningCircleIcon aria-hidden size={16} weight="fill" className="text-kumo-warning" />
    ) : memberStatus.variant === 'secondary' ? (
      <MinusCircleIcon aria-hidden size={16} className="text-kumo-subtle" />
    ) : (
      <CheckCircleIcon aria-hidden size={16} className="text-kumo-success" />
    )
  return (
    <span title={memberStatus.label} className="flex h-lh items-center">
      {icon}
      <span className="sr-only">{memberStatus.label}</span>
    </span>
  )
}

function DetailItem({
  label,
  value
}: {
  label: string
  value?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="grid gap-0.5">
      <dt className="text-base text-kumo-subtle">{label}</dt>
      <dd className="min-w-0 text-base break-words">{value || '—'}</dd>
    </div>
  )
}

function ProfileSection({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="grid gap-3 border-b border-kumo-line px-5 py-4 last:border-b-0">
      <Text as="h3" variant="heading3">
        {title}
      </Text>
      {children}
    </section>
  )
}

function MembershipList({
  memberships,
  onOpen
}: {
  memberships: Membership[]
  onOpen: (membership: Membership) => void
}): React.JSX.Element {
  if (memberships.length === 0) return <Text variant="secondary">None</Text>
  return (
    <ul className="grid gap-2">
      {memberships.map((membership, index) => (
        <li key={`${membership.seasonPath}-${index}`}>
          <button
            type="button"
            className="flex w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left ring ring-kumo-line hover:bg-kumo-tint focus-visible:outline-2 focus-visible:outline-kumo-focus"
            onClick={() => onOpen(membership)}
          >
            <span className="grid min-w-0 gap-0.5">
              <span className="font-medium">{membership.leagueName}</span>
              <span className="text-base text-kumo-subtle">
                {membership.season}
                {membership.team
                  ? ` · ${membership.team.name}`
                  : membership.singles
                    ? ''
                    : ' · Substitute'}
                {membership.position ? ` · Position ${membership.position}` : ''}
              </span>
            </span>
            <span className="flex h-lh shrink-0 items-center">
              <CaretRightIcon aria-hidden size={14} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function MemberProfile({
  row,
  members,
  memberships,
  tree,
  compact,
  duplicatedIds,
  renumbering,
  takeFocus,
  onAction,
  onOpenMember,
  onKeepNumber
}: {
  row: MemberRow
  members: readonly Member[]
  memberships: Membership[]
  tree: LeaguesTree
  compact: boolean
  duplicatedIds: Set<number>
  renumbering: boolean
  /** Called once on mount; true when the profile follows a form or merge and should take focus. */
  takeFocus: () => boolean
  onAction: (kind: ProfileAction, member: Member) => void
  onOpenMember: (member: Member) => void
  onKeepNumber: (member: Member) => void
}): React.JSX.Element {
  const select = useWorkspace((workspace) => workspace.select)
  const reportLeagueDir = useWorkspace((workspace) => workspace.reportLeagueDir)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (takeFocus()) heading.current?.focus()
    // Only the arrival matters; later renders of the same profile must not steal focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const current = memberships.filter((membership) => !membership.archived)
  const previous = memberships.filter((membership) => membership.archived)
  const member = row.member
  const memberStatus = status(row)
  const hasDuplicateNumber = duplicatedIds.has(member.id)
  const guardian = guardianOf(member, members)
  const guardianRemoved = guardian?.deleted ?? false
  const junior = member.dob !== undefined && isUnder18(member, new Date())
  const canAddGuardian =
    junior && !guardian && Boolean(member.guardianContact) && !member.deleted && !hasDuplicateNumber
  const openRoster = (membership: Membership): void => {
    const league = tree.days[membership.day].find(
      (candidate) => candidate.folderName === membership.leagueFolder
    )
    select({ kind: 'league', day: membership.day, folderName: membership.leagueFolder })
    if (league) {
      reportLeagueDir({
        ownerPath: league.path,
        currentDir: membership.seasonPath,
        tab: 'players'
      })
    }
  }

  return (
    <article aria-label={`${row.name} profile`} className="min-h-0 flex-1 overflow-auto">
      <header
        className={`sticky top-0 z-10 flex items-start justify-between border-b border-kumo-line bg-kumo-base ${compact ? 'gap-2 px-3 py-2' : 'gap-4 px-5 py-4'}`}
      >
        <div className="grid min-w-0 gap-1">
          <div className="truncate">
            <Text ref={heading} as="h2" variant="heading" size="lg" tabIndex={-1}>
              {row.name}
            </Text>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[0.9em] text-kumo-subtle">{row.number}</span>
            <Badge variant={memberStatus.variant}>{memberStatus.label}</Badge>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {hasDuplicateNumber ? (
            <Button size="sm" disabled={renumbering} onClick={() => onKeepNumber(member)}>
              Keep this number, renumber the others
            </Button>
          ) : (
            <>
              <Button disabled={member.deleted} size="sm" onClick={() => onAction('edit', member)}>
                Edit…
              </Button>
              <DropdownMenu>
                <DropdownMenu.Trigger
                  render={
                    <IconButton
                      variant="ghost"
                      size="sm"
                      icon={<DotsThreeIcon aria-hidden size={16} weight="bold" />}
                      aria-label={`More actions for ${row.name}`}
                    />
                  }
                />
                <DropdownMenu.Content align="end">
                  <DropdownMenu.Item
                    disabled={member.deleted}
                    onClick={() => onAction('merge', member)}
                  >
                    Merge with…
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item
                    variant="danger"
                    disabled={member.deleted}
                    onClick={() => onAction('delete', member)}
                  >
                    Delete…
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu>
            </>
          )}
        </div>
      </header>
      <ProfileSection title="Personal details">
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-x-6 gap-y-3">
          <DetailItem label="First name" value={member.firstName} />
          <DetailItem label="Last name" value={member.lastName} />
          <DetailItem label="Date of birth" value={formatBorn(member.dob)} />
          <DetailItem label="Gender" value={member.gender} />
        </dl>
      </ProfileSection>
      <ProfileSection title="Contact details">
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-x-6 gap-y-3">
          <DetailItem label="Email" value={member.email} />
          <DetailItem label="Phone" value={member.phone} />
          {guardian ? (
            <DetailItem
              label="Linked guardian"
              value={
                <span className="grid gap-0.5">
                  <button
                    type="button"
                    className="text-left font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-kumo-focus"
                    onClick={() => onOpenMember(guardian)}
                  >
                    {memberDisplayName(guardian)}
                    {guardianRemoved ? ' (removed)' : ''}
                  </button>
                  <span className="text-kumo-subtle">
                    {guardianRemoved
                      ? 'No longer on the list'
                      : [guardian.email, guardian.phone].filter(Boolean).join(', ') ||
                        'No contact on their record'}
                  </span>
                </span>
              }
            />
          ) : null}
          <DetailItem label="Guardian contact" value={member.guardianContact} />
          <DetailItem label="Marketing" value={member.marketing ? 'Allowed' : 'Not allowed'} />
        </dl>
        {canAddGuardian ? (
          <div>
            <Button size="sm" variant="secondary" onClick={() => onAction('guardian', member)}>
              Add guardian as a member…
            </Button>
          </div>
        ) : null}
      </ProfileSection>
      <ProfileSection title="Record information">
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-x-6 gap-y-3">
          <DetailItem label="Aliases" value={member.aliases.join(', ')} />
          <DetailItem label="MBD IDs" value={member.mbdIds.join(', ')} />
          <DetailItem label="Card issued" value={member.cardIssued} />
        </dl>
      </ProfileSection>
      <ProfileSection title="Notes">
        <div className="whitespace-pre-wrap">
          <Text>{member.notes || 'No notes'}</Text>
        </div>
      </ProfileSection>
      <ProfileSection title="Current leagues">
        <MembershipList memberships={current} onOpen={openRoster} />
      </ProfileSection>
      <section className="px-5 py-4">
        <Collapsible.Root>
          <Collapsible.DefaultTrigger>
            Previous seasons ({previous.length})
          </Collapsible.DefaultTrigger>
          <Collapsible.DefaultPanel className="pt-3">
            <MembershipList memberships={previous} onOpen={openRoster} />
          </Collapsible.DefaultPanel>
        </Collapsible.Root>
      </section>
    </article>
  )
}

interface Props {
  snapshot: MembersSnapshot
  tree: LeaguesTree
  rows: MemberRow[]
  visible: MemberRow[]
  duplicatedIds: Set<number>
  renumbering: boolean
  /** Below the compact width the list stacks above the profile. */
  compact: boolean
  /** True while a form or merge is writing; the rows and menus hold until it settles. */
  paneBusy: boolean
  sort: MembersSort
  onSort: (column: MembersSortColumn) => void
  onAction: (kind: ProfileAction, member: Member) => void
  onKeepNumber: (member: Member) => void
  onPaneBusyChange: (busy: boolean) => void
  /** The guardian link write has its own hold, separate from a form or merge's own. */
  onLinkBusyChange: (busy: boolean) => void
  onPaneDirtyChange: (dirty: boolean) => void
  /** Runs `proceed` at once, or after the desk agrees to discard an unsaved pane. */
  onLeavePane: (proceed: () => void) => void
  paneAction: PaneAction
  onPaneActionChange: (action: PaneAction) => void
  onPaneActionUpdate: (update: (current: PaneAction) => PaneAction) => void
  onBackgroundError: (message: string) => void
  onBackgroundSuccess: (message: string) => void
}

export type PaneAction =
  | { kind: 'new'; instance: number; guardianFor?: Member }
  | { kind: 'edit'; member: Member; instance: number }
  | {
      kind: 'merge'
      instance: number
      openingSnapshot: MembersSnapshot
      selectedIds: number[]
      mainId: number
      selectionFrozen: boolean
    }
  | null

interface MemberIdentity {
  id: number
  fingerprint: string
  duplicated: boolean
  reference: Member
}

interface SavedProfile {
  member: Member
  revision: string
}

function memberFingerprint(member: Member): string {
  return JSON.stringify(Object.entries(member).filter(([key]) => key !== 'id'))
}

function memberIdentity(member: Member, duplicated: boolean): MemberIdentity {
  return { id: member.id, fingerprint: memberFingerprint(member), duplicated, reference: member }
}

type RowAction = 'edit' | 'merge' | 'delete'
/** What a profile can start: the row actions plus adding a member for a junior's guardian. */
type ProfileAction = RowAction | 'guardian'

interface MemberListRowProps {
  row: MemberRow
  rowKey: string
  selected: boolean
  merging: boolean
  selectedForMerge: boolean
  mergeDisabled: boolean
  duplicated: boolean
  renumbering: boolean
  busy: boolean
  onActivate: (member: Member) => void
  onToggleMerge: (member: Member) => void
  onKeepNumber: (member: Member) => void
  onRowAction: (kind: RowAction, member: Member) => void
}

/** One list row; memoised so a filter keystroke or a pane change re-renders only the rows that changed. */
const MemberListRow = memo(function MemberListRow({
  row,
  selected,
  merging,
  selectedForMerge,
  mergeDisabled,
  duplicated,
  renumbering,
  busy,
  onActivate,
  onToggleMerge,
  onKeepNumber,
  onRowAction
}: MemberListRowProps): React.JSX.Element {
  const memberStatus = status(row)
  const highlighted = merging ? selectedForMerge : selected
  return (
    <Table.Row
      variant={highlighted ? 'selected' : 'default'}
      className={`${STATIC_ROW_CLASS} ${highlighted ? 'bg-kumo-brand/10 shadow-[inset_3px_0_0_var(--color-kumo-brand)] even:bg-kumo-brand/10' : ''}`}
      onClick={() => onActivate(row.member)}
    >
      {merging ? (
        <Table.CheckCell
          label={`Merge ${row.name}, member ${row.number}`}
          checked={selectedForMerge}
          disabled={mergeDisabled}
          onCheckedChange={() => onToggleMerge(row.member)}
          onClick={(event) => event.stopPropagation()}
        />
      ) : null}
      <Table.Cell className="font-mono text-[0.9em] text-kumo-subtle">{row.number}</Table.Cell>
      <Table.Cell>
        <button
          type="button"
          className="w-full truncate text-left font-medium"
          aria-label={`${row.name}, member ${row.number}`}
          aria-current={!merging && selected ? 'true' : undefined}
          onClick={(event) => {
            event.stopPropagation()
            onActivate(row.member)
          }}
        >
          {row.name}
        </button>
      </Table.Cell>
      <Table.Cell>
        <StatusMark status={memberStatus} />
      </Table.Cell>
      <Table.Cell onClick={(event) => event.stopPropagation()}>
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
            {duplicated ? (
              <DropdownMenu.Item
                disabled={renumbering || busy}
                onClick={(event) => {
                  event.stopPropagation()
                  onKeepNumber(row.member)
                }}
              >
                Keep this number, renumber the others
              </DropdownMenu.Item>
            ) : (
              <>
                <DropdownMenu.Item
                  disabled={row.member.deleted || busy}
                  onClick={(event) => {
                    event.stopPropagation()
                    onRowAction('edit', row.member)
                  }}
                >
                  Edit…
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  disabled={row.member.deleted || busy}
                  onClick={(event) => {
                    event.stopPropagation()
                    onRowAction('merge', row.member)
                  }}
                >
                  Merge with…
                </DropdownMenu.Item>
                <DropdownMenu.Item disabled>Print card (needs a card template)</DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  variant="danger"
                  disabled={row.member.deleted || busy}
                  onClick={(event) => {
                    event.stopPropagation()
                    onRowAction('delete', row.member)
                  }}
                >
                  Delete…
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu>
      </Table.Cell>
    </Table.Row>
  )
})

export function MembersWorkspace({
  snapshot,
  tree,
  rows,
  visible,
  duplicatedIds,
  renumbering,
  compact: stacked,
  paneBusy,
  sort,
  onSort,
  onAction,
  onKeepNumber,
  paneAction,
  onPaneActionChange,
  onPaneActionUpdate,
  onPaneBusyChange,
  onLinkBusyChange,
  onPaneDirtyChange,
  onLeavePane,
  onBackgroundError,
  onBackgroundSuccess
}: Props): React.JSX.Element {
  const [selectedIdentity, setSelectedIdentity] = useState<MemberIdentity | null>(null)
  const [savedProfile, setSavedProfile] = useState<SavedProfile | null>(null)
  const [listPercent, setListPercent] = useState(loadListPercent)
  const workspace = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLElement>(null)
  const listId = useId()
  const drag = useRef<{ startX: number; startPercent: number; percent: number } | null>(null)
  const focusProfile = useRef(false)
  // The link write starts after a save's own refresh, so it reads the list as the cache holds
  // it then rather than as this render saw it.
  const queryClient = useQueryClient()
  const coordinator = useQueryRefresh()
  const cachedSnapshot = (): MembersSnapshot =>
    queryClient.getQueryData<MembersSnapshot | null>(membersQueryKey(tree.root)) ?? snapshot
  const link = useWriteOperation({
    label: () => 'Linking the guardian',
    write: (input: MemberInput) => window.api.saveMember(input, cachedSnapshot().revision),
    refreshQueryKey: membersQueryKey
  })
  const linkGuardian = async (junior: Member, guardian: Member): Promise<void> => {
    // Held from before the pre-flight refresh, not just the write that follows it, so a
    // save landing in an editor opened in the meantime never has its own hold cleared by
    // this one settling first.
    onLinkBusyChange(true)
    try {
      // The guardian's own save usually refreshes the cache before this runs; but if that
      // refresh failed and the desk closed the editor anyway, the cache still lacks the new
      // guardian and its revision is stale. Refreshing again first means the revision read
      // below is current, rather than one main refuses as out of date.
      if (!cachedSnapshot().members.some((candidate) => candidate.id === guardian.id)) {
        await coordinator.refresh({ queryKey: membersQueryKey(tree.root) })
      }
      const current =
        cachedSnapshot().members.find(
          (candidate) => candidate.id === junior.id && candidate.mergedInto === undefined
        ) ?? junior
      // The junior no longer needs the free text the new guardian was seeded from: it is
      // already copied into the guardian's own notes, and keeping it here would repeat
      // their contact details in the plain CSV export regardless of the guardian's own
      // marketing choice.
      const input: MemberInput = { ...current, guardianMemberId: guardian.id }
      delete input.guardianContact
      try {
        const outcome = await link.run(input)
        setSelectedIdentity(memberIdentity(outcome.result, false))
        if (outcome.status === 'refresh-failed') {
          onBackgroundError(
            `Linked ${memberDisplayName(guardian)} as ${memberDisplayName(junior)}’s guardian, but the members list could not be refreshed: ${outcome.refreshError}`
          )
        }
      } catch (caught) {
        onBackgroundError(
          `Added ${memberDisplayName(guardian)}, but could not link them as ${memberDisplayName(junior)}’s guardian: ${ipcErrorMessage(caught)}`
        )
      }
    } finally {
      onLinkBusyChange(false)
    }
  }
  const membershipsById = useMemo(() => {
    const index = new Map<number, Membership[]>()
    for (const membership of deriveMemberships(snapshot)) {
      const list = index.get(membership.memberId)
      if (list) list.push(membership)
      else index.set(membership.memberId, [membership])
    }
    return index
  }, [snapshot])
  const memberKeys = useMemo(() => {
    const occurrences = new Map<number, number>()
    const keys = new Map<Member, string>()
    for (const member of snapshot.members) {
      const occurrence = (occurrences.get(member.id) ?? 0) + 1
      occurrences.set(member.id, occurrence)
      keys.set(member, `${member.id}:${occurrence}`)
    }
    return keys
  }, [snapshot.members])
  const savedRow = useMemo((): MemberRow | null => {
    if (!savedProfile || savedProfile.revision !== snapshot.revision) return null
    const member = savedProfile.member
    return {
      member,
      number: formatMemberNumber(member.id, snapshot.nextId),
      name: memberDisplayName(member),
      memberships: (membershipsById.get(member.id) ?? []).filter(
        (membership) => !membership.archived
      ),
      needsDetails: needsDetails(member, new Date(), snapshot.members)
    }
  }, [membershipsById, savedProfile, snapshot.members, snapshot.nextId, snapshot.revision])
  const selected = useMemo(() => {
    if (!selectedIdentity) return null
    if (savedRow && savedRow.member.id === selectedIdentity.id) return savedRow
    const candidates = rows.filter((row) => row.member.id === selectedIdentity.id)
    const referenced = candidates.filter((row) => row.member === selectedIdentity.reference)
    if (referenced.length === 1) return referenced[0]
    const exact = candidates.filter(
      (row) => memberFingerprint(row.member) === selectedIdentity.fingerprint
    )
    if (exact.length === 1) return exact[0]
    if (!selectedIdentity.duplicated && candidates.length === 1) return candidates[0]
    return null
  }, [rows, savedRow, selectedIdentity])

  const setWidth = (value: number): void => {
    const next = clampListPercent(value)
    setListPercent(next)
    saveListPercent(next)
  }
  const moveDivider = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const current = drag.current
    const width = workspace.current?.getBoundingClientRect().width
    if (!current || !width || event.buttons === 0) return
    current.percent = clampListPercent(
      current.startPercent + ((event.clientX - current.startX) / width) * 100
    )
    if (list.current) list.current.style.width = `${current.percent}%`
  }
  const startMemberAction = (kind: ProfileAction, member: Member): void => {
    if (paneBusy) return
    if (
      kind === 'merge' &&
      (member.deleted || member.mergedInto !== undefined || duplicatedIds.has(member.id))
    ) {
      return
    }
    onLeavePane(() => {
      if (kind === 'edit') {
        setSelectedIdentity(memberIdentity(member, duplicatedIds.has(member.id)))
      }
      onAction(kind, member)
    })
  }

  const mergeAction = paneAction?.kind === 'merge' ? paneAction : null
  const mergeStale =
    mergeAction !== null && mergeAction.openingSnapshot.revision !== snapshot.revision
  const toggleMergeMember = (member: Member): void => {
    if (!mergeAction || mergeAction.selectionFrozen) return
    if (
      member.deleted ||
      member.mergedInto !== undefined ||
      duplicatedIds.has(member.id) ||
      mergeAction.openingSnapshot.revision !== snapshot.revision
    ) {
      return
    }
    onPaneActionUpdate((current) => {
      if (current?.kind !== 'merge' || current.selectionFrozen) return current
      const removing = current.selectedIds.includes(member.id)
      const nextIds = removing
        ? current.selectedIds.filter((id) => id !== member.id)
        : [...current.selectedIds, member.id]
      return {
        ...current,
        selectedIds: nextIds,
        mainId: nextIds.includes(current.mainId) ? current.mainId : (nextIds[0] ?? current.mainId)
      }
    })
  }
  const activateRow = (member: Member): void => {
    if (mergeAction) {
      toggleMergeMember(member)
      return
    }
    if (paneBusy) return
    onLeavePane(() => {
      focusProfile.current = false
      onPaneActionChange(null)
      setSelectedIdentity(memberIdentity(member, duplicatedIds.has(member.id)))
    })
  }
  const rowHandlers = useRef({ activateRow, toggleMergeMember, startMemberAction, onKeepNumber })
  useEffect(() => {
    rowHandlers.current = { activateRow, toggleMergeMember, startMemberAction, onKeepNumber }
  })
  const onActivate = useCallback((member: Member) => rowHandlers.current.activateRow(member), [])
  const onToggleMerge = useCallback(
    (member: Member) => rowHandlers.current.toggleMergeMember(member),
    []
  )
  const onRowKeepNumber = useCallback(
    (member: Member) => rowHandlers.current.onKeepNumber(member),
    []
  )
  const onRowAction = useCallback(
    (kind: RowAction, member: Member) => rowHandlers.current.startMemberAction(kind, member),
    []
  )
  const closePane = (): void => {
    focusProfile.current = true
    onPaneActionChange(null)
  }
  const cancelPane = (): void => onLeavePane(closePane)
  const takeProfileFocus = (): boolean => {
    const take = focusProfile.current
    focusProfile.current = false
    return take
  }

  return (
    <div
      ref={workspace}
      className={
        stacked
          ? 'grid min-h-0 flex-1 grid-rows-[minmax(0,0.35fr)_minmax(0,0.65fr)]'
          : 'flex min-h-0 flex-1'
      }
    >
      <section
        ref={list}
        id={listId}
        aria-label="Member list"
        className={`flex min-h-0 min-w-0 flex-col overflow-hidden ${stacked ? 'border-b border-kumo-line' : ''}`}
        style={stacked ? undefined : { width: `${listPercent}%` }}
      >
        <div className="min-h-0 flex-1 overflow-auto">
          <Table aria-label="Members" layout="fixed">
            <colgroup>
              {mergeAction ? <col style={{ width: 38 }} /> : null}
              <col style={{ width: 82 }} />
              <col />
              <col style={{ width: 34 }} />
              <col style={{ width: 42 }} />
            </colgroup>
            <Table.Header sticky>
              <Table.Row className="text-kumo-subtle">
                {mergeAction ? (
                  <Table.Head>
                    <span className="sr-only">Selected for merge</span>
                  </Table.Head>
                ) : null}
                <Table.Head aria-sort={sort.column === 'number' ? sort.direction : 'none'}>
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => onSort('number')}
                  >
                    Number
                  </button>
                </Table.Head>
                <Table.Head aria-sort={sort.column === 'name' ? sort.direction : 'none'}>
                  <button type="button" className="w-full text-left" onClick={() => onSort('name')}>
                    Name
                  </button>
                </Table.Head>
                <Table.Head>
                  <span className="sr-only">Status</span>
                </Table.Head>
                <Table.Head>
                  <span className="sr-only">Actions</span>
                </Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {visible.length === 0 ? (
                <Table.Row>
                  <Table.Cell
                    colSpan={mergeAction ? 5 : 4}
                    className="py-8 text-center text-kumo-subtle"
                  >
                    {rows.length === 0
                      ? 'No members yet. New seasons add players here as you build their rosters.'
                      : 'No members match this filter.'}
                  </Table.Cell>
                </Table.Row>
              ) : (
                visible.map((row) => {
                  const mergeEligible =
                    !row.member.deleted &&
                    row.member.mergedInto === undefined &&
                    !duplicatedIds.has(row.member.id)
                  return (
                    <MemberListRow
                      key={memberKeys.get(row.member) ?? ''}
                      rowKey={memberKeys.get(row.member) ?? ''}
                      row={row}
                      selected={selected?.member === row.member}
                      merging={mergeAction !== null}
                      selectedForMerge={mergeAction?.selectedIds.includes(row.member.id) ?? false}
                      mergeDisabled={
                        !mergeEligible || (mergeAction?.selectionFrozen ?? false) || mergeStale
                      }
                      duplicated={duplicatedIds.has(row.member.id)}
                      renumbering={renumbering}
                      busy={paneBusy}
                      onActivate={onActivate}
                      onToggleMerge={onToggleMerge}
                      onKeepNumber={onRowKeepNumber}
                      onRowAction={onRowAction}
                    />
                  )
                })
              )}
            </Table.Body>
          </Table>
        </div>
      </section>
      {stacked ? null : (
        <button
          type="button"
          aria-label="Resize member list"
          aria-controls={listId}
          aria-valuemin={MIN_LIST_PERCENT}
          aria-valuemax={MAX_LIST_PERCENT}
          aria-valuenow={listPercent}
          aria-valuetext={`List takes ${listPercent}% of the width`}
          aria-orientation="vertical"
          role="separator"
          className="group relative w-2 shrink-0 cursor-col-resize touch-none border-x border-kumo-line bg-kumo-base focus-visible:outline-2 focus-visible:outline-kumo-focus"
          onPointerDown={(event) => {
            event.preventDefault()
            drag.current = {
              startX: event.clientX,
              startPercent: listPercent,
              percent: listPercent
            }
            event.currentTarget.setPointerCapture?.(event.pointerId)
          }}
          onPointerMove={moveDivider}
          onPointerUp={(event) => {
            const current = drag.current
            drag.current = null
            if (current) setWidth(current.percent)
            event.currentTarget.releasePointerCapture?.(event.pointerId)
          }}
          onPointerCancel={() => {
            drag.current = null
            if (list.current) list.current.style.width = `${listPercent}%`
          }}
          onLostPointerCapture={() => {
            if (!drag.current) return
            drag.current = null
            if (list.current) list.current.style.width = `${listPercent}%`
          }}
          onKeyDown={(event) => {
            const next = dividerTarget(event.key, listPercent)
            if (next === undefined) return
            event.preventDefault()
            setWidth(next)
          }}
        >
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-kumo-hairline group-hover:bg-kumo-brand" />
        </button>
      )}
      <section
        aria-label="Member profile"
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        {paneAction?.kind === 'merge' ? (
          <MergeMemberPane
            key={paneAction.instance}
            snapshot={snapshot}
            openingSnapshot={paneAction.openingSnapshot}
            selectedIds={paneAction.selectedIds}
            mainId={paneAction.mainId}
            compact={stacked}
            root={tree.root}
            selectionFrozen={paneAction.selectionFrozen}
            onMainChange={(mainId) =>
              onPaneActionUpdate((current) =>
                current?.kind === 'merge' && !current.selectionFrozen
                  ? { ...current, mainId }
                  : current
              )
            }
            onCancel={cancelPane}
            onSaved={(member) => {
              setSavedProfile({ member, revision: snapshot.revision })
              setSelectedIdentity(memberIdentity(member, false))
              closePane()
            }}
            onFreezeSelection={() =>
              onPaneActionUpdate((current) =>
                current?.kind === 'merge' ? { ...current, selectionFrozen: true } : current
              )
            }
            onUnfreezeSelection={() =>
              onPaneActionUpdate((current) =>
                current?.kind === 'merge' ? { ...current, selectionFrozen: false } : current
              )
            }
            onBusyChange={onPaneBusyChange}
            onDirtyChange={onPaneDirtyChange}
            onBackgroundError={onBackgroundError}
            onBackgroundSuccess={onBackgroundSuccess}
          />
        ) : paneAction ? (
          <MemberEditor
            key={paneAction.instance}
            snapshot={snapshot}
            root={tree.root}
            member={paneAction.kind === 'edit' ? paneAction.member : null}
            guardianFor={paneAction.kind === 'new' ? (paneAction.guardianFor ?? null) : null}
            compact={stacked}
            onCancel={cancelPane}
            onDiscard={closePane}
            onSaved={(member) => {
              setSavedProfile({ member, revision: snapshot.revision })
              setSelectedIdentity(memberIdentity(member, false))
              closePane()
              if (paneAction.kind === 'new' && paneAction.guardianFor) {
                void linkGuardian(paneAction.guardianFor, member)
              }
            }}
            onBusyChange={onPaneBusyChange}
            onDirtyChange={onPaneDirtyChange}
            onBackgroundError={onBackgroundError}
            onBackgroundSuccess={onBackgroundSuccess}
          />
        ) : selected ? (
          <MemberProfile
            key={selected.member.id}
            row={selected}
            members={snapshot.members}
            memberships={membershipsById.get(selected.member.id) ?? []}
            tree={tree}
            compact={stacked}
            duplicatedIds={duplicatedIds}
            renumbering={renumbering}
            takeFocus={takeProfileFocus}
            onAction={startMemberAction}
            onOpenMember={activateRow}
            onKeepNumber={onKeepNumber}
          />
        ) : (
          <Empty
            size="sm"
            icon={<UserCircleIcon size={40} />}
            title="Select a member"
            description="Choose a member from the list to view their profile."
          />
        )}
      </section>
    </div>
  )
}
