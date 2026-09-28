import AdmZip from 'adm-zip'

/**
 * A synthetic bowler export shaped like the MBD's own: the same seven columns,
 * numeric ids with a thousands format, a date-formatted entry date the app never
 * reads, shared strings, and the quirks a real dump carries. Real exports hold
 * personal data and stay out of the repository; this stands in for them in tests.
 */
export const MBD_EXPORT_COLUMNS = [
  'League Name',
  'MBD ID',
  'First Name',
  'Middle Name',
  'Last Name',
  'Birthdate',
  'Gender'
] as const

export type WorkbookCell =
  | { kind: 'text'; text: string }
  | { kind: 'number'; value: number }
  | { kind: 'date'; serial: number }
  | { kind: 'omitted' }

export const text = (value: string): WorkbookCell => ({ kind: 'text', text: value })
export const number = (value: number): WorkbookCell => ({ kind: 'number', value })
export const date = (serial: number): WorkbookCell => ({ kind: 'date', serial })
/** A cell the MBD leaves out of a row entirely, with no `<c>` element written for it. */
export const omitted = (): WorkbookCell => ({ kind: 'omitted' })

const FIRST_NAMES_MEN = [
  'Adam',
  'Alan',
  'Alfie',
  'Andrew',
  'Arthur',
  'Ben',
  'Callum',
  'Charlie',
  'Chris',
  'Colin',
  'Craig',
  'Dan',
  'Dave',
  'Dean',
  'Dennis',
  'Derek',
  'Eddie',
  'Ethan',
  'Frank',
  'Gary',
  'George',
  'Glen',
  'Graham',
  'Harry',
  'Ian',
  'Jack',
  'Jake',
  'James',
  'Jason',
  'Jim',
  'Joe',
  'John',
  'Jon',
  'Keith',
  'Ken',
  'Kevin',
  'Lee',
  'Leon',
  'Liam',
  'Luke',
  'Mark',
  'Martin',
  'Matt',
  'Mike',
  'Neil',
  'Nick',
  'Oliver',
  'Oscar',
  'Paul',
  'Pete',
  'Phil',
  'Ray',
  'Rob',
  'Roy',
  'Ryan',
  'Sam',
  'Sean',
  'Simon',
  'Steve',
  'Stuart',
  'Terry',
  'Tom',
  'Tony',
  'Trevor',
  'Wayne',
  'Will'
]

const FIRST_NAMES_WOMEN = [
  'Abbie',
  'Alice',
  'Amy',
  'Ann',
  'Anna',
  'Becky',
  'Beth',
  'Carol',
  'Chloe',
  'Claire',
  'Dawn',
  'Debbie',
  'Diane',
  'Ellie',
  'Emma',
  'Erin',
  'Fiona',
  'Gemma',
  'Grace',
  'Hannah',
  'Heather',
  'Helen',
  'Holly',
  'Jackie',
  'Jane',
  'Janet',
  'Jess',
  'Jo',
  'Joan',
  'Julie',
  'Karen',
  'Kate',
  'Kim',
  'Laura',
  'Linda',
  'Lisa',
  'Lucy',
  'Maggie',
  'Mary',
  'Megan',
  'Nicola',
  'Pam',
  'Pat',
  'Paula',
  'Rachel',
  'Ruth',
  'Sally',
  'Sarah',
  'Sharon',
  'Sophie',
  'Sue',
  'Tina',
  'Tracey',
  'Val',
  'Wendy',
  'Zoe'
]

const SURNAMES = [
  'Adams',
  'Allen',
  'Bailey',
  'Baker',
  'Barnes',
  'Bell',
  'Bennett',
  'Brown',
  'Butler',
  'Carter',
  'Chapman',
  'Clarke',
  'Collins',
  'Cook',
  'Cooper',
  'Cox',
  'Davies',
  'Dixon',
  'Edwards',
  'Ellis',
  'Evans',
  'Fisher',
  'Foster',
  'Fox',
  'Gibson',
  'Graham',
  'Grant',
  'Gray',
  'Green',
  'Hall',
  'Harris',
  'Harrison',
  'Hill',
  'Holmes',
  'Hughes',
  'Hunt',
  'Jackson',
  'James',
  'Jenkins',
  'Johnson',
  'Jones',
  'Kelly',
  'Kennedy',
  'King',
  'Knight',
  'Lawrence',
  'Lee',
  'Lewis',
  'Lloyd',
  'Marshall',
  'Martin',
  'Mason',
  'Matthews',
  'Miller',
  'Mills',
  'Mitchell',
  'Moore',
  'Morgan',
  'Morris',
  'Murphy',
  'Murray',
  'Owen',
  "O'Brien",
  'Palmer',
  'Parker',
  'Pearson',
  'Phillips',
  'Powell',
  'Price',
  'Reid',
  'Reynolds',
  'Richards',
  'Roberts',
  'Robinson',
  'Rogers',
  'Rose',
  'Russell',
  'Scott',
  'Shaw',
  'Simpson',
  'Smith',
  'Stevens',
  'Stone',
  'Taylor',
  'Thomas',
  'Thompson',
  'Turner',
  'Walker',
  'Ward',
  'Watson',
  'Webb',
  'West',
  'White',
  'Wilkinson',
  'Williams',
  'Wilson',
  'Wood',
  'Wright',
  'Young'
]

const LEAGUE_NAMES = [
  'Monday Pairs',
  'Tuesday Trios',
  'Wednesday Mixed',
  'Thursday Fours',
  'Friday Fives',
  'Saturday Juniors',
  'Sunday Singles',
  'Monday Seniors',
  'Tuesday Ladies',
  'Wednesday Scratch',
  'Thursday Handicap',
  'Friday Night Owls'
]

/** What the MBD writes in its Gender column: men, women, boys and girls. */
export type MbdGender = 'M' | 'W' | 'B' | 'G'

export interface MbdExportRow {
  league: string
  mbdId: number
  firstName: string
  lastName: string
  /** The MBD fills this with the day the bowler was entered, as an Excel serial. */
  entered: number
  gender: MbdGender
}

/** Where a quirk landed in the finished export, by line number counting the header as 1. */
export interface MbdExportQuirks {
  /** The MBD's stand-ins for a missing bowler: a first name such as "Team 3" and no surname. */
  placeholders: number[]
  /**
   * A bowler listed again under a second id with a near spelling. `of` is the row the
   * planner sees first, so a merge of `line` into it is what the desk would choose;
   * that can be the odd spelling when its league sorts earlier.
   */
  respelt: { line: number; of: number }[]
  /** A bowler listed again under a second id with the same name, oriented as `respelt` is. */
  doubled: { line: number; of: number }[]
  /** Second and later appearances of one bowler in another league: same id, same name. */
  repeated: number[]
}

export interface SyntheticMbdExport {
  columns: readonly string[]
  rows: MbdExportRow[]
  /** Distinct bowlers behind the rows, placeholders included, doubles and respellings excluded. */
  bowlers: number
  quirks: MbdExportQuirks
}

export interface SyntheticMbdExportOptions {
  seed: number
  /** How many distinct bowlers to invent. */
  bowlers: number
  /** How many leagues to spread them over, capped by the names on hand. */
  leagues?: number
}

/** A small deterministic generator, so a seed always yields the same export. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(random: () => number, pool: readonly T[]): T {
  return pool[Math.floor(random() * pool.length)]
}

function pickOther(
  random: () => number,
  pool: readonly string[],
  taken: readonly string[]
): string | null {
  const others = pool.filter((name) => !taken.includes(name))
  return others.length === 0 ? null : pick(random, others)
}

/** A spelling the matcher still reads as the same person: an initial, or a letter or two out. */
function respell(random: () => number, firstName: string): string {
  const choice = random()
  if (choice < 0.34) return firstName[0]
  if (firstName.length < 4) return `${firstName}s`
  if (choice < 0.67) return `${firstName}${firstName.endsWith('e') ? 'y' : 'ie'}`
  return firstName.slice(0, -1)
}

const ENTERED_FROM = 44_927
const ENTERED_SPAN = 1_100
const RATE_TWO_LEAGUES = 0.15
const RATE_RESPELT = 0.03
const RATE_DOUBLED = 0.01
const RATE_JUNIOR = 0.12
const RATE_WOMEN = 0.42

interface Person {
  mbdId: number
  firstName: string
  lastName: string
  gender: MbdGender
  entered: number
  leagues: string[]
}

interface Placed {
  row: MbdExportRow
  kind: 'bowler' | 'placeholder' | 'respelt' | 'doubled' | 'repeated'
  of?: Person
}

/**
 * Invent an export. The first bowlers of a seed are the same whatever the count, so a
 * larger count of the same seed reads as the same centre after a few more sign-ups.
 */
export function syntheticMbdExport(options: SyntheticMbdExportOptions): SyntheticMbdExport {
  const random = seededRandom(options.seed)
  const leagueCount = Math.max(1, Math.min(options.leagues ?? 6, LEAGUE_NAMES.length))
  const leagues = LEAGUE_NAMES.slice(0, leagueCount)
  const juniors = leagues.find((name) => name.includes('Juniors')) ?? null
  const adultLeagues = leagues.filter((name) => name !== juniors)
  let nextId = 1000 + Math.floor(random() * 9000)
  const takeId = (): number => {
    nextId += 1 + Math.floor(random() * 4)
    return nextId
  }
  const placed: Placed[] = []

  leagues.forEach((league, index) => {
    placed.push({
      kind: 'placeholder',
      row: {
        league,
        mbdId: takeId(),
        firstName: index % 2 === 0 ? `Team ${index + 1}` : 'Vacant',
        lastName: '',
        entered: ENTERED_FROM,
        gender: 'M'
      }
    })
  })

  for (let count = 0; count < options.bowlers; count += 1) {
    const junior = juniors !== null && random() < RATE_JUNIOR
    const woman = random() < RATE_WOMEN
    const person: Person = {
      mbdId: takeId(),
      firstName: pick(random, woman ? FIRST_NAMES_WOMEN : FIRST_NAMES_MEN),
      lastName: pick(random, SURNAMES),
      gender: junior ? (woman ? 'G' : 'B') : woman ? 'W' : 'M',
      entered: ENTERED_FROM + Math.floor(random() * ENTERED_SPAN),
      leagues: []
    }
    const home = junior && juniors ? juniors : pick(random, adultLeagues)
    person.leagues.push(home)
    if (!junior && adultLeagues.length > 1 && random() < RATE_TWO_LEAGUES) {
      const others = adultLeagues.filter((name) => name !== home)
      person.leagues.push(pick(random, others))
    }
    const rowFor = (league: string, mbdId: number, firstName: string): MbdExportRow => ({
      league,
      mbdId,
      firstName,
      lastName: person.lastName,
      entered: person.entered,
      gender: person.gender
    })
    person.leagues.forEach((league, index) => {
      placed.push({
        kind: index === 0 ? 'bowler' : 'repeated',
        of: person,
        row: rowFor(league, person.mbdId, person.firstName)
      })
    })
    const quirk = random()
    if (quirk < RATE_DOUBLED) {
      const league = pickOther(random, adultLeagues, person.leagues)
      if (league !== null) {
        placed.push({
          kind: 'doubled',
          of: person,
          row: rowFor(league, takeId(), person.firstName)
        })
      }
    } else if (quirk < RATE_DOUBLED + RATE_RESPELT) {
      const league = pickOther(random, adultLeagues, person.leagues)
      if (league !== null) {
        placed.push({
          kind: 'respelt',
          of: person,
          row: rowFor(league, takeId(), respell(random, person.firstName))
        })
      }
    }
  }

  const order = new Map(leagues.map((name, index) => [name, index]))
  placed.sort((a, b) => {
    const byLeague = (order.get(a.row.league) ?? 0) - (order.get(b.row.league) ?? 0)
    if (byLeague !== 0) return byLeague
    return (
      a.row.lastName.localeCompare(b.row.lastName, 'en') ||
      a.row.firstName.localeCompare(b.row.firstName, 'en') ||
      a.row.mbdId - b.row.mbdId
    )
  })

  const firstLine = new Map<Person, number>()
  const quirks: MbdExportQuirks = { placeholders: [], respelt: [], doubled: [], repeated: [] }
  placed.forEach((entry, index) => {
    const line = index + 2
    if ((entry.kind === 'bowler' || entry.kind === 'repeated') && entry.of) {
      if (firstLine.has(entry.of)) quirks.repeated.push(line)
      else firstLine.set(entry.of, line)
    }
  })
  placed.forEach((entry, index) => {
    const line = index + 2
    const own = entry.of ? (firstLine.get(entry.of) ?? line) : line
    const pair = own < line ? { line, of: own } : { line: own, of: line }
    if (entry.kind === 'placeholder') quirks.placeholders.push(line)
    else if (entry.kind === 'respelt') quirks.respelt.push(pair)
    else if (entry.kind === 'doubled') quirks.doubled.push(pair)
  })

  return {
    columns: MBD_EXPORT_COLUMNS,
    rows: placed.map((entry) => entry.row),
    bowlers: options.bowlers + leagues.length,
    quirks
  }
}

/** A tidied export alongside the lines it changed. */
export interface RespeltMbdExport {
  export: SyntheticMbdExport
  /** The first row of each bowler whose name changed. */
  lines: number[]
}

/**
 * The same export after the MBD has been tidied: `count` bowlers spelt a little
 * differently under the same id, chosen by the seed, in every league that lists them.
 * Placeholders and quirk rows are left alone so their line numbers still mean what
 * the original's do.
 */
export function respeltMbdExport(
  source: SyntheticMbdExport,
  seed: number,
  count: number
): RespeltMbdExport {
  const random = seededRandom(seed)
  const special = new Set([
    ...source.quirks.placeholders,
    ...source.quirks.repeated,
    ...source.quirks.respelt.flatMap(({ line, of }) => [line, of]),
    ...source.quirks.doubled.flatMap(({ line, of }) => [line, of])
  ])
  const candidates = source.rows.map((_, index) => index + 2).filter((line) => !special.has(line))
  const lines: number[] = []
  while (lines.length < Math.min(count, candidates.length)) {
    const line = pick(random, candidates)
    if (!lines.includes(line)) lines.push(line)
  }
  lines.sort((a, b) => a - b)
  const spelling = new Map<number, string>()
  for (const line of lines) {
    const row = source.rows[line - 2]
    spelling.set(row.mbdId, respell(random, row.firstName))
  }
  const rows = source.rows.map((row) => {
    const firstName = spelling.get(row.mbdId)
    return firstName === undefined ? row : { ...row, firstName }
  })
  return { export: { ...source, rows }, lines }
}

export function mbdExportCells(rows: readonly MbdExportRow[]): WorkbookCell[][] {
  return rows.map((row) => [
    text(row.league),
    number(row.mbdId),
    text(row.firstName),
    text(''),
    text(row.lastName),
    date(row.entered),
    text(row.gender)
  ])
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function columnName(index: number): string {
  let name = ''
  let remaining = index + 1
  while (remaining > 0) {
    const digit = (remaining - 1) % 26
    name = String.fromCharCode(65 + digit) + name
    remaining = Math.floor((remaining - 1) / 26)
  }
  return name
}

/**
 * A one-sheet workbook as the MBD writes one: every text in shared strings, a blank
 * text cell for an empty string, numbers under a thousands format and serial dates
 * under a day format, so the reader's date and number handling is exercised too.
 */
export function workbookFrom(columns: readonly string[], rows: readonly WorkbookCell[][]): Buffer {
  const strings: string[] = []
  const indexOf = new Map<string, number>()
  const shared = (text: string): number => {
    const known = indexOf.get(text)
    if (known !== undefined) return known
    strings.push(text)
    indexOf.set(text, strings.length - 1)
    return strings.length - 1
  }
  const cell = (reference: string, value: WorkbookCell): string => {
    switch (value.kind) {
      case 'text':
        return value.text === ''
          ? `<c r="${reference}" t="s"/>`
          : `<c r="${reference}" t="s"><v>${shared(value.text)}</v></c>`
      case 'number':
        return `<c r="${reference}" s="1"><v>${value.value}</v></c>`
      case 'date':
        return `<c r="${reference}" s="2"><v>${value.serial}</v></c>`
      case 'omitted':
        return ''
    }
  }
  const line = (values: readonly WorkbookCell[], row: number): string =>
    `<row r="${row}">${values.map((value, index) => cell(`${columnName(index)}${row}`, value)).join('')}</row>`
  const sheetRows = [
    line(columns.map(text), 1),
    ...rows.map((values, index) => line(values, index + 2))
  ]

  const zip = new AdmZip()
  const add = (name: string, xml: string): void => {
    zip.addFile(name, Buffer.from(xml, 'utf8'))
  }
  add(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>'
  )
  add(
    '_rels/.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
  )
  add(
    'xl/workbook.xml',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Bowlers" sheetId="1" r:id="rId1"/></sheets></workbook>'
  )
  add(
    'xl/_rels/workbook.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'
  )
  add(
    'xl/styles.xml',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,###,##0"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/></cellXfs></styleSheet>'
  )
  add(
    'xl/sharedStrings.xml',
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((text) => `<si><t>${escapeXml(text)}</t></si>`).join('')}</sst>`
  )
  add(
    'xl/worksheets/sheet1.xml',
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows.join('')}</sheetData></worksheet>`
  )
  return zip.toBuffer()
}

/** The finished file: a synthetic export as the MBD would save it. */
export function mbdExportWorkbook(source: SyntheticMbdExport): Buffer {
  return workbookFrom(source.columns, mbdExportCells(source.rows))
}
