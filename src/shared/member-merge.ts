import { z } from 'zod'
import {
  applyAgeRules,
  memberDisplayName,
  memberInputSchema,
  normaliseName,
  resolveMember,
  type Member,
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
  value: string | boolean | undefined
  sources: MemberMergeSource[]
}

export interface MemberMergeFieldPreview {
  field: keyof Omit<MemberMergeResult, 'aliases' | 'mbdIds'>
  alternatives: MemberMergeAlternative[]
}

export interface MemberMergeRosterDifference {
  path: string
  leagueName: string
  season: string
  assignments: Array<{
    source: MemberMergeSource
    teamId: string | null
    position?: number
    leagueSecretaryId?: string
  }>
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
  'marketing',
  'cardIssued',
  'notes'
] as const satisfies ReadonlyArray<MemberMergeFieldPreview['field']>

type FillableMemberField = Exclude<MemberMergeFieldPreview['field'], 'marketing' | 'cardIssued'>

function cleanValues(values: readonly string[]): string[] {
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

function normaliseScalar<K extends FillableMemberField>(value: Member[K]): Member[K] {
  if (value === undefined) return value
  // SAFETY: every fillable member field is schema-validated as a string.
  return value.trim() as Member[K]
}

function defaultScalar<K extends FillableMemberField>(
  sources: readonly Member[],
  main: Member,
  field: K
): Member[K] {
  const mainValue = normaliseScalar(main[field])
  const isBlank = (value: Member[K]): boolean => value === undefined || value === ''
  if (!isBlank(mainValue)) return mainValue
  const alternatives = new Set(
    sources
      .filter((source) => source.id !== main.id)
      .map((source) => normaliseScalar(source[field]))
      .filter((value) => !isBlank(value))
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
  return source[field]?.trim()
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

function defaultResult(sources: readonly Member[], main: Member): MemberMergeResult {
  const result: MemberMergeResult = {
    firstName: defaultScalar(sources, main, 'firstName'),
    lastName: defaultScalar(sources, main, 'lastName'),
    mbdIds: cleanValues(sources.flatMap((source) => source.mbdIds)),
    aliases: cleanValues(sources.flatMap((source) => source.aliases)),
    marketing: main.marketing
  }
  const dob = defaultScalar(sources, main, 'dob')
  const gender = defaultScalar(sources, main, 'gender')
  const email = defaultScalar(sources, main, 'email')
  const phone = defaultScalar(sources, main, 'phone')
  const guardianContact = defaultScalar(sources, main, 'guardianContact')
  if (dob !== undefined) result.dob = dob
  if (gender !== undefined) result.gender = gender
  if (email !== undefined) result.email = email
  if (phone !== undefined) result.phone = phone
  if (guardianContact !== undefined) result.guardianContact = guardianContact
  if (main.cardIssued !== undefined) result.cardIssued = main.cardIssued
  const notes = defaultNotes(sources, main)
  if (notes !== undefined) result.notes = notes
  return withOriginalNames(result, sources)
}

function withOriginalNames(
  result: MemberMergeResult,
  sources: readonly Member[]
): MemberMergeResult {
  const finalName = normaliseName(result.firstName, result.lastName)
  const originalNames = sources
    .filter((source) => normaliseName(source.firstName, source.lastName) !== finalName)
    .map(memberDisplayName)
  return { ...result, aliases: cleanValues([...result.aliases, ...originalNames]) }
}

function rosterDifferences(
  sources: readonly Member[],
  rosters: readonly RosterSeason[],
  allMembers: readonly Member[]
): MemberMergeRosterDifference[] {
  const sourceIds = new Set(sources.map((source) => source.id))
  const sourceById = new Map(sources.map((source) => [source.id, source] as const))
  const differences: MemberMergeRosterDifference[] = []
  for (const roster of rosters.filter((candidate) => !candidate.archived)) {
    const assignments = roster.file.players.flatMap((player) => {
      const resolved = resolveMember(allMembers, player.memberId)
      if (!resolved || !sourceIds.has(resolved.id)) return []
      const source = sourceById.get(resolved.id)
      if (!source) return []
      return [
        {
          source: sourceFor(source),
          teamId: player.teamId,
          position: player.position,
          leagueSecretaryId: player.leagueSecretaryId
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
  allMembers: readonly Member[] = sources
): MemberMergePreview {
  if (sources.length < 2) throw new Error('Choose at least two members')
  if (new Set(sources.map((source) => source.id)).size !== sources.length) {
    throw new Error('Choose each member once')
  }
  const main = sources.find((source) => source.id === mainId)
  if (!main) throw new Error('The main member must be one of the selected members')
  return {
    sources: sources.map(sourceFor),
    result: defaultResult(sources, main),
    fields: scalarFields.map((field) => ({ field, alternatives: alternativesFor(sources, field) })),
    rosterDifferences: rosterDifferences(sources, rosters, allMembers)
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
