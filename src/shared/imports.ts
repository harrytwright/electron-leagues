import { z } from 'zod'
import {
  memberDisplayName,
  mintNumber,
  normaliseName,
  resolveMember,
  type Gender,
  type Member,
  type MembersFile,
  type SeasonFile,
  type Team
} from './members'

/** Exports are read as delimited text; a spreadsheet is saved as CSV first. */
export const IMPORT_EXTENSIONS = ['.csv', '.tsv', '.txt'] as const

export function isImportFileName(name: string): boolean {
  const lower = name.toLowerCase()
  return IMPORT_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

export interface DelimitedTable {
  columns: string[]
  rows: string[][]
}

const DELIMITERS = [',', '\t', ';'] as const

function detectDelimiter(header: string): string {
  let best = ','
  let bestCount = -1
  for (const delimiter of DELIMITERS) {
    const count = header.split(delimiter).length - 1
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  }
  return best
}

/**
 * RFC 4180 style text: the delimiter is whichever of comma, tab or semicolon the
 * header uses most, quoted fields may hold delimiters, newlines and doubled quotes,
 * a byte order mark is ignored and blank lines are dropped. Every row is padded or
 * cut to the header's width.
 */
export function parseDelimited(text: string): DelimitedTable {
  const source = text.startsWith('﻿') ? text.slice(1) : text
  const delimiter = detectDelimiter(source.split(/\r?\n/, 1)[0] ?? '')
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char !== '"') field += char
      else if (source[index + 1] === '"') {
        field += '"'
        index += 1
      } else quoted = false
      continue
    }
    if (char === '"' && field === '') quoted = true
    else if (char === delimiter) {
      record.push(field)
      field = ''
    } else if (char === '\n') {
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else if (char !== '\r') field += char
  }
  if (field !== '' || record.length > 0) {
    record.push(field)
    records.push(record)
  }
  const [header = [], ...rows] = records.filter((cells) => cells.some((cell) => cell.trim()))
  const columns = header.map((cell) => cell.trim())
  return { columns, rows: rows.map((row) => columns.map((_, index) => (row[index] ?? '').trim())) }
}

const columnIndexSchema = z.number().int().nonnegative().nullable()

/** Which column of an export holds each field; null when the file has no such column. */
export const importMappingSchema = z.object({
  mbdId: columnIndexSchema,
  firstName: columnIndexSchema,
  lastName: columnIndexSchema,
  /** One column holding the whole name, used when first and last are not separate. */
  fullName: columnIndexSchema,
  gender: columnIndexSchema,
  team: columnIndexSchema
})

export type ImportMapping = z.infer<typeof importMappingSchema>
export type ImportField = keyof ImportMapping

export const IMPORT_FIELDS: readonly ImportField[] = [
  'mbdId',
  'firstName',
  'lastName',
  'fullName',
  'gender',
  'team'
]

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  mbdId: 'MBD ID',
  firstName: 'First name',
  lastName: 'Last name',
  fullName: 'Full name',
  gender: 'Gender',
  team: 'Team'
}

const HEADER_PATTERNS: Record<ImportField, RegExp> = {
  mbdId: /^(?:mbd|bowler|member|usbc|player)?(?:id|no|number|num)$/,
  firstName: /^(?:first|given|fore)(?:name)?$/,
  lastName: /^(?:last|sur|family)(?:name)?$/,
  fullName: /^(?:full|bowler|player|member)?name$/,
  gender: /^(?:gender|sex)$/,
  team: /^team(?:name)?$/
}

function normaliseHeader(column: string): string {
  return column.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** A first guess from the header names; the mapping form shows it for correction. */
export function suggestMapping(columns: readonly string[]): ImportMapping {
  const headers = columns.map(normaliseHeader)
  const find = (field: ImportField): number | null => {
    const index = headers.findIndex((header) => HEADER_PATTERNS[field].test(header))
    return index === -1 ? null : index
  }
  const mapping: ImportMapping = {
    mbdId: find('mbdId'),
    firstName: find('firstName'),
    lastName: find('lastName'),
    fullName: find('fullName'),
    gender: find('gender'),
    team: find('team')
  }
  if (mapping.firstName !== null && mapping.lastName !== null) mapping.fullName = null
  return mapping
}

export function mappingFitsColumns(mapping: ImportMapping, columnCount: number): boolean {
  return IMPORT_FIELDS.every((field) => {
    const index = mapping[field]
    return index === null || index < columnCount
  })
}

/** Why a mapping cannot be used yet, or null when it names everything an import needs. */
export function mappingProblem(mapping: ImportMapping): string | null {
  if (mapping.mbdId === null) return 'Choose the column holding the MBD ID'
  const hasSplitName = mapping.firstName !== null && mapping.lastName !== null
  if (!hasSplitName && mapping.fullName === null) {
    return 'Choose the first and last name columns, or one full name column'
  }
  return null
}

export interface MappingPreview {
  path: string
  fileName: string
  columns: string[]
  /** The first few data rows, so the mapping can be checked against real values. */
  sample: string[][]
  rowCount: number
  mapping: ImportMapping
  /** True when the mapping came from an earlier import of a file with these columns. */
  remembered: boolean
}

export interface ImportRow {
  /** The line in the file, counting the header as line 1, so problems can be found. */
  line: number
  mbdId: string
  firstName: string
  lastName: string
  gender?: Gender
  team?: string
}

export interface ImportRowProblem {
  line: number
  message: string
}

export interface ImportRows {
  rows: ImportRow[]
  invalid: ImportRowProblem[]
}

/** "Last, First" or "First Middle Last"; a single word is a first name. */
export function splitFullName(full: string): Pick<ImportRow, 'firstName' | 'lastName'> {
  const trimmed = full.trim()
  const comma = trimmed.indexOf(',')
  if (comma !== -1) {
    return { firstName: trimmed.slice(comma + 1).trim(), lastName: trimmed.slice(0, comma).trim() }
  }
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length < 2) return { firstName: trimmed, lastName: '' }
  return { firstName: words.slice(0, -1).join(' '), lastName: words[words.length - 1] }
}

export function parseGender(text: string): Gender | undefined {
  const value = text.trim().toLowerCase()
  if (['m', 'male', 'man', 'boy'].includes(value)) return 'male'
  if (['f', 'female', 'woman', 'girl'].includes(value)) return 'female'
  if (['o', 'other', 'x', 'nb', 'non-binary', 'nonbinary'].includes(value)) return 'other'
  return undefined
}

function cell(row: readonly string[], index: number | null): string {
  return index === null ? '' : (row[index] ?? '')
}

/** Rows the mapping can read; the rest are reported by line and never guessed at. */
export function readImportRows(table: DelimitedTable, mapping: ImportMapping): ImportRows {
  const rows: ImportRow[] = []
  const invalid: ImportRowProblem[] = []
  const seen = new Map<string, number>()
  table.rows.forEach((values, index) => {
    const line = index + 2
    const mbdId = cell(values, mapping.mbdId)
    const name =
      mapping.firstName !== null && mapping.lastName !== null
        ? { firstName: cell(values, mapping.firstName), lastName: cell(values, mapping.lastName) }
        : splitFullName(cell(values, mapping.fullName))
    if (!mbdId) {
      invalid.push({ line, message: 'No MBD ID' })
      return
    }
    if (!name.firstName && !name.lastName) {
      invalid.push({ line, message: `No name for MBD ID ${mbdId}` })
      return
    }
    const earlier = seen.get(mbdId)
    if (earlier !== undefined) {
      invalid.push({ line, message: `Repeats MBD ID ${mbdId} from line ${earlier}` })
      return
    }
    seen.set(mbdId, line)
    const row: ImportRow = { line, mbdId, ...name }
    const gender = parseGender(cell(values, mapping.gender))
    if (gender) row.gender = gender
    const team = cell(values, mapping.team)
    if (team) row.team = team
    rows.push(row)
  })
  return { rows, invalid }
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution)
    }
    previous = current
  }
  return previous[b.length]
}

type NameParts = Pick<ImportRow, 'firstName' | 'lastName'>

interface NormalisedName {
  first: string
  last: string
}

function normaliseParts(name: NameParts): NormalisedName {
  return { first: normaliseName(name.firstName, ''), last: normaliseName(name.lastName, '') }
}

function sameName(a: NormalisedName, b: NormalisedName): boolean {
  return a.first === b.first && a.last === b.last
}

const NEAR = 2

/** Two letters out at most, and never more letters than the shorter name can spare. */
function nearName(a: string, b: string): boolean {
  if (a === b) return true
  const allowed = Math.min(NEAR, Math.min(a.length, b.length) - 1)
  return allowed > 0 && levenshtein(a, b) <= allowed
}

function initialOf(initial: string, name: string): boolean {
  return initial.length === 1 && name.length > 1 && name.startsWith(initial)
}

/**
 * Two spellings of one person: a couple of letters out on either name while the other
 * matches, first and last the other way round, or an initial standing in for the first name.
 */
export function similarNames(a: NameParts, b: NameParts): boolean {
  const left = normaliseParts(a)
  const right = normaliseParts(b)
  if (!left.first && !left.last) return false
  if (sameName(left, right)) return true
  if (left.first === right.last && left.last === right.first) return true
  if (left.last === right.last && nearName(left.first, right.first)) return true
  if (left.first === right.first && nearName(left.last, right.last)) return true
  if (
    left.last === right.last &&
    (initialOf(left.first, right.first) || initialOf(right.first, left.first))
  ) {
    return true
  }
  return false
}

/** Every spelling on record for a member: the name itself and each alias. */
function memberSpellings(member: Member): NameParts[] {
  return [
    { firstName: member.firstName, lastName: member.lastName },
    ...member.aliases.map(splitFullName)
  ]
}

export function exactSpelling(member: Member, name: NameParts): boolean {
  const wanted = normaliseParts(name)
  return memberSpellings(member).some((spelling) => sameName(normaliseParts(spelling), wanted))
}

export type SyncRef = { kind: 'member'; memberId: number } | { kind: 'row'; line: number }

const syncRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('member'), memberId: z.number().int().positive() }),
  z.object({ kind: z.literal('row'), line: z.number().int().positive() })
])

export interface SyncCandidate {
  ref: SyncRef
  name: string
  /** The normalised names agree outright, so Merge is proposed rather than merely offered. */
  exact: boolean
}

export type SyncMatch =
  | { kind: 'known'; memberId: number; newSpelling: boolean }
  | { kind: 'similar'; candidates: SyncCandidate[] }
  | { kind: 'new' }

export interface SyncPlanRow {
  row: ImportRow
  match: SyncMatch
}

export interface SyncPlan {
  rows: SyncPlanRow[]
  invalid: ImportRowProblem[]
}

/** A record that stands for a person in the master list today. */
function liveMembers(members: readonly Member[]): Member[] {
  return members.filter((member) => member.mergedInto === undefined && !member.deleted)
}

/** One export writes `007` where another writes `7`; a numeric id compares without its zeros. */
export function normaliseMbdId(id: string): string {
  const trimmed = id.trim()
  return /^\d+$/.test(trimmed) ? String(Number(trimmed)) : trimmed
}

function byMbdId(members: readonly Member[], mbdId: string): Member | null {
  const wanted = normaliseMbdId(mbdId)
  const holder = members.find((member) =>
    member.mbdIds.some((known) => normaliseMbdId(known) === wanted)
  )
  return holder ? resolveMember(members, holder.id) : null
}

/**
 * Decide each row against the master list, in file order, so a row later in the file
 * can be offered as a merge into a person an earlier row is about to create.
 */
export function planMbdSync(members: readonly Member[], input: ImportRows): SyncPlan {
  const live = liveMembers(members)
  const pending: { line: number; name: NameParts }[] = []
  const rows = input.rows.map((row): SyncPlanRow => {
    const known = byMbdId(members, row.mbdId)
    if (known) {
      return {
        row,
        match: { kind: 'known', memberId: known.id, newSpelling: !exactSpelling(known, row) }
      }
    }
    const candidates: SyncCandidate[] = []
    for (const member of live) {
      const spellings = memberSpellings(member)
      if (!spellings.some((spelling) => similarNames(spelling, row))) continue
      candidates.push({
        ref: { kind: 'member', memberId: member.id },
        name: memberDisplayName(member),
        exact: exactSpelling(member, row)
      })
    }
    for (const earlier of pending) {
      if (!similarNames(earlier.name, row)) continue
      candidates.push({
        ref: { kind: 'row', line: earlier.line },
        name: `${earlier.name.firstName} ${earlier.name.lastName}`.trim(),
        exact: sameName(normaliseParts(earlier.name), normaliseParts(row))
      })
    }
    pending.push({ line: row.line, name: row })
    candidates.sort((a, b) => Number(b.exact) - Number(a.exact))
    return { row, match: candidates.length > 0 ? { kind: 'similar', candidates } : { kind: 'new' } }
  })
  return { rows, invalid: input.invalid }
}

const lineSchema = z.number().int().positive()

export const syncDecisionSchema = z.discriminatedUnion('kind', [
  /** A known member whose exported spelling differs: which one is the name, the other an alias. */
  z.object({ kind: z.literal('spelling'), line: lineSchema, keep: z.enum(['member', 'export']) }),
  z.object({ kind: z.literal('merge'), line: lineSchema, into: syncRefSchema }),
  z.object({ kind: z.literal('create'), line: lineSchema })
])

export type SyncDecision = z.infer<typeof syncDecisionSchema>

export interface SyncSummary {
  rows: number
  created: number
  matched: number
  /** Ids added to members that already existed. */
  merged: number
  aliased: number
  /** Soft-deleted members the export still lists, brought back. */
  restored: number
  /** Rows that needed a decision and got none. */
  skipped: number
  failed: ImportRowProblem[]
}

function cloneFile(file: MembersFile): MembersFile {
  return {
    ...file,
    members: file.members.map((member) => ({
      ...member,
      mbdIds: [...member.mbdIds],
      aliases: [...member.aliases]
    }))
  }
}

function addAlias(member: Member, name: NameParts): boolean {
  if (exactSpelling(member, name)) return false
  member.aliases.push(`${name.firstName} ${name.lastName}`.trim())
  return true
}

function fillGender(member: Member, row: ImportRow): void {
  if (member.gender === undefined && row.gender !== undefined) member.gender = row.gender
}

function createFromRow(file: MembersFile, row: ImportRow): Member {
  const member: Member = {
    id: mintNumber(file),
    firstName: row.firstName,
    lastName: row.lastName,
    mbdIds: [row.mbdId],
    aliases: [],
    marketing: true
  }
  if (row.gender !== undefined) member.gender = row.gender
  file.members.push(member)
  return member
}

export interface SyncResult {
  file: MembersFile
  summary: SyncSummary
}

/** Apply a plan and its decisions to a copy of the master list; nothing is written here. */
export function applyMbdSync(
  source: MembersFile,
  plan: SyncPlan,
  decisions: readonly SyncDecision[]
): SyncResult {
  const file = cloneFile(source)
  const createdByLine = new Map<number, number>()
  const summary: SyncSummary = {
    rows: plan.rows.length + plan.invalid.length,
    created: 0,
    matched: 0,
    merged: 0,
    aliased: 0,
    restored: 0,
    skipped: 0,
    failed: [...plan.invalid]
  }
  const decisionByLine = new Map(decisions.map((decision) => [decision.line, decision]))
  const decisionFor = (line: number): SyncDecision | undefined => decisionByLine.get(line)
  const target = (ref: SyncRef): Member | null => {
    const id = ref.kind === 'member' ? ref.memberId : createdByLine.get(ref.line)
    return id === undefined ? null : resolveMember(file.members, id)
  }
  const create = (row: ImportRow): void => {
    createdByLine.set(row.line, createFromRow(file, row).id)
    summary.created += 1
  }

  for (const { row, match } of plan.rows) {
    if (match.kind === 'new') {
      create(row)
      continue
    }
    if (match.kind === 'known') {
      const member = resolveMember(file.members, match.memberId)
      if (!member) {
        summary.failed.push({ line: row.line, message: `Member ${match.memberId} is missing` })
        continue
      }
      const decision = decisionFor(row.line)
      if (match.newSpelling && decision?.kind === 'spelling' && decision.keep === 'export') {
        const previous = { firstName: member.firstName, lastName: member.lastName }
        member.firstName = row.firstName
        member.lastName = row.lastName
        if (addAlias(member, previous)) summary.aliased += 1
      } else if (addAlias(member, row)) summary.aliased += 1
      fillGender(member, row)
      if (member.deleted) {
        delete member.deleted
        summary.restored += 1
      }
      summary.matched += 1
      continue
    }
    const decision = decisionFor(row.line)
    if (decision?.kind === 'create') {
      create(row)
    } else if (decision?.kind === 'merge') {
      const member = target(decision.into)
      if (!member) {
        summary.failed.push({ line: row.line, message: 'The member to merge into was not created' })
        continue
      }
      if (!member.mbdIds.includes(row.mbdId)) member.mbdIds.push(row.mbdId)
      if (addAlias(member, row)) summary.aliased += 1
      fillGender(member, row)
      summary.merged += 1
    } else {
      summary.skipped += 1
    }
  }
  return { file, summary }
}

export type RosterMatch =
  { kind: 'add'; memberId: number } | { kind: 'on-roster'; memberId: number } | { kind: 'unknown' }

export interface RosterPlanRow {
  row: ImportRow
  match: RosterMatch
}

export interface RosterPlan {
  rows: RosterPlanRow[]
  invalid: ImportRowProblem[]
  /** Team names in the export that the season does not have yet, in order of appearance. */
  newTeams: string[]
}

function findTeam(teams: readonly Team[], name: string): Team | null {
  const wanted = normaliseName(name, '')
  return teams.find((team) => normaliseName(team.name, '') === wanted) ?? null
}

/** Match a per-league export to the master list and the season it was dropped on. */
export function planRosterImport(
  members: readonly Member[],
  season: SeasonFile,
  input: ImportRows
): RosterPlan {
  const onRoster = new Set(season.players.map((player) => player.memberId))
  const rows = input.rows.map((row): RosterPlanRow => {
    const member = byMbdId(members, row.mbdId)
    if (!member) return { row, match: { kind: 'unknown' } }
    if (onRoster.has(member.id)) return { row, match: { kind: 'on-roster', memberId: member.id } }
    onRoster.add(member.id)
    return { row, match: { kind: 'add', memberId: member.id } }
  })
  // A team is only made for a player who joins, so rows already on the roster name none.
  const newTeams: string[] = []
  for (const { row, match } of rows) {
    const team = row.team
    if (!team || match.kind === 'on-roster' || findTeam(season.teams, team)) continue
    if (!newTeams.some((name) => normaliseName(name, '') === normaliseName(team, ''))) {
      newTeams.push(team)
    }
  }
  return { rows, invalid: input.invalid, newTeams }
}

export interface ImportSummary {
  rows: number
  added: number
  /** Members created for unknown MBD IDs the desk chose to add. */
  created: number
  /** Soft-deleted members the export lists, brought back so the roster can name them. */
  restored: number
  teamsCreated: number
  /** Rows already on the roster. */
  skipped: number
  /** Unknown MBD IDs left alone. */
  unknown: number
  failed: ImportRowProblem[]
}

export interface RosterImportResult {
  membersFile: MembersFile
  season: SeasonFile
  summary: ImportSummary
}

/**
 * Add the plan's players to a copy of the season, creating members for the chosen
 * unknown rows and any team the export names that the season lacks.
 */
export function applyRosterImport(
  membersSource: MembersFile,
  seasonSource: SeasonFile,
  plan: RosterPlan,
  createLines: readonly number[],
  teamId: () => string
): RosterImportResult {
  const membersFile = cloneFile(membersSource)
  const season: SeasonFile = {
    ...seasonSource,
    teams: [...seasonSource.teams],
    players: [...seasonSource.players]
  }
  const summary: ImportSummary = {
    rows: plan.rows.length + plan.invalid.length,
    added: 0,
    created: 0,
    restored: 0,
    teamsCreated: 0,
    skipped: 0,
    unknown: 0,
    failed: [...plan.invalid]
  }
  const teamFor = (name: string | undefined): string | null => {
    if (!name) return null
    const existing = findTeam(season.teams, name)
    if (existing) return existing.id
    const teamNo = season.teams.reduce((max, team) => Math.max(max, team.teamNo), 0) + 1
    const team: Team = { id: teamId(), teamNo, name }
    season.teams.push(team)
    summary.teamsCreated += 1
    return team.id
  }
  const onRoster = new Set(season.players.map((player) => player.memberId))
  const add = (memberId: number, row: ImportRow): void => {
    if (onRoster.has(memberId)) {
      summary.skipped += 1
      return
    }
    onRoster.add(memberId)
    season.players.push({ memberId, teamId: teamFor(row.team) })
    summary.added += 1
  }

  for (const { row, match } of plan.rows) {
    if (match.kind === 'on-roster') {
      summary.skipped += 1
    } else if (match.kind === 'add') {
      const member = resolveMember(membersFile.members, match.memberId)
      if (!member) {
        summary.failed.push({ line: row.line, message: `Member ${match.memberId} is missing` })
        continue
      }
      if (member.deleted) {
        delete member.deleted
        summary.restored += 1
      }
      add(member.id, row)
    } else if (createLines.includes(row.line)) {
      const member = createFromRow(membersFile, row)
      summary.created += 1
      add(member.id, row)
    } else {
      summary.unknown += 1
    }
  }
  return { membersFile, season, summary }
}
