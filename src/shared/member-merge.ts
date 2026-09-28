import { z } from 'zod'
import {
  applyAgeRules,
  isUnder18,
  memberDisplayName,
  memberInputSchema,
  normaliseName,
  resolveMember,
  type Member,
  type Player,
  type RosterSeason
} from './members'

const memberIdSchema = z.number().int().positive()

export const memberMergeResultSchema = memberInputSchema
  .omit({ id: true })
  .extend({
    firstName: z.string().trim().min(1, 'Enter a first name'),
    lastName: z.string().trim().min(1, 'Enter a last name')
  })
  .strict()

export type MemberMergeResult = z.infer<typeof memberMergeResultSchema>

export const memberGroupMergeRequestSchema = z
  .object({
    sourceIds: z
      .array(memberIdSchema)
      .min(2, 'Choose at least two members')
      .refine((ids) => new Set(ids).size === ids.length, 'Choose each member once'),
    mainId: memberIdSchema,
    result: memberMergeResultSchema,
    expectedRevision: z.string()
  })
  .strict()
  .refine((request) => request.sourceIds.includes(request.mainId), {
    message: 'The main member must be one of the selected members',
    path: ['mainId']
  })

export type MemberGroupMergeRequest = z.infer<typeof memberGroupMergeRequestSchema>

export interface MemberMergeSource {
  id: number
  label: string
}

export interface MemberMergeAlternative {
  value: string | number | boolean | undefined
  sources: MemberMergeSource[]
}

export interface MemberMergeFieldPreview {
  field: keyof Omit<MemberMergeResult, 'aliases' | 'mbdIds'>
  alternatives: MemberMergeAlternative[]
}

export interface MemberMergeRosterAssignment {
  source: MemberMergeSource
  /** The number written on the roster, an old absorbed one when it differs from the source. */
  memberId: number
  teamId: string | null
  position?: number
  leagueSecretaryId?: string
  /** True for the one entry the merge keeps on this roster. */
  retained: boolean
}

export interface MemberMergeRosterDifference {
  path: string
  leagueName: string
  season: string
  assignments: MemberMergeRosterAssignment[]
}

export interface RosterMergeCandidate {
  /** Index into the roster's players. */
  index: number
  memberId: number
  sourceId: number
  sourceOrder: number
}

export interface RosterMergePlan {
  candidates: RosterMergeCandidate[]
  keep: RosterMergeCandidate | null
  /** A roster that lists main once, under whichever number, is left as it is. */
  unchanged: boolean
}

/**
 * Which of several roster entries resolving towards `mainId` survives: `mainId`'s own
 * current number first, then any entry that already resolves to `mainId` (an old number
 * merged into it), then the earliest by `sourceOrder`. A live merge orders candidates by the
 * selection the desk made, so the second rule can favour an old number over one chosen later.
 * A repair rebuilding groups from the master alone has no such order to replay: every
 * candidate's `sourceId` already equals the target, so the second rule matches whichever is
 * first and repair reduces to "the target's own current number, else the earliest entry",
 * which need not be the entry a merge's own preview would have kept.
 */
export function keepRosterCandidate(
  candidates: readonly RosterMergeCandidate[],
  mainId: number
): RosterMergeCandidate {
  const keep =
    candidates.find((candidate) => candidate.memberId === mainId) ??
    candidates.find((candidate) => candidate.sourceId === mainId) ??
    candidates.reduce((earliest, candidate) =>
      candidate.sourceOrder < earliest.sourceOrder ? candidate : earliest
    )
  return keep
}

/**
 * Which roster entries belong to the selected records and which one survives.
 * The preview and the write share this rule.
 */
export function planRosterMerge(
  players: readonly Player[],
  members: readonly Member[],
  sourceIds: readonly number[],
  mainId: number
): RosterMergePlan {
  const order = new Map(sourceIds.map((id, index) => [id, index] as const))
  const candidates = players.flatMap((player, index) => {
    const resolved = resolveMember(members, player.memberId)
    if (!resolved) return []
    const sourceOrder = order.get(resolved.id)
    return sourceOrder === undefined
      ? []
      : [{ index, memberId: player.memberId, sourceId: resolved.id, sourceOrder }]
  })
  if (candidates.length === 0) return { candidates, keep: null, unchanged: true }
  const keep = keepRosterCandidate(candidates, mainId)
  const unchanged = candidates.length === 1 && keep.sourceId === mainId
  return { candidates, keep, unchanged }
}

export interface MemberMergePreview {
  sources: MemberMergeSource[]
  result: MemberMergeResult
  fields: MemberMergeFieldPreview[]
  rosterDifferences: MemberMergeRosterDifference[]
}

const scalarFields = [
  'firstName',
  'lastName',
  'dob',
  'gender',
  'email',
  'phone',
  'guardianContact',
  'guardianMemberId',
  'marketing',
  'cardIssued',
  'notes'
] as const satisfies ReadonlyArray<MemberMergeFieldPreview['field']>

type FillableMemberField = Exclude<MemberMergeFieldPreview['field'], 'marketing' | 'cardIssued'>

export function cleanValues(values: readonly string[]): string[] {
  const clean: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    clean.push(trimmed)
  }
  return clean
}

function sourceFor(member: Member): MemberMergeSource {
  return { id: member.id, label: `${memberDisplayName(member)} (${member.id})` }
}

function normaliseScalar<K extends FillableMemberField>(field: K, value: Member[K]): Member[K] {
  // `guardianMemberId` is the one fillable field that is a number, not free text to trim.
  if (field === 'guardianMemberId' || value === undefined) return value
  // SAFETY: the field check above rules out `guardianMemberId`, so every other fillable
  // field is schema-validated as a string; generics just can't carry that correlation.
  return (value as string).trim() as Member[K]
}

/**
 * A guardian link only defaults in from another source when it resolves, through merges, to a
 * live adult whose number is not itself duplicated: the same standard `saveMember` holds a
 * changed link to. Main's own link is not checked here; it is kept as the default whatever its
 * state, since main's stored link is never re-validated either.
 */
function usableGuardianDefault(
  guardianId: number,
  allMembers: readonly Member[],
  today: Date
): boolean {
  const guardian = resolveMember(allMembers, guardianId)
  if (!guardian || guardian.deleted || isUnder18(guardian, today)) return false
  return allMembers.filter((candidate) => candidate.id === guardian.id).length === 1
}

function defaultScalar<K extends FillableMemberField>(
  sources: readonly Member[],
  main: Member,
  field: K,
  allMembers: readonly Member[],
  today: Date
): Member[K] {
  const mainValue = normaliseScalar(field, main[field])
  const isBlank = (value: Member[K]): boolean => value === undefined || value === ''
  if (!isBlank(mainValue)) return mainValue
  const alternatives = new Set(
    sources
      .filter((source) => source.id !== main.id)
      .map((source) => normaliseScalar(field, source[field]))
      .filter((value) => !isBlank(value))
      .filter(
        (value) =>
          field !== 'guardianMemberId' ||
          // SAFETY: the field check above means this alternative is `Member['guardianMemberId']`.
          usableGuardianDefault(value as number, allMembers, today)
      )
  )
  return alternatives.size === 1 ? [...alternatives][0] : mainValue
}

function defaultNotes(sources: readonly Member[], main: Member): string | undefined {
  const ordered = [main, ...sources.filter((source) => source.id !== main.id)]
  const notes = cleanValues(ordered.flatMap((source) => (source.notes ? [source.notes] : [])))
  return notes.length ? notes.join('\n\n') : undefined
}

function alternativeValue(
  source: Member,
  field: MemberMergeFieldPreview['field']
): MemberMergeAlternative['value'] {
  if (field === 'marketing') return source.marketing
  if (field === 'guardianMemberId') return source.guardianMemberId
  const trimmed = source[field]?.trim()
  return trimmed || undefined
}

function alternativesFor(
  sources: readonly Member[],
  field: MemberMergeFieldPreview['field']
): MemberMergeAlternative[] {
  const grouped = new Map<string, MemberMergeAlternative>()
  for (const source of sources) {
    const value = alternativeValue(source, field)
    const key = value === undefined ? 'undefined' : JSON.stringify(value)
    const existing = grouped.get(key)
    if (existing) existing.sources.push(sourceFor(source))
    else grouped.set(key, { value, sources: [sourceFor(source)] })
  }
  return [...grouped.values()]
}

function defaultResult(
  sources: readonly Member[],
  main: Member,
  allMembers: readonly Member[],
  today: Date
): MemberMergeResult {
  const result: MemberMergeResult = {
    firstName: defaultScalar(sources, main, 'firstName', allMembers, today),
    lastName: defaultScalar(sources, main, 'lastName', allMembers, today),
    mbdIds: cleanValues(sources.flatMap((source) => source.mbdIds)),
    aliases: cleanValues(sources.flatMap((source) => source.aliases)),
    marketing: main.marketing
  }
  const dob = defaultScalar(sources, main, 'dob', allMembers, today)
  const gender = defaultScalar(sources, main, 'gender', allMembers, today)
  const email = defaultScalar(sources, main, 'email', allMembers, today)
  const phone = defaultScalar(sources, main, 'phone', allMembers, today)
  const guardianContact = defaultScalar(sources, main, 'guardianContact', allMembers, today)
  const guardianMemberId = defaultScalar(sources, main, 'guardianMemberId', allMembers, today)
  if (dob !== undefined) result.dob = dob
  if (gender !== undefined) result.gender = gender
  if (email !== undefined) result.email = email
  if (phone !== undefined) result.phone = phone
  if (guardianContact !== undefined) result.guardianContact = guardianContact
  if (guardianMemberId !== undefined) result.guardianMemberId = guardianMemberId
  if (main.cardIssued !== undefined) result.cardIssued = main.cardIssued
  const notes = defaultNotes(sources, main)
  if (notes !== undefined) result.notes = notes
  return withOriginalNames(result, sources)
}

/**
 * Every source's name that differs from the final one becomes an alias, and an
 * alias that is the final name itself is dropped, so a record never lists its
 * own name as another spelling.
 */
export function withOriginalNames(
  result: MemberMergeResult,
  sources: readonly Member[]
): MemberMergeResult {
  const finalName = normaliseName(result.firstName, result.lastName)
  const originalNames = sources
    .filter((source) => normaliseName(source.firstName, source.lastName) !== finalName)
    .map(memberDisplayName)
  const aliases = cleanValues([...result.aliases, ...originalNames]).filter(
    (alias) => normaliseName(alias, '') !== finalName
  )
  return { ...result, aliases }
}

function rosterDifferences(
  sources: readonly Member[],
  mainId: number,
  rosters: readonly RosterSeason[],
  allMembers: readonly Member[]
): MemberMergeRosterDifference[] {
  const sourceIds = sources.map((source) => source.id)
  const sourceById = new Map(sources.map((source) => [source.id, source] as const))
  const differences: MemberMergeRosterDifference[] = []
  for (const roster of rosters.filter((candidate) => !candidate.archived)) {
    const plan = planRosterMerge(roster.file.players, allMembers, sourceIds, mainId)
    const assignments = plan.candidates.flatMap((candidate) => {
      const source = sourceById.get(candidate.sourceId)
      if (!source) return []
      const player = roster.file.players[candidate.index]
      return [
        {
          source: sourceFor(source),
          memberId: candidate.memberId,
          teamId: player.teamId,
          position: player.position,
          leagueSecretaryId: player.leagueSecretaryId,
          retained: candidate.index === plan.keep?.index
        }
      ]
    })
    const values = new Set(
      assignments.map((assignment) =>
        JSON.stringify([assignment.teamId, assignment.position, assignment.leagueSecretaryId])
      )
    )
    if (assignments.length > 1 && values.size > 1) {
      differences.push({
        path: roster.path,
        leagueName: roster.leagueName,
        season: roster.season,
        assignments
      })
    }
  }
  return differences
}

export function buildMemberMergePreview(
  sources: readonly Member[],
  mainId: number,
  rosters: readonly RosterSeason[] = [],
  allMembers: readonly Member[] = sources,
  today = new Date()
): MemberMergePreview {
  if (sources.length < 2) throw new Error('Choose at least two members')
  if (new Set(sources.map((source) => source.id)).size !== sources.length) {
    throw new Error('Choose each member once')
  }
  const main = sources.find((source) => source.id === mainId)
  if (!main) throw new Error('The main member must be one of the selected members')
  return {
    sources: sources.map(sourceFor),
    result: defaultResult(sources, main, allMembers, today),
    fields: scalarFields.map((field) => ({ field, alternatives: alternativesFor(sources, field) })),
    rosterDifferences: rosterDifferences(sources, mainId, rosters, allMembers)
  }
}

export function buildMergedMember(
  sources: readonly Member[],
  request: MemberGroupMergeRequest,
  today = new Date()
): Member {
  const parsed = memberGroupMergeRequestSchema.parse(request)
  const sourceById = new Map(sources.map((source) => [source.id, source] as const))
  const ordered = parsed.sourceIds.map((id) => sourceById.get(id))
  if (ordered.some((source) => source === undefined) || sources.length !== ordered.length) {
    throw new Error('The selected members do not match the merge request')
  }
  const selected = ordered.filter((source): source is Member => source !== undefined)
  const main = sourceById.get(parsed.mainId)
  if (!main) throw new Error('The main member must be one of the selected members')
  const withNames = withOriginalNames(
    {
      ...parsed.result,
      mbdIds: cleanValues([
        ...selected.flatMap((source) => source.mbdIds),
        ...parsed.result.mbdIds
      ]),
      aliases: cleanValues([
        ...selected.flatMap((source) => source.aliases),
        ...parsed.result.aliases
      ])
    },
    selected
  )
  const ruled = applyAgeRules(withNames, today)
  return { id: main.id, ...ruled }
}
