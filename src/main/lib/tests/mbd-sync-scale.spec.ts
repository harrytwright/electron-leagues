import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  normaliseMbdId,
  type ImportMapping,
  type SyncDecision,
  type SyncPlan,
  type SyncRef
} from '../../../shared/imports'
import { membersFileSchema, seasonFileSchema, type Member } from '../../../shared/members'
import {
  addPlayersFromExport,
  planPlayersImport,
  planSync,
  previewImport,
  readImportTable,
  syncMbd
} from '../imports'
import { enableMembers, writeSeasonFile } from '../members'
import {
  mbdExportWorkbook,
  MBD_EXPORT_COLUMNS,
  respeltMbdExport,
  syntheticMbdExport,
  type SyntheticMbdExport
} from './fixtures/mbd-export'

/**
 * One centre's worth of bowlers, invented from a seed: a few hundred people over six
 * leagues with the repeats, placeholders and second ids a real dump carries. The real
 * exports these stand in for hold personal data and are never committed.
 */
const SEED = 2026
const BOWLERS = 600
const LEAGUES = 6

const MBD_MAPPING: ImportMapping = {
  mbdId: 1,
  firstName: 2,
  lastName: 4,
  fullName: null,
  gender: 6,
  team: null,
  league: 0
}

let root: string
let outside: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'leagues-scale-'))
  outside = await mkdtemp(join(tmpdir(), 'leagues-scale-outside-'))
  await enableMembers(root)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

async function writeExport(name: string, source: SyntheticMbdExport): Promise<string> {
  const path = join(outside, name)
  await writeFile(path, mbdExportWorkbook(source))
  return path
}

async function readMaster(): Promise<Member[]> {
  return membersFileSchema.parse(JSON.parse(await readFile(join(root, 'members.json'), 'utf8')))
    .members
}

function holderOf(members: readonly Member[], mbdId: number): Member | undefined {
  const wanted = normaliseMbdId(String(mbdId))
  return members.find((member) => member.mbdIds.some((id) => normaliseMbdId(id) === wanted))
}

/**
 * The decisions a careful desk would make: leave the placeholders out, fold a second
 * id or a respelling into the bowler it belongs to, and create everyone else the
 * planner only thought looked like somebody, since two Dan Smiths are two people.
 */
function decide(
  plan: SyncPlan,
  source: SyntheticMbdExport,
  members: readonly Member[],
  spellings: (line: number) => 'member' | 'export' | null = () => null
): SyncDecision[] {
  const belongsTo = new Map<number, number>()
  for (const { line, of } of [...source.quirks.respelt, ...source.quirks.doubled]) {
    belongsTo.set(line, of)
  }
  const refFor = (line: number): SyncRef => {
    const holder = holderOf(members, source.rows[line - 2].mbdId)
    return holder ? { kind: 'member', memberId: holder.id } : { kind: 'row', line }
  }
  const decisions: SyncDecision[] = []
  for (const { row, match } of plan.rows) {
    if (source.quirks.placeholders.includes(row.line)) {
      decisions.push({ kind: 'skip', line: row.line })
    } else if (match.kind === 'known') {
      const keep = match.newSpelling ? spellings(row.line) : null
      if (keep) decisions.push({ kind: 'spelling', line: row.line, keep })
    } else if (match.kind === 'similar') {
      const of = belongsTo.get(row.line)
      decisions.push(
        of === undefined
          ? { kind: 'create', line: row.line }
          : { kind: 'merge', line: row.line, into: refFor(of) }
      )
    }
  }
  return decisions
}

async function syncFresh(source: SyntheticMbdExport, name: string): Promise<string> {
  const path = await writeExport(name, source)
  const planned = await planSync(root, path, MBD_MAPPING)
  await syncMbd(root, {
    path,
    mapping: MBD_MAPPING,
    decisions: decide(planned.plan, source, []),
    revision: planned.revision,
    sourceRevision: planned.sourceRevision
  })
  return path
}

describe('a synthetic MBD export', { timeout: 30_000 }, () => {
  const source = syntheticMbdExport({ seed: SEED, bowlers: BOWLERS, leagues: LEAGUES })

  test('is the same file for the same seed, and grows without changing what came before', () => {
    expect(syntheticMbdExport({ seed: SEED, bowlers: BOWLERS, leagues: LEAGUES })).toEqual(source)
    const key = (row: SyntheticMbdExport['rows'][number]): string =>
      [row.league, row.mbdId, row.firstName, row.lastName, row.gender].join('|')
    const larger = new Set(
      syntheticMbdExport({ seed: SEED, bowlers: BOWLERS + 25, leagues: LEAGUES }).rows.map(key)
    )
    for (const row of source.rows) expect(larger.has(key(row))).toBe(true)
    expect(source.quirks.placeholders).toHaveLength(LEAGUES)
    expect(source.quirks.respelt.length).toBeGreaterThan(5)
    expect(source.quirks.doubled.length).toBeGreaterThan(1)
    expect(source.quirks.repeated.length).toBeGreaterThan(30)
  })

  test('reads back as the MBD writes it: ids as digits, entry dates as days, blank surnames', async () => {
    const table = await readImportTable(await writeExport('MBDExport.xlsx', source))
    expect(table.columns).toEqual([...MBD_EXPORT_COLUMNS])
    expect(table.rows).toHaveLength(source.rows.length)
    const placeholder = table.rows[source.quirks.placeholders[0] - 2]
    expect(placeholder[4]).toBe('')
    expect(placeholder[2]).toMatch(/^(Team \d+|Vacant)$/)
    table.rows.forEach((cells, index) => {
      const row = source.rows[index]
      expect(cells[1]).toBe(String(row.mbdId))
      expect(cells[5]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(cells[2]).toBe(row.firstName)
      expect(cells[4]).toBe(row.lastName)
    })
  })

  test('syncs into an empty list in one pass, then reads as all known the second time', async () => {
    const path = await writeExport('MBDExport.xlsx', source)
    const preview = await previewImport(root, path, [])
    expect(preview.mapping).toEqual(MBD_MAPPING)
    expect(preview.rowCount).toBe(source.rows.length)

    const planned = await planSync(root, path, MBD_MAPPING)
    const { plan } = planned
    expect(plan.invalid).toEqual([])
    expect(plan.rows).toHaveLength(source.rows.length - source.quirks.repeated.length)
    const byLine = new Map(plan.rows.map((entry) => [entry.row.line, entry.match]))
    const placeholderMatches = source.quirks.placeholders.map((line) => byLine.get(line))
    expect(placeholderMatches.map((match) => match?.kind === 'known')).not.toContain(true)
    const placeholderLookalikes = placeholderMatches.flatMap((match) =>
      match?.kind === 'similar'
        ? match.candidates.map(({ ref }) => (ref.kind === 'row' ? ref.line : 0))
        : []
    )
    expect(source.quirks.placeholders).toEqual(expect.arrayContaining(placeholderLookalikes))
    for (const { line, of } of source.quirks.respelt) {
      expect(byLine.get(line)).toMatchObject({ kind: 'similar' })
      expect(byLine.get(line)).toMatchObject({
        candidates: expect.arrayContaining([
          expect.objectContaining({ ref: { kind: 'row', line: of }, exact: false })
        ])
      })
    }
    for (const { line, of } of source.quirks.doubled) {
      expect(byLine.get(line)).toMatchObject({
        candidates: expect.arrayContaining([
          expect.objectContaining({ ref: { kind: 'row', line: of }, exact: true })
        ])
      })
    }

    const decisions = decide(plan, source, [])
    const summary = await syncMbd(root, {
      path,
      mapping: MBD_MAPPING,
      decisions,
      revision: planned.revision,
      sourceRevision: planned.sourceRevision
    })
    const merged = source.quirks.respelt.length + source.quirks.doubled.length
    expect(summary).toMatchObject({
      rows: plan.rows.length,
      created: BOWLERS,
      matched: 0,
      merged,
      aliased: source.quirks.respelt.length,
      restored: 0,
      skipped: LEAGUES,
      failed: []
    })
    expect(summary.log).toHaveLength(plan.rows.length)
    expect(summary.log.filter((entry) => entry.action === 'skipped')).toHaveLength(LEAGUES)

    const members = await readMaster()
    expect(members).toHaveLength(BOWLERS)
    expect(members.every((member) => member.gender !== undefined)).toBe(true)
    const ids = members.flatMap((member) => member.mbdIds)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(BOWLERS + merged)
    for (const { line, of } of source.quirks.respelt) {
      const holder = holderOf(members, source.rows[of - 2].mbdId)
      expect(holder?.mbdIds).toContain(String(source.rows[line - 2].mbdId))
      expect(holder?.aliases).toHaveLength(1)
    }

    const again = await planSync(root, path, MBD_MAPPING)
    const kinds = again.plan.rows.map(({ row, match }) =>
      source.quirks.placeholders.includes(row.line) ? 'placeholder' : match.kind
    )
    expect(new Set(kinds)).toEqual(new Set(['known', 'placeholder']))
    expect(
      again.plan.rows.filter(({ match }) => match.kind === 'known' && match.newSpelling)
    ).toEqual([])
    const repeat = await syncMbd(root, {
      path,
      mapping: MBD_MAPPING,
      decisions: decide(again.plan, source, members),
      revision: again.revision,
      sourceRevision: again.sourceRevision
    })
    expect(repeat).toMatchObject({
      created: 0,
      matched: plan.rows.length - LEAGUES,
      merged: 0,
      aliased: 0,
      skipped: LEAGUES
    })
    expect(await readMaster()).toEqual(members)
  })

  test('takes a later export in its stride: respelt names and new sign-ups', async () => {
    await syncFresh(source, 'MBDExport.xlsx')
    const before = await readMaster()
    const grown = syntheticMbdExport({ seed: SEED, bowlers: BOWLERS + 25, leagues: LEAGUES })
    const tidied = respeltMbdExport(grown, SEED + 1, 20)
    const path = await writeExport('MBDExport-later.xlsx', tidied.export)

    const planned = await planSync(root, path, MBD_MAPPING)
    const byLine = new Map(planned.plan.rows.map((entry) => [entry.row.line, entry.match]))
    const respeltKnown = tidied.lines.filter(
      (line) => holderOf(before, tidied.export.rows[line - 2].mbdId) !== undefined
    )
    expect(respeltKnown.length).toBeGreaterThan(10)
    for (const line of respeltKnown) {
      expect(byLine.get(line)).toMatchObject({ kind: 'known', newSpelling: true })
    }
    const newSpellings = planned.plan.rows.filter(
      ({ match }) => match.kind === 'known' && match.newSpelling
    )
    expect(newSpellings).toHaveLength(respeltKnown.length)

    const keepExport = new Set(respeltKnown.filter((_, index) => index % 2 === 0))
    const summary = await syncMbd(root, {
      path,
      mapping: MBD_MAPPING,
      decisions: decide(planned.plan, tidied.export, before, (line) =>
        keepExport.has(line) ? 'export' : 'member'
      ),
      revision: planned.revision,
      sourceRevision: planned.sourceRevision
    })
    expect(summary.matched).toBe(
      planned.plan.rows.filter(({ match }) => match.kind === 'known').length
    )
    expect(summary.aliased).toBe(respeltKnown.length)
    expect(summary.log.filter((entry) => entry.action === 'renamed')).toHaveLength(keepExport.size)
    expect(summary.failed).toEqual([])

    const after = await readMaster()
    expect(after).toHaveLength(BOWLERS + 25)
    const outcome = respeltKnown.map((line) => {
      const row = tidied.export.rows[line - 2]
      const holder = holderOf(after, row.mbdId)
      const original = holderOf(before, row.mbdId)
      const wanted = keepExport.has(line) ? row : original
      const otherSpelling = keepExport.has(line) ? original : row
      return {
        line,
        name: holder?.firstName,
        wanted: wanted?.firstName,
        keepsOtherSpelling: holder?.aliases.includes(
          `${otherSpelling?.firstName} ${otherSpelling?.lastName}`
        )
      }
    })
    expect(outcome.map((entry) => entry.wanted)).not.toContain(undefined)
    for (const entry of outcome) {
      expect(entry.name).toBe(entry.wanted)
      expect(entry.keepsOtherSpelling).toBe(true)
    }
  })

  test('fills one league of a season from the dump once the list is synced', async () => {
    const path = await syncFresh(source, 'MBDExport.xlsx')
    const ref = { day: 'monday', leagueFolder: 'Pairs', seasonName: '2026-27' } as const
    const seasonPath = join(root, 'monday/Pairs/2026-27')
    await mkdir(seasonPath, { recursive: true })
    await writeSeasonFile(seasonPath, { schemaVersion: 1, format: 1, teams: [], players: [] })
    const league = 'Monday Pairs'
    const inLeague = source.rows.filter((row) => row.league === league)
    const placeholders = source.quirks.placeholders.filter(
      (line) => source.rows[line - 2].league === league
    )

    const planned = await planPlayersImport(root, ref, path, MBD_MAPPING, league)
    expect(planned.plan.rows).toHaveLength(inLeague.length)
    const kinds = planned.plan.rows.map(({ match }) => match.kind)
    expect(kinds.filter((kind) => kind === 'unknown')).toHaveLength(placeholders.length)
    expect(kinds.filter((kind) => kind === 'add')).toHaveLength(
      inLeague.length - placeholders.length
    )

    const summary = await addPlayersFromExport(root, {
      ref,
      path,
      mapping: MBD_MAPPING,
      league,
      createLines: [],
      membersRevision: planned.membersRevision,
      seasonRevision: planned.seasonRevision,
      sourceRevision: planned.sourceRevision
    })
    expect(summary).toMatchObject({
      added: inLeague.length - placeholders.length,
      created: 0,
      teamsCreated: 0
    })
    const season = seasonFileSchema.parse(
      JSON.parse(await readFile(join(seasonPath, 'meta.json'), 'utf8'))
    )
    expect(season.players).toHaveLength(inLeague.length - placeholders.length)
    expect(new Set(season.players.map((player) => player.memberId)).size).toBe(
      season.players.length
    )
  })
})
