import { describe, expect, test } from 'vitest'
import {
  buildMemberMergePreview,
  buildMergedMember,
  memberGroupMergeRequestSchema,
  type MemberGroupMergeRequest
} from '../member-merge'
import type { Member, RosterSeason } from '../members'

function member(id: number, overrides: Partial<Member> = {}): Member {
  return {
    id,
    firstName: `Member${id}`,
    lastName: 'Bowler',
    mbdIds: [],
    aliases: [],
    marketing: true,
    ...overrides
  }
}

function request(
  sources: readonly Member[],
  mainId: number,
  result = buildMemberMergePreview(sources, mainId).result
): MemberGroupMergeRequest {
  return { sourceIds: sources.map((source) => source.id), mainId, result, expectedRevision: 'r1' }
}

describe('buildMemberMergePreview', () => {
  test('defaults two sources from main and fills its sole blank alternative', () => {
    const sources = [
      member(1, { firstName: 'Anne', email: undefined, marketing: false }),
      member(2, { firstName: 'Annie', email: 'annie@example.org', marketing: true })
    ]
    const preview = buildMemberMergePreview(sources, 1)
    expect(preview.result).toMatchObject({
      firstName: 'Anne',
      email: 'annie@example.org',
      marketing: false,
      aliases: ['Annie Bowler']
    })
    expect(preview.fields.find(({ field }) => field === 'firstName')?.alternatives).toEqual([
      { value: 'Anne', sources: [{ id: 1, label: 'Anne Bowler (1)' }] },
      { value: 'Annie', sources: [{ id: 2, label: 'Annie Bowler (2)' }] }
    ])
  })

  test('does not fill a blank with competing alternatives across three sources', () => {
    const sources = [
      member(1, { email: undefined }),
      member(2, { email: 'two@example.org' }),
      member(3, { email: 'three@example.org' })
    ]
    expect(buildMemberMergePreview(sources, 1).result.email).toBeUndefined()
  })

  test('treats trailing whitespace as the same gap-fill alternative', () => {
    const sources = [
      member(1, { email: undefined }),
      member(2, { email: 'a@example.org' }),
      member(3, { email: 'a@example.org ' })
    ]
    const preview = buildMemberMergePreview(sources, 1)
    expect(preview.result.email).toBe('a@example.org')
    expect(preview.fields.find(({ field }) => field === 'email')?.alternatives).toEqual([
      { value: undefined, sources: [expect.objectContaining({ id: 1 })] },
      {
        value: 'a@example.org',
        sources: [expect.objectContaining({ id: 2 }), expect.objectContaining({ id: 3 })]
      }
    ])
  })

  test('treats optional whitespace as blank and keeps card metadata from main', () => {
    const sources = [
      member(1, { phone: '   ', cardIssued: undefined }),
      member(2, { phone: '0700', cardIssued: '2026-01-01' })
    ]
    expect(buildMemberMergePreview(sources, 1).result).toMatchObject({ phone: '0700' })
    expect(buildMemberMergePreview(sources, 1).result.cardIssued).toBeUndefined()
  })

  test('unions identifiers and names and joins distinct notes main-first for many sources', () => {
    const sources = [
      member(1, { firstName: 'Main', mbdIds: ['a'], aliases: ['M Bowler'], notes: 'Main note' }),
      member(2, { firstName: 'Second', mbdIds: ['b', 'a'], notes: 'Other note' }),
      member(3, { firstName: 'Third', aliases: ['M Bowler'], notes: 'Main note' }),
      member(4, { firstName: 'Fourth', notes: '  ' })
    ]
    const preview = buildMemberMergePreview(sources, 1)
    expect(preview.result).toMatchObject({
      mbdIds: ['a', 'b'],
      aliases: ['M Bowler', 'Second Bowler', 'Third Bowler', 'Fourth Bowler'],
      notes: 'Main note\n\nOther note'
    })
    expect(preview.fields.find(({ field }) => field === 'notes')?.alternatives).toEqual([
      {
        value: 'Main note',
        sources: [expect.objectContaining({ id: 1 }), expect.objectContaining({ id: 3 })]
      },
      { value: 'Other note', sources: [expect.objectContaining({ id: 2 })] },
      { value: '', sources: [expect.objectContaining({ id: 4 })] }
    ])
  })

  test('shows differing live roster assignments with source labels', () => {
    const sources = [member(1, { firstName: 'Main' }), member(2, { firstName: 'Other' })]
    const roster: RosterSeason = {
      day: 'monday',
      leagueFolder: 'Pairs',
      leagueName: 'Monday Pairs',
      season: '2026-27',
      path: '/root/monday/Pairs/2026-27',
      archived: false,
      revision: 'r1',
      file: {
        schemaVersion: 1,
        format: 2,
        teams: [],
        players: [
          { memberId: 1, teamId: 'a', position: 1 },
          { memberId: 2, teamId: 'b', position: 2 }
        ]
      }
    }
    expect(buildMemberMergePreview(sources, 1, [roster]).rosterDifferences).toEqual([
      expect.objectContaining({
        path: roster.path,
        assignments: [
          expect.objectContaining({ source: { id: 1, label: 'Main Bowler (1)' }, teamId: 'a' }),
          expect.objectContaining({ source: { id: 2, label: 'Other Bowler (2)' }, teamId: 'b' })
        ]
      })
    ])
  })

  test('resolves roster assignments through an absorbed identity', () => {
    const sources = [member(1, { firstName: 'Main' }), member(2, { firstName: 'Other' })]
    const absorbed = member(5, { mergedInto: 2 })
    const roster: RosterSeason = {
      day: 'monday',
      leagueFolder: 'Pairs',
      leagueName: 'Pairs',
      season: '2026-27',
      path: '/root/monday/Pairs/2026-27',
      archived: false,
      revision: 'r1',
      file: {
        schemaVersion: 1,
        format: 2,
        teams: [],
        players: [
          { memberId: 1, teamId: 'a' },
          { memberId: 5, teamId: 'b' }
        ]
      }
    }
    expect(
      buildMemberMergePreview(sources, 1, [roster], [...sources, absorbed]).rosterDifferences
    ).toHaveLength(1)
  })
})

describe('buildMergedMember', () => {
  test('keeps reviewed extras and manual notes while applying age rules', () => {
    const sources = [
      member(1, { firstName: 'Main', mbdIds: ['a'], aliases: ['Known'] }),
      member(2, { firstName: 'Other', mbdIds: ['b'] })
    ]
    const reviewed = {
      ...buildMemberMergePreview(sources, 1).result,
      dob: '2015-01-01',
      email: 'child@example.org',
      phone: '0700',
      guardianContact: 'Parent',
      mbdIds: ['a', 'b', 'extra', 'extra'],
      aliases: ['Known', 'Manual', 'Other Bowler', 'Manual'],
      notes: 'Edited note'
    }
    expect(
      buildMergedMember(sources, request(sources, 1, reviewed), new Date(2026, 8, 18))
    ).toEqual({
      id: 1,
      ...reviewed,
      email: undefined,
      phone: undefined,
      mbdIds: ['a', 'b', 'extra'],
      aliases: ['Known', 'Manual', 'Other Bowler']
    })
  })

  test('restores source identifiers and aliases when a reviewed result omits them', () => {
    const sources = [
      member(1, { firstName: 'Main', aliases: ['Known'] }),
      member(2, { firstName: 'Other', mbdIds: ['mbd-2'] })
    ]
    const preview = buildMemberMergePreview(sources, 1).result
    expect(
      buildMergedMember(sources, request(sources, 1, { ...preview, mbdIds: [], aliases: [] }))
    ).toMatchObject({ mbdIds: ['mbd-2'], aliases: ['Known', 'Other Bowler'] })
  })
})

describe('memberGroupMergeRequestSchema', () => {
  const sources = [member(1), member(2)]
  const valid = request(sources, 1)

  test('requires ordered distinct sources and a selected main', () => {
    expect(memberGroupMergeRequestSchema.safeParse(valid).success).toBe(true)
    expect(memberGroupMergeRequestSchema.safeParse({ ...valid, sourceIds: [1] }).success).toBe(
      false
    )
    expect(memberGroupMergeRequestSchema.safeParse({ ...valid, sourceIds: [1, 1] }).success).toBe(
      false
    )
    expect(memberGroupMergeRequestSchema.safeParse({ ...valid, mainId: 3 }).success).toBe(false)
  })

  test('rejects invalid dates, blank names and forged identity state', () => {
    expect(
      memberGroupMergeRequestSchema.safeParse({
        ...valid,
        result: { ...valid.result, firstName: ' ', dob: '2026-99-99' }
      }).success
    ).toBe(false)
    expect(
      memberGroupMergeRequestSchema.safeParse({
        ...valid,
        result: { ...valid.result, id: 99, deleted: true, mergedInto: 5 }
      }).success
    ).toBe(false)
  })
})
