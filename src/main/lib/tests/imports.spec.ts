import AdmZip from 'adm-zip'
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { ImportMapping } from '../../../shared/imports'
import { membersFileSchema, seasonFileSchema, type Member } from '../../../shared/members'
import {
  addPlayersFromExport,
  planPlayersImport,
  planSync,
  previewImport,
  readImportTable,
  rememberMapping,
  syncMbd,
  type MappingMemory
} from '../imports'
import { enableMembers, STALE_MESSAGE, writeSeasonFile } from '../members'

let root: string
let outside: string

/**
 * A workbook shaped like the MBD's own export: numbers with a thousands format,
 * a date-formatted birthdate column and shared strings, including one with an
 * ampersand and one bowler in two leagues.
 */
function mbdWorkbook(): Buffer {
  const strings = [
    'League Name',
    'MBD ID',
    'First Name',
    'Middle Name',
    'Last Name',
    'Birthdate',
    'Gender',
    'Monday Pairs',
    'Sam',
    'Ash &amp; Co',
    'W',
    'Jo Bloggs',
    'B',
    'Thursday Trios'
  ]
  const cell = (ref: string, value: string | number, kind: 's' | 'n' | 'd' = 's'): string =>
    kind === 's'
      ? `<c r="${ref}" t="s"><v>${strings.indexOf(String(value))}</v></c>`
      : `<c r="${ref}" s="${kind === 'd' ? 2 : 1}"><v>${value}</v></c>`
  const header = strings
    .slice(0, 7)
    .map((name, index) => cell(`${String.fromCharCode(65 + index)}1`, name))
    .join('')
  const rows = [
    ['Monday Pairs', 155, 'Sam', 'Ash &amp; Co', 1, 'W'],
    ['Monday Pairs', 262, 'Jo Bloggs', null, 45318, 'B'],
    ['Thursday Trios', 155, 'Sam', 'Ash &amp; Co', 1, 'W']
  ]
    .map(([league, id, first, last, born, gender], index) => {
      const line = index + 2
      return [
        cell(`A${line}`, String(league)),
        cell(`B${line}`, Number(id), 'n'),
        cell(`C${line}`, String(first)),
        // The MBD writes a blank surname as a shared-string cell with no value.
        last === null ? `<c r="E${line}" t="s"/>` : cell(`E${line}`, String(last)),
        cell(`F${line}`, Number(born), 'd'),
        cell(`G${line}`, String(gender))
      ].join('')
    })
    .map((cells, index) => `<row r="${index + 2}">${cells}</row>`)
  const zip = new AdmZip()
  const add = (name: string, xml: string): void => {
    zip.addFile(name, Buffer.from(xml, 'utf8'))
  }
  add(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>'
  )
  add(
    'xl/workbook.xml',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'
  )
  add(
    'xl/_rels/workbook.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
  )
  add(
    'xl/styles.xml',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,###,##0"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/></cellXfs></styleSheet>'
  )
  add(
    'xl/sharedStrings.xml',
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.map((text) => `<si><t>${text}</t></si>`).join('')}</sst>`
  )
  add(
    'xl/worksheets/sheet1.xml',
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${header}</row>${rows.join('')}</sheetData></worksheet>`
  )
  return zip.toBuffer()
}

const MAPPING: ImportMapping = {
  mbdId: 0,
  firstName: 1,
  lastName: 2,
  fullName: null,
  gender: 3,
  team: 4,
  league: null
}

function member(id: number, firstName: string, lastName: string, mbdIds: string[]): Member {
  return { id, firstName, lastName, mbdIds, aliases: [], marketing: true }
}

async function writeMaster(members: Member[]): Promise<void> {
  await writeFile(
    join(root, 'members.json'),
    JSON.stringify({ schemaVersion: 1, nextId: members.length + 1, members })
  )
}

async function readMaster(): Promise<Member[]> {
  return membersFileSchema.parse(JSON.parse(await readFile(join(root, 'members.json'), 'utf8')))
    .members
}

async function exportFile(name: string, text: string | Buffer): Promise<string> {
  const path = join(outside, name)
  await writeFile(path, text)
  return path
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'leagues-imports-'))
  outside = await mkdtemp(join(tmpdir(), 'leagues-imports-outside-'))
  await enableMembers(root)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe('readImportTable', () => {
  test('reads UTF-8 and falls back to Windows text, and refuses other kinds of file', async () => {
    const utf8 = await exportFile('a.csv', 'ID,Name\n1,Zoë\n')
    expect((await readImportTable(utf8)).rows).toEqual([['1', 'Zoë']])
    const windows = await exportFile('b.txt', Buffer.from('ID\tName\n1\tZo\xeb\n', 'latin1'))
    expect((await readImportTable(windows)).rows).toEqual([['1', 'Zoë']])

    await expect(readImportTable(await exportFile('c.docx', 'x'))).rejects.toThrow(
      '.xlsx, .csv, .tsv or .txt'
    )
    await expect(readImportTable(await exportFile('c.xlsx', 'x'))).rejects.toThrow('not a workbook')
    await expect(readImportTable(join(outside, 'missing.csv'))).rejects.toThrow()
    await expect(readImportTable('relative.csv')).rejects.toThrow('Invalid export path')
  })
})

describe('readImportTable on a workbook', () => {
  test('reads the MBD export as it comes: shared strings, formatted numbers and serial dates', async () => {
    const path = join(outside, 'MBDExport.xlsx')
    await writeFile(path, mbdWorkbook())
    const table = await readImportTable(path)
    expect(table.columns).toEqual([
      'League Name',
      'MBD ID',
      'First Name',
      'Middle Name',
      'Last Name',
      'Birthdate',
      'Gender'
    ])
    expect(table.rows).toEqual([
      ['Monday Pairs', '155', 'Sam', '', 'Ash & Co', '1900-01-01', 'W'],
      ['Monday Pairs', '262', 'Jo Bloggs', '', '', '2024-01-27', 'B'],
      ['Thursday Trios', '155', 'Sam', '', 'Ash & Co', '1900-01-01', 'W']
    ])

    const preview = await previewImport(root, path, [])
    expect(preview.mapping).toEqual({
      mbdId: 1,
      firstName: 2,
      lastName: 4,
      fullName: null,
      gender: 6,
      team: null,
      league: 0
    })
    expect(preview.choices[0]).toEqual(['Monday Pairs', 'Thursday Trios'])
    expect(preview.choices[3]).toEqual([])
  })
})

describe('previewImport', () => {
  test('guesses a mapping, then uses the remembered one for the same columns and location', async () => {
    const path = await exportFile('bowlers.csv', 'MBD ID,First,Last,Sex,Team\n1,Ann,Lee,F,Ants\n')
    const guessed = await previewImport(root, path, [])
    expect(guessed).toMatchObject({
      fileName: 'bowlers.csv',
      columns: ['MBD ID', 'First', 'Last', 'Sex', 'Team'],
      sample: [['1', 'Ann', 'Lee', 'F', 'Ants']],
      rowCount: 1,
      mapping: MAPPING,
      remembered: false
    })

    const custom: ImportMapping = { ...MAPPING, gender: null }
    let memories: MappingMemory[] = rememberMapping([], {
      root,
      signature: 'MBD ID|First|Last|Sex|Team',
      mapping: custom
    })
    expect((await previewImport(root, path, memories)).mapping).toEqual(custom)
    expect((await previewImport(root, path, memories)).remembered).toBe(true)
    expect((await previewImport(join(root, 'other'), path, memories)).remembered).toBe(false)

    // A mapping that no longer fits the file's columns is dropped rather than misapplied.
    memories = rememberMapping(memories, {
      root,
      signature: 'MBD ID|First|Last|Sex|Team',
      mapping: { ...custom, team: 9 }
    })
    expect(memories).toHaveLength(1)
    expect((await previewImport(root, path, memories)).remembered).toBe(false)
  })
})

describe('syncMbd', () => {
  test('plans against the list, writes the decisions, and refuses a stale revision', async () => {
    await writeMaster([member(1, 'Ann', 'Lee', ['10']), member(2, 'Cy', 'Dee', [])])
    const path = await exportFile(
      'all.csv',
      'MBD ID,First,Last,Sex,Team\n10,Annie,Lee,F,\n30,Cy,Dee,M,\n40,New,Person,,\n'
    )
    const { plan, revision, sourceRevision } = await planSync(root, path, MAPPING)
    expect(plan.rows.map(({ match }) => match.kind)).toEqual(['known', 'similar', 'new'])

    const summary = await syncMbd(root, {
      path,
      mapping: MAPPING,
      decisions: [{ kind: 'merge', line: 3, into: { kind: 'member', memberId: 2 } }],
      revision,
      sourceRevision
    })
    expect(summary).toMatchObject({ rows: 3, created: 1, matched: 1, merged: 1, aliased: 1 })
    const members = await readMaster()
    expect(members.map((entry) => [entry.id, entry.mbdIds, entry.aliases])).toEqual([
      [1, ['10'], ['Annie Lee']],
      [2, ['30'], []],
      [3, ['40'], []]
    ])
    expect(members[0].gender).toBe('female')

    await expect(
      syncMbd(root, { path, mapping: MAPPING, decisions: [], revision, sourceRevision })
    ).rejects.toThrow(STALE_MESSAGE)
    await expect(planSync(root, path, { ...MAPPING, mbdId: null })).rejects.toThrow('MBD ID')
  })

  test('refuses to apply decisions to an export that changed since it was planned', async () => {
    await writeMaster([member(1, 'Ann', 'Lee', ['10'])])
    const path = await exportFile(
      'all.csv',
      'MBD ID,First,Last,Sex,Team\n20,Dan,Roe,,\n21,Dann,Roe,,\n'
    )
    const planned = await planSync(root, path, MAPPING)
    await writeFile(path, 'MBD ID,First,Last,Sex,Team\n20,Someone,Else,,\n21,Dann,Roe,,\n')
    const later = new Date(Date.now() + 5_000)
    await utimes(path, later, later)

    await expect(
      syncMbd(root, {
        path,
        mapping: MAPPING,
        decisions: [{ kind: 'merge', line: 3, into: { kind: 'row', line: 2 } }],
        revision: planned.revision,
        sourceRevision: planned.sourceRevision
      })
    ).rejects.toThrow('The export changed')
    expect(await readMaster()).toHaveLength(1)
  })
})

describe('addPlayersFromExport', () => {
  const ref = { day: 'monday', leagueFolder: 'Pairs', seasonName: '2025-26' } as const

  test('adds matched bowlers, creates chosen unknowns and teams, and writes both files', async () => {
    await writeMaster([member(1, 'Ann', 'Lee', ['10']), member(2, 'Bob', 'Kay', ['20'])])
    const seasonPath = join(root, 'monday/Pairs/2025-26')
    await mkdir(seasonPath, { recursive: true })
    await writeSeasonFile(seasonPath, {
      schemaVersion: 1,
      format: 2,
      teams: [{ id: 'team_a', teamNo: 1, name: 'Ants' }],
      players: [{ memberId: 1, teamId: 'team_a' }]
    })
    const path = await exportFile(
      'league.csv',
      'MBD ID,First,Last,Sex,Team\n10,Ann,Lee,,Ants\n20,Bob,Kay,,Bees\n99,New,Person,F,Bees\n'
    )

    const planned = await planPlayersImport(root, ref, path, MAPPING, null)
    expect(planned.plan.rows.map(({ match }) => match.kind)).toEqual([
      'on-roster',
      'add',
      'unknown'
    ])
    expect(planned.plan.newTeams).toEqual(['Bees'])

    const summary = await addPlayersFromExport(root, {
      ref,
      path,
      mapping: MAPPING,
      league: null,
      createLines: [4],
      membersRevision: planned.membersRevision,
      seasonRevision: planned.seasonRevision,
      sourceRevision: planned.sourceRevision
    })
    expect(summary).toMatchObject({ added: 2, created: 1, teamsCreated: 1, skipped: 1, unknown: 0 })

    const season = seasonFileSchema.parse(
      JSON.parse(await readFile(join(seasonPath, 'meta.json'), 'utf8'))
    )
    expect(season.teams.map((team) => [team.teamNo, team.name])).toEqual([
      [1, 'Ants'],
      [2, 'Bees']
    ])
    expect(season.players.map((player) => player.memberId)).toEqual([1, 2, 3])
    expect(season.players[1].teamId).toBe(season.teams[1].id)
    expect((await readMaster())[2]).toMatchObject({ id: 3, firstName: 'New', mbdIds: ['99'] })
    expect(await readFile(path, 'utf8')).toContain('New,Person')

    await expect(
      addPlayersFromExport(root, {
        ref,
        path,
        mapping: MAPPING,
        league: null,
        createLines: [],
        membersRevision: planned.membersRevision,
        seasonRevision: planned.seasonRevision,
        sourceRevision: planned.sourceRevision
      })
    ).rejects.toThrow(STALE_MESSAGE)
  })

  test('writes the master list when the only change is bringing a hidden member back', async () => {
    await writeMaster([
      { ...member(1, 'Ann', 'Lee', ['10']), deleted: true },
      member(2, 'Bob', 'Kay', ['20'])
    ])
    const seasonPath = join(root, 'monday/Pairs/2025-26')
    await mkdir(seasonPath, { recursive: true })
    await writeSeasonFile(seasonPath, { schemaVersion: 1, format: 2, teams: [], players: [] })
    const path = await exportFile('league.csv', 'MBD ID,First,Last,Sex,Team\n010,Ann,Lee,,\n')
    const planned = await planPlayersImport(root, ref, path, MAPPING, null)
    expect(planned.plan.rows[0].match).toEqual({ kind: 'add', memberId: 1 })

    const summary = await addPlayersFromExport(root, {
      ref,
      path,
      mapping: MAPPING,
      league: null,
      createLines: [],
      membersRevision: planned.membersRevision,
      seasonRevision: planned.seasonRevision,
      sourceRevision: planned.sourceRevision
    })
    expect(summary).toMatchObject({ added: 1, created: 0, restored: 1 })
    expect((await readMaster())[0].deleted).toBeUndefined()
  })

  test('takes one league out of a dump that covers several', async () => {
    await writeMaster([member(1, 'Sam', 'Ash', ['155'])])
    const seasonPath = join(root, 'monday/Pairs/2025-26')
    await mkdir(seasonPath, { recursive: true })
    await writeSeasonFile(seasonPath, { schemaVersion: 1, format: 2, teams: [], players: [] })
    const path = join(outside, 'MBDExport-leagues.xlsx')
    await writeFile(path, mbdWorkbook())
    const mapping: ImportMapping = {
      mbdId: 1,
      firstName: 2,
      lastName: 4,
      fullName: null,
      gender: 6,
      team: null,
      league: 0
    }

    const planned = await planPlayersImport(root, ref, path, mapping, 'Monday Pairs')
    expect(planned.plan.rows.map(({ row, match }) => [row.line, match.kind])).toEqual([
      [2, 'add'],
      [3, 'unknown']
    ])
    const summary = await addPlayersFromExport(root, {
      ref,
      path,
      mapping,
      league: 'Monday Pairs',
      createLines: [3],
      membersRevision: planned.membersRevision,
      seasonRevision: planned.seasonRevision,
      sourceRevision: planned.sourceRevision
    })
    expect(summary).toMatchObject({ rows: 2, added: 2, created: 1 })
    const created = (await readMaster())[1]
    expect(created).toMatchObject({
      firstName: 'Jo',
      lastName: 'Bloggs',
      gender: 'male',
      mbdIds: ['262']
    })
    expect(created.dob).toBeUndefined()
  })

  test('refuses an archived season and one without a roster file', async () => {
    await mkdir(join(root, '_archives/Pairs/2024-25'), { recursive: true })
    await mkdir(join(root, 'monday/Pairs/2025-26'), { recursive: true })
    const path = await exportFile('league.csv', 'MBD ID,First,Last,Sex,Team\n10,Ann,Lee,,\n')
    await expect(
      planPlayersImport(root, { ...ref, seasonName: '2024-25' }, path, MAPPING, null)
    ).rejects.toThrow()
    await expect(planPlayersImport(root, ref, path, MAPPING, null)).rejects.toThrow(
      'no roster file'
    )
  })
})
