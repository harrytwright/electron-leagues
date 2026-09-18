import {
  deriveMemberships,
  formatMemberNumber,
  memberDisplayName,
  needsDetails,
  normaliseName,
  possibleDuplicates,
  type Member,
  type Membership,
  type MembersSnapshot
} from '@shared/members'

export const QUICK_FILTERS = [
  'all',
  'needs-details',
  'possible-duplicates',
  'duplicate-numbers',
  'mbd-duplicates',
  'deleted'
] as const

export type QuickFilter = (typeof QUICK_FILTERS)[number]

export const QUICK_FILTER_LABELS: Record<QuickFilter, string> = {
  all: 'All members',
  'needs-details': 'Needs details',
  'possible-duplicates': 'Possible duplicates',
  'duplicate-numbers': 'Duplicate numbers',
  'mbd-duplicates': 'More than one MBD id',
  deleted: 'Deleted'
}

export function isQuickFilter(value: string): value is QuickFilter {
  return QUICK_FILTERS.some((filter) => filter === value)
}

export interface MembersFilter {
  /** Matched against the display name, aliases and the padded number. */
  query: string
  quick: QuickFilter
  /** A league folder name, or null for every league. */
  leagueFolder: string | null
}

export interface MemberRow {
  member: Member
  number: string
  name: string
  /** Live-season memberships only; history stays on the season tabs. */
  memberships: Membership[]
  needsDetails: boolean
}

/** A league filter offers every league that has at least one live-season roster. */
export function leagueChoices(snapshot: MembersSnapshot): { folder: string; name: string }[] {
  const seen = new Map<string, string>()
  for (const season of snapshot.seasons) {
    if (!season.archived && !seen.has(season.leagueFolder)) {
      seen.set(season.leagueFolder, season.leagueName)
    }
  }
  return [...seen].map(([folder, name]) => ({ folder, name }))
}

function matchesQuery(row: MemberRow, query: string): boolean {
  if (!query) return true
  const trimmed = query.trim()
  // Typing the last digits of a number is how a card number is read out at the desk.
  const numberMatches = /^\d+$/.test(trimmed) && row.number.endsWith(trimmed)
  const needle = normaliseName(trimmed, '')
  if (!needle) return numberMatches
  const haystacks = [
    normaliseName(row.member.firstName, row.member.lastName),
    ...row.member.aliases.map((alias) => normaliseName(alias, ''))
  ]
  return numberMatches || haystacks.some((haystack) => haystack.includes(needle))
}

export function buildMemberRows(snapshot: MembersSnapshot, today: Date): MemberRow[] {
  const memberships = deriveMemberships(snapshot).filter((membership) => !membership.archived)
  return snapshot.members
    .filter((member) => member.mergedInto === undefined)
    .map((member) => ({
      member,
      number: formatMemberNumber(member.id, snapshot.nextId),
      name: memberDisplayName(member),
      memberships: memberships.filter((membership) => membership.memberId === member.id),
      needsDetails: needsDetails(member, today)
    }))
}

export function filterMemberRows(
  rows: MemberRow[],
  snapshot: MembersSnapshot,
  filter: MembersFilter
): MemberRow[] {
  let kept = rows
  switch (filter.quick) {
    case 'all':
      kept = kept.filter((row) => !row.member.deleted)
      break
    case 'needs-details':
      kept = kept.filter((row) => !row.member.deleted && row.needsDetails)
      break
    case 'possible-duplicates': {
      const flagged = new Set(possibleDuplicates(snapshot.members).flat())
      kept = kept.filter((row) => flagged.has(row.member))
      break
    }
    case 'duplicate-numbers': {
      const duplicated = new Set(
        snapshot.problems.flatMap((problem) =>
          problem.kind === 'duplicate-number' ? [problem.id] : []
        )
      )
      kept = kept.filter((row) => duplicated.has(row.member.id))
      break
    }
    case 'mbd-duplicates':
      // Two MBD ids on one member is the MBD holding the same bowler twice; a clean-up list.
      kept = kept.filter((row) => !row.member.deleted && row.member.mbdIds.length > 1)
      break
    case 'deleted':
      kept = kept.filter((row) => row.member.deleted === true)
      break
  }
  if (filter.leagueFolder !== null) {
    const folder = filter.leagueFolder
    kept = kept.filter((row) =>
      row.memberships.some((membership) => membership.leagueFolder === folder)
    )
  }
  return kept.filter((row) => matchesQuery(row, filter.query))
}

export function compareMemberRows(a: MemberRow, b: MemberRow): number {
  return (
    a.member.lastName.localeCompare(b.member.lastName, undefined, { sensitivity: 'base' }) ||
    a.member.firstName.localeCompare(b.member.firstName, undefined, { sensitivity: 'base' }) ||
    a.member.id - b.member.id
  )
}
