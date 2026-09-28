import { describe, expect, test } from 'vitest'
import {
  applyMbdSync,
  applyRosterImport,
  columnChoices,
  exactSpelling,
  isImportFileName,
  levenshtein,
  mappingFitsColumns,
  mappingProblem,
  parseDelimited,
  parseGender,
  planMbdSync,
  planRosterImport,
  readImportRows,
  similarNames,
  splitFullName,
  suggestMapping,
  type ImportMapping,
  type ImportRows,
  type SyncDecision
} from '../imports'
import type { Member, MembersFile, SeasonFile } from '../members'

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

function membersFile(members: Member[], nextId?: number): MembersFile {
  return {
    schemaVersion: 1,
    nextId: nextId ?? members.reduce((max, entry) => Math.max(max, entry.id), 0) + 1,
    members
  }
}

const NO_MAPPING: ImportMapping = {
  mbdId: null,
  firstName: null,
  lastName: null,
  fullName: null,
  gender: null,
  team: null,
  league: null
}

const SPLIT: ImportMapping = { ...NO_MAPPING, mbdId: 0, firstName: 1, lastName: 2, gender: 3 }

function rows(...entries: [string, string, string, string?, string?][]): ImportRows {
  return readImportRows(
    {
      columns: ['MBD ID', 'First', 'Last', 'Gender', 'Team'],
      rows: entries.map(([id, first, last, gender = '', team = '']) => [
        id,
        first,
        last,
        gender,
        team
      ])
    },
    { ...SPLIT, team: 4 }
  )
}

describe('parseDelimited', () => {
  test('reads quoted fields, doubled quotes, CRLF and a byte order mark', () => {
    const table = parseDelimited(
      '\uFEFFMBD ID,Name,Notes\r\n10,"Lee, Ann","said ""hi""\nthen left"\r\n\r\n11,Bob Kay,\r\n'
    )
    expect(table.columns).toEqual(['MBD ID', 'Name', 'Notes'])
    expect(table.rows).toEqual([
      ['10', 'Lee, Ann', 'said "hi"\nthen left'],
      ['11', 'Bob Kay', '']
    ])
  })

  test('picks the delimiter the header uses most and squares every row to it', () => {
    expect(parseDelimited('a\tb\tc\n1\t2\n3\t4\t5\t6\n')).toEqual({
      columns: ['a', 'b', 'c'],
      rows: [
        ['1', '2', ''],
        ['3', '4', '5']
      ]
    })
    expect(parseDelimited('a;b\n1;2')).toEqual({ columns: ['a', 'b'], rows: [['1', '2']] })
    expect(parseDelimited('')).toEqual({ columns: [], rows: [] })
  })
})

describe('suggestMapping', () => {
  test('guesses from header names and prefers split names over a full name column', () => {
    expect(
      suggestMapping(['Bowler ID', 'Name', 'First Name', 'Surname', 'Sex', 'Team Name'])
    ).toEqual({
      mbdId: 0,
      firstName: 2,
      lastName: 3,
      fullName: null,
      gender: 4,
      team: 5,
      league: null
    })
    expect(suggestMapping(['ID', 'Bowler Name', 'Handicap'])).toEqual({
      ...NO_MAPPING,
      mbdId: 0,
      fullName: 1
    })
  })

  test('reports what a mapping still needs and whether it fits a file', () => {
    expect(mappingProblem(NO_MAPPING)).toMatch(/MBD ID/)
    expect(mappingProblem({ ...NO_MAPPING, mbdId: 0 })).toMatch(/name/)
    expect(mappingProblem({ ...NO_MAPPING, mbdId: 0, fullName: 1 })).toBeNull()
    expect(mappingProblem(SPLIT)).toBeNull()
    expect(mappingFitsColumns(SPLIT, 4)).toBe(true)
    expect(mappingFitsColumns(SPLIT, 3)).toBe(false)
  })

  test('recognises export file names', () => {
    expect(isImportFileName('bowlers.CSV')).toBe(true)
    expect(isImportFileName('bowlers.tsv')).toBe(true)
    expect(isImportFileName('MBDExport.xlsx')).toBe(true)
    expect(isImportFileName('bowlers.docx')).toBe(false)
  })
})

describe('readImportRows', () => {
  test('splits a full name either way round, parses gender and keeps the team', () => {
    expect(splitFullName('Lee, Ann')).toEqual({ firstName: 'Ann', lastName: 'Lee' })
    expect(splitFullName('Ann Marie Lee')).toEqual({ firstName: 'Ann Marie', lastName: 'Lee' })
    expect(splitFullName('Cher')).toEqual({ firstName: 'Cher', lastName: '' })
    expect(parseGender('F')).toBe('female')
    expect(parseGender('Male')).toBe('male')
    expect(parseGender('?')).toBeUndefined()

    const table = { columns: ['Id', 'Name', 'G', 'Team'], rows: [['7', 'Lee, Ann', 'f', 'Ants']] }
    expect(
      readImportRows(table, { ...NO_MAPPING, mbdId: 0, fullName: 1, gender: 2, team: 3 })
    ).toEqual({
      rows: [
        { line: 2, mbdId: '7', firstName: 'Ann', lastName: 'Lee', gender: 'female', team: 'Ants' }
      ],
      invalid: []
    })
  })

  test('reports rows without an id or a name, reads a repeated bowler once and flags a clash', () => {
    const result = rows(
      ['', 'Ann', 'Lee'],
      ['8', '', ''],
      ['9', 'Bob', 'Kay'],
      ['09', 'Bob', 'Kay'],
      ['9', 'Someone', 'Else']
    )
    expect(result.rows.map((row) => row.line)).toEqual([4])
    expect(result.invalid).toEqual([
      { line: 2, message: 'No MBD ID' },
      { line: 3, message: 'No name for MBD ID 8' },
      { line: 6, message: 'Repeats MBD ID 9 from line 4 with a different name' }
    ])
  })

  test('reads the MBD gender codes and a one-field name left in the first name column', () => {
    expect(parseGender('W')).toBe('female')
    expect(parseGender('B')).toBe('male')
    expect(parseGender('G')).toBe('female')
    const result = rows(['1', 'Ann Marie Lee', ''], ['2', 'Cher', ''], ['3', 'Team 1', ''])
    expect(result.rows.map((row) => [row.firstName, row.lastName])).toEqual([
      ['Ann Marie', 'Lee'],
      ['Cher', ''],
      ['Team 1', '']
    ])
  })

  test('keeps only the chosen league from a dump of several and lists what can be chosen', () => {
    const table = {
      columns: ['League Name', 'MBD ID', 'First', 'Last'],
      rows: [
        ['Monday Pairs', '1', 'Ann', 'Lee'],
        ['Thursday Trios', '2', 'Bob', 'Kay'],
        ['Monday Pairs', '3', 'Cy', 'Dee'],
        ['Thursday Trios', '1', 'Ann', 'Lee']
      ]
    }
    const mapping = { ...NO_MAPPING, league: 0, mbdId: 1, firstName: 2, lastName: 3 }
    expect(suggestMapping(table.columns).league).toBe(0)
    expect(columnChoices(table, 0)).toEqual(['Monday Pairs', 'Thursday Trios'])
    expect(columnChoices(table, 1, 2)).toEqual([])
    const monday = readImportRows(table, mapping, { league: 'monday pairs' })
    expect(monday.rows.map((row) => [row.line, row.mbdId, row.league])).toEqual([
      [2, '1', 'Monday Pairs'],
      [4, '3', 'Monday Pairs']
    ])
    expect(monday.invalid).toEqual([])
    expect(readImportRows(table, mapping).rows.map((row) => row.line)).toEqual([2, 3, 4])
  })
})

describe('similarNames', () => {
  test('allows a couple of letters out on one name, swapped names and an initial', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    const ann = { firstName: 'Ann', lastName: 'Lee' }
    expect(similarNames(ann, { firstName: 'Anne', lastName: 'Lee' })).toBe(true)
    expect(similarNames(ann, { firstName: 'Ann', lastName: 'Lea' })).toBe(true)
    expect(similarNames(ann, { firstName: 'Lee', lastName: 'Ann' })).toBe(true)
    expect(similarNames(ann, { firstName: 'A', lastName: 'Lee' })).toBe(true)
    expect(similarNames(ann, { firstName: 'Bob', lastName: 'Lee' })).toBe(false)
    expect(similarNames(ann, { firstName: 'Anne', lastName: 'Li' })).toBe(false)
    // A short name can spare fewer letters: Jo is near Joe but never near Al.
    const jo = { firstName: 'Jo', lastName: 'Smith' }
    expect(similarNames(jo, { firstName: 'Joe', lastName: 'Smith' })).toBe(true)
    expect(similarNames(jo, { firstName: 'Al', lastName: 'Smith' })).toBe(false)
    expect(similarNames(ann, { firstName: 'Amy', lastName: 'Lee' })).toBe(true)
    expect(similarNames({ firstName: '', lastName: '' }, { firstName: '', lastName: '' })).toBe(
      false
    )
  })

  test('counts aliases as spellings of the member', () => {
    const jo = member({ id: 1, firstName: 'Joanne', lastName: 'Smith', aliases: ['Jo Smith'] })
    expect(exactSpelling(jo, { firstName: 'jo', lastName: 'SMITH' })).toBe(true)
    expect(exactSpelling(jo, { firstName: 'Joan', lastName: 'Smith' })).toBe(false)
  })
})

describe('planMbdSync', () => {
  const members = [
    member({ id: 1, firstName: 'Ann', lastName: 'Lee', mbdIds: ['10'] }),
    member({ id: 2, firstName: 'Bob', lastName: 'Kay', mbdIds: ['20'], aliases: ['Robert Kay'] }),
    member({ id: 3, firstName: 'Cyd', lastName: 'Dee', mbdIds: [] }),
    member({ id: 4, firstName: 'Old', lastName: 'Name', mbdIds: ['40'], mergedInto: 1 })
  ]

  test('matches by id first, then by a similar name, and otherwise creates', () => {
    const plan = planMbdSync(
      members,
      rows(
        ['10', 'Ann', 'Lee'],
        ['20', 'Robert', 'Kay'],
        ['20', 'Bobby', 'Kay'],
        ['30', 'Cyd', 'Dee'],
        ['31', 'Cyn', 'Dee'],
        ['50', 'New', 'Person'],
        ['40', 'Ann', 'Lee']
      )
    )
    expect(plan.rows.map(({ match }) => match)).toEqual([
      { kind: 'known', memberId: 1, newSpelling: false },
      { kind: 'known', memberId: 2, newSpelling: false },
      {
        kind: 'similar',
        candidates: [{ ref: { kind: 'member', memberId: 3 }, name: 'Cyd Dee', exact: true }]
      },
      {
        kind: 'similar',
        candidates: [
          { ref: { kind: 'member', memberId: 3 }, name: 'Cyd Dee', exact: false },
          { ref: { kind: 'row', line: 5 }, name: 'Cyd Dee', exact: false }
        ]
      },
      { kind: 'new' },
      { kind: 'known', memberId: 1, newSpelling: false }
    ])
    expect(plan.invalid).toEqual([
      { line: 4, message: 'Repeats MBD ID 20 from line 3 with a different name' }
    ])
  })

  test('finds a candidate through an alias and offers every exact twin without choosing', () => {
    const twins = [
      member({ id: 1, firstName: 'Ann', lastName: 'Lee' }),
      member({ id: 2, firstName: 'Anne', lastName: 'Lee', aliases: ['Ann Lee'] }),
      member({ id: 3, firstName: 'Robert', lastName: 'Kay', aliases: ['Bob Kay'] })
    ]
    const plan = planMbdSync(twins, rows(['10', 'Ann', 'Lee'], ['20', 'Bobby', 'Kay']))
    expect(plan.rows[0].match).toEqual({
      kind: 'similar',
      candidates: [
        { ref: { kind: 'member', memberId: 1 }, name: 'Ann Lee', exact: true },
        { ref: { kind: 'member', memberId: 2 }, name: 'Anne Lee', exact: true }
      ]
    })
    expect(plan.rows[1].match).toEqual({
      kind: 'similar',
      candidates: [{ ref: { kind: 'member', memberId: 3 }, name: 'Robert Kay', exact: false }]
    })
  })

  test('matches an id whatever its leading zeros', () => {
    const plan = planMbdSync(members, rows(['010', 'Ann', 'Lee'], [' 0020 ', 'Bob', 'Kay']))
    expect(plan.rows.map(({ match }) => match.kind)).toEqual(['known', 'known'])
  })

  test('flags a known member whose exported spelling is new, and offers earlier rows as merge targets', () => {
    const plan = planMbdSync(
      members,
      rows(['10', 'Annie', 'Lee'], ['60', 'Dan', 'Roe'], ['61', 'Dann', 'Roe'])
    )
    expect(plan.rows[0].match).toEqual({ kind: 'known', memberId: 1, newSpelling: true })
    expect(plan.rows[1].match).toEqual({ kind: 'new' })
    expect(plan.rows[2].match).toEqual({
      kind: 'similar',
      candidates: [{ ref: { kind: 'row', line: 3 }, name: 'Dan Roe', exact: false }]
    })
  })
})

describe('applyMbdSync', () => {
  const source = membersFile([
    member({ id: 1, firstName: 'Ann', lastName: 'Lee', mbdIds: ['10'] }),
    member({ id: 2, firstName: 'Cy', lastName: 'Dee', deleted: true, mbdIds: ['20'] }),
    member({ id: 3, firstName: 'Dee', lastName: 'Sub' })
  ])

  test('creates, merges, aliases, restores and skips as the decisions say, leaving the source alone', () => {
    const input = rows(
      ['10', 'Annie', 'Lee', 'F'],
      ['20', 'Cy', 'Dee'],
      ['30', 'Dea', 'Sub'],
      ['40', 'New', 'Person', 'm'],
      ['41', 'Neil', 'Person'],
      ['50', 'Ned', 'Person']
    )
    const plan = planMbdSync(source.members, input)
    const decisions: SyncDecision[] = [
      { kind: 'spelling', line: 2, keep: 'export' },
      { kind: 'merge', line: 4, into: { kind: 'member', memberId: 3 } },
      { kind: 'merge', line: 6, into: { kind: 'row', line: 5 } }
    ]
    const { file, summary } = applyMbdSync(source, plan, decisions)

    expect(plan.rows[5].match).toMatchObject({ kind: 'similar' })
    expect(summary).toMatchObject({
      rows: 6,
      created: 1,
      matched: 2,
      merged: 2,
      aliased: 3,
      restored: 1,
      skipped: 1,
      failed: []
    })
    // The log reads back every line in order, in the desk's words.
    expect(
      summary.log.map((entry) => [entry.line, entry.name, entry.action, entry.detail])
    ).toEqual([
      [2, 'Annie Lee', 'renamed', 'Already Ann Lee (1); renamed to Annie Lee'],
      [3, 'Cy Dee', 'restored', 'Already Cy Dee (2); brought back'],
      [4, 'Dea Sub', 'merged', 'Id added to Dee Sub (3)'],
      [5, 'New Person', 'created', 'New member 4'],
      [6, 'Neil Person', 'merged', 'Id added to New Person (4)'],
      [7, 'Ned Person', 'skipped', 'No decision was made']
    ])
    expect(file.nextId).toBe(5)
    expect(file.members).toEqual([
      member({
        id: 1,
        firstName: 'Annie',
        lastName: 'Lee',
        gender: 'female',
        mbdIds: ['10'],
        aliases: ['Ann Lee']
      }),
      member({ id: 2, firstName: 'Cy', lastName: 'Dee', mbdIds: ['20'] }),
      member({ id: 3, firstName: 'Dee', lastName: 'Sub', mbdIds: ['30'], aliases: ['Dea Sub'] }),
      member({
        id: 4,
        firstName: 'New',
        lastName: 'Person',
        gender: 'male',
        mbdIds: ['40', '41'],
        aliases: ['Neil Person']
      })
    ])
    expect(source.members[0].firstName).toBe('Ann')
    expect(source.members[1].deleted).toBe(true)
  })

  test('asks nothing new on a repeat sync once spellings are on file', () => {
    const input = rows(['10', 'Annie', 'Lee'], ['30', 'Dea', 'Sub'])
    const first = applyMbdSync(source, planMbdSync(source.members, input), [
      { kind: 'merge', line: 3, into: { kind: 'member', memberId: 3 } }
    ])
    const again = planMbdSync(first.file.members, input)
    expect(again.rows.map(({ match }) => match)).toEqual([
      { kind: 'known', memberId: 1, newSpelling: false },
      { kind: 'known', memberId: 3, newSpelling: false }
    ])
    const second = applyMbdSync(first.file, again, [])
    expect(second.file).toEqual(first.file)
    expect(second.summary.aliased).toBe(0)
  })

  test('leaves a skipped row out whatever it would otherwise have done', () => {
    const input = rows(['10', 'Annie', 'Lee'], ['70', 'Only', ''], ['80', 'New', 'Person'])
    const plan = planMbdSync(source.members, input)
    const { file, summary } = applyMbdSync(source, plan, [
      { kind: 'skip', line: 2 },
      { kind: 'skip', line: 3 }
    ])
    expect(summary).toMatchObject({ rows: 3, created: 1, matched: 0, skipped: 2 })
    expect(file.members[0]).toEqual(source.members[0])
    expect(file.members.map((entry) => entry.mbdIds)).toEqual([['10'], ['20'], [], ['80']])
    expect(summary.log.map((entry) => entry.action)).toEqual(['skipped', 'skipped', 'created'])
  })

  test('fails a merge into a row that was not created and keeps going', () => {
    const input = rows(['60', 'Dan', 'Roe'], ['61', 'Dann', 'Roe'])
    const plan = planMbdSync([], input)
    const { file, summary } = applyMbdSync(membersFile([]), plan, [
      { kind: 'merge', line: 3, into: { kind: 'row', line: 99 } }
    ])
    expect(file.members.map((entry) => entry.mbdIds)).toEqual([['60']])
    expect(summary.failed).toEqual([
      { line: 3, message: 'The member to merge into was not created' }
    ])
    expect(summary.log[1]).toMatchObject({ line: 3, action: 'failed' })
  })
})

describe('roster import', () => {
  const members = membersFile([
    member({ id: 1, firstName: 'Ann', lastName: 'Lee', mbdIds: ['10'] }),
    member({ id: 2, firstName: 'Bob', lastName: 'Kay', mbdIds: ['20'] }),
    member({ id: 3, firstName: 'Old', lastName: 'Bob', mbdIds: ['21'], mergedInto: 2 }),
    member({ id: 4, firstName: 'Di', lastName: 'Sub', mbdIds: ['40'], deleted: true })
  ])
  const season: SeasonFile = {
    schemaVersion: 1,
    format: 3,
    teams: [{ id: 'team_a', teamNo: 1, name: 'Ants' }],
    players: [{ memberId: 1, teamId: 'team_a' }]
  }

  test('plans adds, skips, unknowns and the teams the season lacks', () => {
    const plan = planRosterImport(
      members.members,
      season,
      rows(
        ['10', 'Ann', 'Lee', '', 'ANTS'],
        ['21', 'Bob', 'Kay', '', 'Bees'],
        ['40', 'Di', 'Sub'],
        ['99', 'New', 'Person', 'f', 'Bees']
      )
    )
    expect(plan.rows.map(({ match }) => match)).toEqual([
      { kind: 'on-roster', memberId: 1 },
      { kind: 'add', memberId: 2 },
      { kind: 'add', memberId: 4 },
      { kind: 'unknown' }
    ])
    expect(plan.newTeams).toEqual(['Bees'])
  })

  test('applies the plan: creates chosen members and missing teams, adds players once', () => {
    const input = rows(
      ['10', 'Ann', 'Lee', '', 'ANTS'],
      ['21', 'Bob', 'Kay', '', 'Bees'],
      ['40', 'Di', 'Sub'],
      ['99', 'New', 'Person', 'f', 'Bees'],
      ['98', 'Left', 'Out']
    )
    const plan = planRosterImport(members.members, season, input)
    let ids = 0
    const result = applyRosterImport(members, season, plan, [5], () => `team_${(ids += 1)}`)

    expect(result.summary).toEqual({
      rows: 5,
      added: 3,
      created: 1,
      restored: 1,
      teamsCreated: 1,
      skipped: 1,
      unknown: 1,
      failed: []
    })
    expect(result.season.teams).toEqual([
      { id: 'team_a', teamNo: 1, name: 'Ants' },
      { id: 'team_1', teamNo: 2, name: 'Bees' }
    ])
    expect(result.season.players).toEqual([
      { memberId: 1, teamId: 'team_a' },
      { memberId: 2, teamId: 'team_1' },
      { memberId: 4, teamId: null },
      { memberId: 5, teamId: 'team_1' }
    ])
    expect(result.membersFile.members[3].deleted).toBeUndefined()
    expect(result.membersFile.members[4]).toEqual(
      member({ id: 5, firstName: 'New', lastName: 'Person', gender: 'female', mbdIds: ['99'] })
    )
    expect(season.players).toHaveLength(1)
    expect(members.members[3].deleted).toBe(true)
  })

  test('never makes teams for a singles season, whatever the export names', () => {
    const singles: SeasonFile = { ...season, format: 1, teams: [] }
    const input = rows(['20', 'Bob', 'Kay', '', 'Bees'], ['99', 'New', 'Person', '', 'Bees'])
    const plan = planRosterImport(members.members, singles, input)
    expect(plan.newTeams).toEqual([])
    const result = applyRosterImport(members, singles, plan, [3], () => 'team_never')
    expect(result.summary.teamsCreated).toBe(0)
    expect(result.season.teams).toEqual([])
    expect(result.season.players).toEqual([
      { memberId: 1, teamId: 'team_a' },
      { memberId: 2, teamId: null },
      { memberId: 5, teamId: null }
    ])
  })
})
