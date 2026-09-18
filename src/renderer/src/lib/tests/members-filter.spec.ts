import { describe, expect, test } from 'vitest'
import { makeMember, makeRosterSeason, makeSeasonFile, makeSnapshot } from '../../tests/fixtures'
import {
  buildMemberRows,
  compareMemberRows,
  filterMemberRows,
  leagueChoices,
  type MembersFilter
} from '../members-filter'

const today = new Date(2026, 8, 18)

const snapshot = makeSnapshot({
  nextId: 6,
  members: [
    makeMember({ id: 1, firstName: 'Ann', lastName: 'Lee' }),
    makeMember({ id: 2, firstName: 'Bob', lastName: 'Kay', dob: undefined, email: undefined }),
    makeMember({ id: 3, firstName: 'Cy', lastName: 'Lee', aliases: ['Cyrus Lee'] }),
    makeMember({ id: 4, firstName: 'Old', lastName: 'Name', mergedInto: 1 }),
    makeMember({ id: 5, firstName: 'Gone', lastName: 'Away', deleted: true }),
    makeMember({ id: 3, firstName: 'Cy', lastName: 'Lee' })
  ],
  seasons: [
    makeRosterSeason({
      leagueFolder: 'Mixed triples',
      leagueName: 'Mixed Triples',
      file: makeSeasonFile({
        teams: [{ id: 'team_a', teamNo: 1, name: 'A' }],
        players: [
          { memberId: 1, teamId: 'team_a' },
          { memberId: 4, teamId: null }
        ]
      })
    }),
    makeRosterSeason({
      leagueFolder: 'Pairs',
      leagueName: 'Tuesday Pairs',
      day: 'tuesday',
      season: '2023-24',
      archived: true,
      file: makeSeasonFile({ players: [{ memberId: 2, teamId: null }] })
    })
  ],
  problems: [{ kind: 'duplicate-number', id: 3, count: 2 }]
})

const all: MembersFilter = { query: '', quick: 'all', leagueFolder: null }

function names(filter: Partial<MembersFilter>): string[] {
  return filterMemberRows(buildMemberRows(snapshot, today), snapshot, { ...all, ...filter })
    .sort(compareMemberRows)
    .map((row) => `${row.number} ${row.name}`)
}

describe('buildMemberRows', () => {
  test('drops merged records, pads numbers and joins live-season memberships only', () => {
    const rows = buildMemberRows(snapshot, today)
    expect(rows.map((row) => row.member.id)).toEqual([1, 2, 3, 5, 3])
    expect(rows[0].number).toBe('000001')
    // Member 4 was merged into 1, so its roster row lands on 1 as a sub.
    expect(rows[0].memberships.map((m) => [m.leagueName, m.team?.name ?? null])).toEqual([
      ['Mixed Triples', 'A'],
      ['Mixed Triples', null]
    ])
    expect(rows[1].memberships).toEqual([])
    expect(rows[1].needsDetails).toBe(true)
  })
})

describe('filterMemberRows', () => {
  test('hides deleted members by default and shows only them on request', () => {
    expect(names({})).toEqual([
      '000002 Bob Kay',
      '000001 Ann Lee',
      '000003 Cy Lee',
      '000003 Cy Lee'
    ])
    expect(names({ quick: 'deleted' })).toEqual(['000005 Gone Away'])
  })

  test('quick filters pick out missing details and duplicate numbers', () => {
    expect(names({ quick: 'needs-details' })).toEqual(['000002 Bob Kay'])
    expect(names({ quick: 'duplicate-numbers' })).toEqual(['000003 Cy Lee', '000003 Cy Lee'])
    expect(names({ quick: 'possible-duplicates' })).toEqual(['000003 Cy Lee', '000003 Cy Lee'])
  })

  test('matches names loosely, aliases, and numbers by their trailing digits', () => {
    expect(names({ query: 'lee' })).toEqual(['000001 Ann Lee', '000003 Cy Lee', '000003 Cy Lee'])
    expect(names({ query: 'CYRUS' })).toEqual(['000003 Cy Lee'])
    expect(names({ query: '000002' })).toEqual(['000002 Bob Kay'])
    expect(names({ query: '2' })).toEqual(['000002 Bob Kay'])
    expect(names({ query: '0' })).toEqual([])
  })

  test('a league filter keeps members on that league in a live season', () => {
    expect(names({ leagueFolder: 'Mixed triples' })).toEqual(['000001 Ann Lee'])
    expect(names({ leagueFolder: 'Pairs' })).toEqual([])
  })
})

describe('leagueChoices', () => {
  test('lists each league with a live roster once, by display name', () => {
    expect(leagueChoices(snapshot)).toEqual([{ folder: 'Mixed triples', name: 'Mixed Triples' }])
  })
})
