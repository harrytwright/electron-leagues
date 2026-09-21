import { z } from 'zod'
import type { Weekday } from './weekday'

/** The master list at the root of a location; its presence enables the feature. */
export const MEMBERS_FILE = 'members.json'
/** Settings, teams and roster for one season, beside that season's documents. */
export const SEASON_FILE = 'meta.json'

/** App-owned JSON that is never shown as a document, wherever it sits in the tree. */
export const RESERVED_FILE_NAMES: ReadonlySet<string> = new Set([MEMBERS_FILE, SEASON_FILE])

export function isReservedFileName(name: string): boolean {
  return RESERVED_FILE_NAMES.has(name)
}

/** The bundled template a location without the members database fills in by hand. */
export const SIGN_IN_TEMPLATE_FILE = 'Sign-In Sheet.docx'
/** Generated from the roster into the season root; shown as a document, never copied forward. */
export const SIGN_IN_SHEET_FILE = 'Sign-In Sheet.pdf'

export function isGeneratedFileName(name: string): boolean {
  return name === SIGN_IN_SHEET_FILE
}

export const GENDERS = ['male', 'female', 'other'] as const

export type Gender = (typeof GENDERS)[number]

const isoDate = z.iso.date({ message: 'Expected an ISO date' })

export const memberSchema = z.object({
  /** Member number, stored raw; `formatMemberNumber` pads it for display. */
  id: z.number().int().positive(),
  firstName: z.string(),
  lastName: z.string(),
  /** Drives the under-18 rules. */
  dob: isoDate.optional(),
  /** From the MBD sync; BLS records it for prize categories. */
  gender: z.enum(GENDERS).optional(),
  /** Blank for under-18s. */
  email: z.string().optional(),
  phone: z.string().optional(),
  /** Free text naming a parent or guardian and how to reach them. Under-18s only. */
  guardianContact: z.string().optional(),
  /** Every MBD ID known for this person; the MBD itself can hold duplicates. */
  mbdIds: z.array(z.string()),
  /** Every spelling seen for this person, so the sync stops asking. */
  aliases: z.array(z.string()),
  /** Opt-out. Governs the guardian contact while under 18 and carries over at 18. */
  marketing: z.boolean(),
  /** TRANSITIONAL: the ISO date a card was printed here; moves to the SBC system later. */
  cardIssued: isoDate.optional(),
  notes: z.string().optional(),
  /** Set when this record was merged into another; the number keeps resolving. */
  mergedInto: z.number().int().positive().optional(),
  /** Soft delete: hidden from pickers, kept because a roster references it. */
  deleted: z.boolean().optional()
})

export type Member = z.infer<typeof memberSchema>

/** What the member editor sends: everything a person types, plus the number when editing. */
export const memberInputSchema = memberSchema
  .omit({ id: true, mergedInto: true, deleted: true })
  .extend({ id: z.number().int().positive().optional() })

export type MemberInput = z.infer<typeof memberInputSchema>

export const membersFileSchema = z.object({
  schemaVersion: z.literal(1),
  /** TRANSITIONAL: the next number to mint locally; the SBC system mints later. */
  nextId: z.number().int().positive(),
  members: z.array(memberSchema)
})

export type MembersFile = z.infer<typeof membersFileSchema>

export const teamSchema = z.object({
  /** Created once and carried across seasons, even when the name changes. */
  id: z.string().min(1),
  /** This season's start position, the lane draw, set each year. */
  teamNo: z.number().int().positive(),
  name: z.string()
})

export type Team = z.infer<typeof teamSchema>

export const playerSchema = z.object({
  memberId: z.number().int().positive(),
  /** null means a sub for this league this season. */
  teamId: z.string().min(1).nullable(),
  position: z.number().int().positive().optional(),
  /** This bowler's id in this season on LeagueSecretary.com; a later lookup fills it. */
  leagueSecretaryId: z.string().optional()
})

export type Player = z.infer<typeof playerSchema>

export const MIN_FORMAT = 1
export const MAX_FORMAT = 5
export const DEFAULT_FORMAT = 3

/** One player per team is a singles league: everyone bowls for themselves and there are no teams. */
export const SINGLES_FORMAT = 1

export function isSingles(file: Pick<SeasonFile, 'format'>): boolean {
  return file.format === SINGLES_FORMAT
}

/**
 * A singles file carries no teams and no team ids, whatever the roster held before
 * its format changed or was carried over from a team season.
 */
export function fitToFormat(file: SeasonFile): SeasonFile {
  if (!isSingles(file)) return file
  return {
    ...file,
    teams: [],
    players: file.players.map((player) => ({ ...player, teamId: null }))
  }
}

/** Singles bowlers are listed by surname then first name, with anyone unresolved last. */
export function compareSinglesPlayers(
  members: readonly Member[]
): (a: Player, b: Player) => number {
  const key = (player: Player): string => {
    const member = resolveMember(members, player.memberId)
    return member ? `${member.lastName} ${member.firstName}` : `\uffff${player.memberId}`
  }
  return (a, b) => key(a).localeCompare(key(b), undefined, { sensitivity: 'base' })
}

export const feeBreakdownSchema = z.object({
  label: z.string(),
  amount: z.number().nonnegative()
})

export type FeeBreakdown = z.infer<typeof feeBreakdownSchema>

export const seasonFileSchema = z.object({
  schemaVersion: z.literal(1),
  /** Players per team. */
  format: z.number().int().min(MIN_FORMAT).max(MAX_FORMAT),
  startDate: isoDate.optional(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, { message: 'Expected a 24-hour time' })
    .optional(),
  weeks: z.number().int().positive().optional(),
  fees: z
    .object({
      total: z.number().nonnegative(),
      breakdown: z.array(feeBreakdownSchema)
    })
    .optional(),
  subFee: z.number().nonnegative().optional(),
  /** This season's id on LeagueSecretary.com; a later lookup fills it. */
  leagueSecretaryId: z.string().optional(),
  teams: z.array(teamSchema),
  players: z.array(playerSchema)
})

export type SeasonFile = z.infer<typeof seasonFileSchema>

export function emptyMembersFile(): MembersFile {
  return { schemaVersion: 1, nextId: 1, members: [] }
}

export function newSeasonFile(format: number): SeasonFile {
  return { schemaVersion: 1, format, teams: [], players: [] }
}

/**
 * Six digits reads as a real membership number; the width only grows once the
 * list passes a million, and never shrinks. The barcode carries the raw id, so
 * a wider display never invalidates a printed card.
 */
export function formatMemberNumber(id: number, nextId: number): string {
  const width = Math.max(6, String(Math.max(nextId - 1, 1)).length)
  return String(id).padStart(width, '0')
}

/** Lower-case, diacritics stripped, punctuation removed, single spaces: `first last`. */
export function normaliseName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function memberDisplayName(member: Pick<Member, 'firstName' | 'lastName'>): string {
  return `${member.firstName} ${member.lastName}`.trim()
}

export function ageOn(dob: string, on: Date): number {
  const [year, month, day] = dob.split('-').map(Number)
  let age = on.getFullYear() - year
  const beforeBirthday =
    on.getMonth() + 1 < month || (on.getMonth() + 1 === month && on.getDate() < day)
  if (beforeBirthday) age -= 1
  return age
}

/** A member with no date of birth is treated as an adult; the details list asks for one. */
export function isUnder18(member: Pick<Member, 'dob'>, on: Date): boolean {
  return member.dob !== undefined && ageOn(member.dob, on) < 18
}

/** Sync-created records arrive with a name and ids only; this is what the desk still has to collect. */
export function needsDetails(member: Member, on: Date): boolean {
  if (member.mergedInto !== undefined || member.deleted) return false
  if (member.dob === undefined) return true
  if (isUnder18(member, on)) return !member.guardianContact
  return !member.email && !member.phone
}

/** Follow merges to the record that now stands for a number. */
export function resolveMember(members: readonly Member[], id: number): Member | null {
  const seen = new Set<number>()
  let current = members.find((member) => member.id === id) ?? null
  while (current?.mergedInto !== undefined && !seen.has(current.id)) {
    seen.add(current.id)
    current = members.find((member) => member.id === current?.mergedInto) ?? null
  }
  return current
}

/** A file's identity on disk at read time; a write that names a stale one is refused. */
export type FileRevision = string

export interface RosterSeason {
  day: Weekday
  leagueFolder: string
  leagueName: string
  season: string
  path: string
  archived: boolean
  revision: FileRevision
  file: SeasonFile
}

export type MembersProblem =
  | { kind: 'invalid-file'; path: string; message: string }
  | { kind: 'unlinked-player'; path: string; memberId: number }
  | { kind: 'unknown-team'; path: string; memberId: number; teamId: string }
  | { kind: 'duplicate-number'; id: number; count: number }

export interface MembersSnapshot {
  /** False when the location has no `members.json`; every list is then empty. */
  enabled: boolean
  revision: FileRevision
  nextId: number
  members: Member[]
  seasons: RosterSeason[]
  problems: MembersProblem[]
}

export function disabledMembersSnapshot(): MembersSnapshot {
  return { enabled: false, revision: '', nextId: 1, members: [], seasons: [], problems: [] }
}

/**
 * Under-18s keep no contact details of their own. A guardian contact is kept
 * past 18 because it may be the only contact on file until a new one is collected.
 */
export function applyAgeRules<T extends Omit<MemberInput, 'id'>>(input: T, on: Date): T {
  const trimmed = { ...input }
  if (isUnder18(input, on)) {
    delete trimmed.email
    delete trimmed.phone
  }
  return trimmed
}

/**
 * The surviving record after a merge: every id and spelling from both, and any
 * blank the survivor had filled from the record being merged away.
 */
export function mergeMemberRecords(into: Member, from: Member): Member {
  const aliases = new Set(into.aliases)
  for (const alias of from.aliases) aliases.add(alias)
  const fromName = memberDisplayName(from)
  if (
    normaliseName(from.firstName, from.lastName) !== normaliseName(into.firstName, into.lastName)
  ) {
    aliases.add(fromName)
  }
  const merged: Member = {
    ...into,
    mbdIds: [...new Set([...into.mbdIds, ...from.mbdIds])],
    aliases: [...aliases]
  }
  if (merged.dob === undefined && from.dob !== undefined) merged.dob = from.dob
  if (merged.gender === undefined && from.gender !== undefined) merged.gender = from.gender
  if (merged.email === undefined && from.email !== undefined) merged.email = from.email
  if (merged.phone === undefined && from.phone !== undefined) merged.phone = from.phone
  if (merged.guardianContact === undefined && from.guardianContact !== undefined) {
    merged.guardianContact = from.guardianContact
  }
  if (merged.notes === undefined && from.notes !== undefined) merged.notes = from.notes
  return merged
}

/** A hand-merged conflict copy can leave `nextId` behind the numbers in use; never mint one twice. */
export function mintNumber(file: MembersFile): number {
  const highest = file.members.reduce((max, member) => Math.max(max, member.id), 0)
  const id = Math.max(file.nextId, highest + 1)
  file.nextId = id + 1
  return id
}

/** Team ids never repeat within a location; the random part keeps two machines apart. */
export function newTeamId(random: () => string): string {
  return `team_${random()}`
}

export interface Membership {
  memberId: number
  day: Weekday
  leagueFolder: string
  leagueName: string
  season: string
  seasonPath: string
  archived: boolean
  team: Team | null
  /** In a singles season nobody is a sub, so a missing team means nothing. */
  singles: boolean
  position?: number
}

/** One row per roster entry, resolved through merges, so a member's leagues are a filter away. */
export function deriveMemberships(snapshot: MembersSnapshot): Membership[] {
  const memberships: Membership[] = []
  for (const season of snapshot.seasons) {
    for (const player of season.file.players) {
      const member = resolveMember(snapshot.members, player.memberId)
      if (!member) continue
      const team = player.teamId
        ? (season.file.teams.find((candidate) => candidate.id === player.teamId) ?? null)
        : null
      memberships.push({
        memberId: member.id,
        day: season.day,
        leagueFolder: season.leagueFolder,
        leagueName: season.leagueName,
        season: season.season,
        seasonPath: season.path,
        archived: season.archived,
        team,
        singles: isSingles(season.file),
        position: player.position
      })
    }
  }
  return memberships
}

/** Problems a reader can find from the files alone; the scan reports them and repairs nothing. */
export function findRosterProblems(snapshot: MembersSnapshot): MembersProblem[] {
  const problems: MembersProblem[] = []
  const counts = new Map<number, number>()
  for (const member of snapshot.members) {
    counts.set(member.id, (counts.get(member.id) ?? 0) + 1)
  }
  for (const [id, count] of counts) {
    if (count > 1) problems.push({ kind: 'duplicate-number', id, count })
  }
  for (const season of snapshot.seasons) {
    for (const player of season.file.players) {
      if (!resolveMember(snapshot.members, player.memberId)) {
        problems.push({ kind: 'unlinked-player', path: season.path, memberId: player.memberId })
      }
      if (player.teamId && !season.file.teams.some((team) => team.id === player.teamId)) {
        problems.push({
          kind: 'unknown-team',
          path: season.path,
          memberId: player.memberId,
          teamId: player.teamId
        })
      }
    }
  }
  return problems
}

/** Members that share a normalised name, or an alias, and are not known to be different people. */
export function possibleDuplicates(members: readonly Member[]): Member[][] {
  const live = members.filter((member) => member.mergedInto === undefined && !member.deleted)
  const byName = new Map<string, Member[]>()
  for (const member of live) {
    const names = new Set([normaliseName(member.firstName, member.lastName)])
    for (const alias of member.aliases) names.add(normaliseName(alias, ''))
    for (const name of names) {
      if (!name) continue
      const group = byName.get(name) ?? []
      if (!group.includes(member)) group.push(member)
      byName.set(name, group)
    }
  }
  const groups: Member[][] = []
  for (const group of byName.values()) {
    if (group.length < 2) continue
    // Two different MBD ids are two different bowlers as far as scoring is concerned.
    const distinctIds = new Set(group.flatMap((member) => member.mbdIds))
    const everyoneHasAnId = group.every((member) => member.mbdIds.length > 0)
    if (everyoneHasAnId && distinctIds.size === group.flatMap((m) => m.mbdIds).length) continue
    // A name group already inside a kept group adds nothing; a larger group replaces the smaller.
    const contained = groups.findIndex((existing) =>
      existing.every((member) => group.includes(member))
    )
    if (groups.some((existing) => group.every((member) => existing.includes(member)))) continue
    if (contained === -1) groups.push(group)
    else groups[contained] = group
  }
  return groups
}

/** Teams in lane-draw order for a roster or a sign-in sheet. */
export function sortTeams(teams: readonly Team[]): Team[] {
  return [...teams].sort((a, b) => a.teamNo - b.teamNo || a.name.localeCompare(b.name))
}
