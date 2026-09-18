import { describe, expect, test } from 'vitest'
import {
  ageOn,
  applyAgeRules,
  deriveMemberships,
  disabledMembersSnapshot,
  findRosterProblems,
  formatMemberNumber,
  isReservedFileName,
  isUnder18,
  memberSchema,
  membersFileSchema,
  needsDetails,
  normaliseName,
  possibleDuplicates,
  resolveMember,
  seasonFileSchema,
  sortTeams,
  type Member,
  type MembersSnapshot,
  type RosterSeason,
  type SeasonFile
} from '../members'

function member(overrides: Partial<Member> & Pick<Member, 'id'>): Member {
  return {
    firstName: 'Jane',
    lastName: 'Doe',
    mbdIds: [],
    aliases: [],
    marketing: true,
    ...overrides
  }
}

function seasonFile(overrides: Partial<SeasonFile> = {}): SeasonFile {
  return { schemaVersion: 1, format: 3, teams: [], players: [], ...overrides }
}

function rosterSeason(overrides: Partial<RosterSeason> = {}): RosterSeason {
  return {
    day: 'monday',
    leagueFolder: 'Mixed triples',
    leagueName: 'Mixed Triples',
    season: '2025-26',
    path: '/root/monday/Mixed triples/2025-26',
    archived: false,
    revision: 'r1',
    file: seasonFile(),
    ...overrides
  }
}

function snapshot(overrides: Partial<MembersSnapshot> = {}): MembersSnapshot {
  return {
    enabled: true,
    revision: 'r0',
    nextId: 1,
    members: [],
    seasons: [],
    problems: [],
    ...overrides
  }
}

describe('schemas', () => {
  test('a minimal members file and season file parse', () => {
    expect(membersFileSchema.safeParse({ schemaVersion: 1, nextId: 1, members: [] }).success).toBe(
      true
    )
    expect(seasonFileSchema.safeParse(seasonFile()).success).toBe(true)
  })

  test('reject a wrong schema version, a non-positive number and an out-of-range format', () => {
    expect(membersFileSchema.safeParse({ schemaVersion: 2, nextId: 1, members: [] }).success).toBe(
      false
    )
    expect(
      membersFileSchema.safeParse({ schemaVersion: 1, nextId: 1, members: [member({ id: 0 })] })
        .success
    ).toBe(false)
    expect(seasonFileSchema.safeParse(seasonFile({ format: 0 })).success).toBe(false)
  })

  test('rejects a date that does not exist', () => {
    expect(memberSchema.safeParse(member({ id: 1, dob: '2025-99-99' })).success).toBe(false)
    expect(memberSchema.safeParse(member({ id: 1, dob: '2025-02-28' })).success).toBe(true)
  })

  test('reserved names cover the master list and a season file only', () => {
    expect(isReservedFileName('members.json')).toBe(true)
    expect(isReservedFileName('meta.json')).toBe(true)
    expect(isReservedFileName('Members.json')).toBe(false)
    expect(isReservedFileName('Rules.docx')).toBe(false)
  })
})

describe('formatMemberNumber', () => {
  test('pads to six digits until the list needs more', () => {
    expect(formatMemberNumber(42, 43)).toBe('000042')
    expect(formatMemberNumber(1, 1)).toBe('000001')
    expect(formatMemberNumber(42, 1_000_001)).toBe('0000042')
  })
})

describe('normaliseName', () => {
  test('folds case, accents, punctuation and spacing', () => {
    expect(normaliseName('  Zoë', "O'Brien-Smith ")).toBe('zoe obriensmith')
    expect(normaliseName('JOHN', 'DOE')).toBe(normaliseName('john', 'doe'))
  })
})

describe('ages', () => {
  const on = new Date(2026, 8, 18)

  test('counts a birthday that has not happened yet this year', () => {
    expect(ageOn('2008-09-19', on)).toBe(17)
    expect(ageOn('2008-09-18', on)).toBe(18)
  })

  test('a member without a date of birth is treated as an adult', () => {
    expect(isUnder18(member({ id: 1 }), on)).toBe(false)
    expect(isUnder18(member({ id: 1, dob: '2010-01-01' }), on)).toBe(true)
  })

  test('needsDetails asks adults for contact and juniors for a guardian', () => {
    expect(needsDetails(member({ id: 1 }), on)).toBe(true)
    expect(needsDetails(member({ id: 1, dob: '1990-01-01', email: 'j@x.org' }), on)).toBe(false)
    expect(needsDetails(member({ id: 1, dob: '1990-01-01' }), on)).toBe(true)
    expect(needsDetails(member({ id: 1, dob: '2012-01-01' }), on)).toBe(true)
    expect(needsDetails(member({ id: 1, dob: '2012-01-01', guardianContact: 'Mum' }), on)).toBe(
      false
    )
    expect(needsDetails(member({ id: 1, mergedInto: 2 }), on)).toBe(false)
    expect(needsDetails(member({ id: 1, deleted: true }), on)).toBe(false)
  })
})

describe('applyAgeRules', () => {
  const on = new Date(2026, 8, 18)
  const details = {
    firstName: 'Kid',
    lastName: 'Lee',
    email: 'k@x.org',
    phone: '0770',
    guardianContact: 'Dad',
    mbdIds: [],
    aliases: [],
    marketing: true
  }

  test('strips a junior’s own contact and keeps a guardian contact past 18', () => {
    expect(applyAgeRules({ ...details, dob: '2015-01-01' }, on)).toEqual({
      ...details,
      dob: '2015-01-01',
      email: undefined,
      phone: undefined
    })
    expect(applyAgeRules({ ...details, dob: '2000-01-01' }, on)).toEqual({
      ...details,
      dob: '2000-01-01'
    })
  })
})

describe('resolveMember', () => {
  test('follows merges to the surviving record and survives a cycle', () => {
    const members = [
      member({ id: 1, mergedInto: 2 }),
      member({ id: 2, mergedInto: 3 }),
      member({ id: 3, firstName: 'Survivor' }),
      member({ id: 4, mergedInto: 5 }),
      member({ id: 5, mergedInto: 4 })
    ]
    expect(resolveMember(members, 1)?.firstName).toBe('Survivor')
    expect(resolveMember(members, 9)).toBeNull()
    expect(resolveMember(members, 4)).not.toBeNull()
  })
})

describe('deriveMemberships', () => {
  test('one row per roster entry, resolved through merges, with the team attached', () => {
    const team = { id: 'team_a', teamNo: 2, name: 'Strikers' }
    const memberships = deriveMemberships(
      snapshot({
        members: [member({ id: 1, mergedInto: 2 }), member({ id: 2 }), member({ id: 3 })],
        seasons: [
          rosterSeason({
            file: seasonFile({
              teams: [team],
              players: [
                { memberId: 1, teamId: 'team_a', position: 1 },
                { memberId: 3, teamId: null },
                { memberId: 9, teamId: null }
              ]
            })
          })
        ]
      })
    )
    expect(memberships).toEqual([
      expect.objectContaining({ memberId: 2, team, position: 1, season: '2025-26' }),
      expect.objectContaining({ memberId: 3, team: null })
    ])
  })
})

describe('findRosterProblems', () => {
  test('reports duplicate numbers, unlinked players and unknown teams', () => {
    const problems = findRosterProblems(
      snapshot({
        members: [member({ id: 1 }), member({ id: 1 }), member({ id: 2 })],
        seasons: [
          rosterSeason({
            file: seasonFile({
              players: [
                { memberId: 2, teamId: 'team_missing' },
                { memberId: 7, teamId: null }
              ]
            })
          })
        ]
      })
    )
    expect(problems).toEqual([
      { kind: 'duplicate-number', id: 1, count: 2 },
      {
        kind: 'unknown-team',
        path: '/root/monday/Mixed triples/2025-26',
        memberId: 2,
        teamId: 'team_missing'
      },
      { kind: 'unlinked-player', path: '/root/monday/Mixed triples/2025-26', memberId: 7 }
    ])
  })

  test('a disabled snapshot has nothing to report', () => {
    expect(findRosterProblems(disabledMembersSnapshot())).toEqual([])
  })
})

describe('possibleDuplicates', () => {
  test('groups shared names and aliases unless the MBD says they differ', () => {
    const groups = possibleDuplicates([
      member({ id: 1, firstName: 'John', lastName: 'Smith' }),
      member({ id: 2, firstName: 'JOHN', lastName: 'Smith', aliases: [] }),
      member({ id: 3, firstName: 'Jon', lastName: 'Smyth', aliases: ['John Smith'] }),
      member({ id: 4, firstName: 'Ann', lastName: 'Lee', mbdIds: ['10'] }),
      member({ id: 5, firstName: 'Ann', lastName: 'Lee', mbdIds: ['11'] }),
      member({ id: 6, firstName: 'John', lastName: 'Smith', mergedInto: 1 })
    ])
    expect(groups.map((group) => group.map((m) => m.id))).toEqual([[1, 2, 3]])
  })

  test('keeps the larger of two overlapping groups', () => {
    const groups = possibleDuplicates([
      member({ id: 1, firstName: 'Sam', lastName: 'Cole' }),
      member({ id: 2, firstName: 'Sam', lastName: 'Cole', aliases: ['Samuel Cole'] }),
      member({ id: 3, firstName: 'Samuel', lastName: 'Cole', aliases: ['Sam Cole'] })
    ])
    expect(groups.map((group) => group.map((m) => m.id))).toEqual([[1, 2, 3]])
  })
})

describe('sortTeams', () => {
  test('orders by lane draw, then name', () => {
    expect(
      sortTeams([
        { id: 'b', teamNo: 2, name: 'B' },
        { id: 'a', teamNo: 1, name: 'Z' },
        { id: 'c', teamNo: 2, name: 'A' }
      ]).map((team) => team.id)
    ).toEqual(['a', 'c', 'b'])
  })
})
