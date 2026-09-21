import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  utimes,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { Member, SeasonFile } from '../../../shared/members'
import { enableMembers, saveMember, saveSeason, writeSeasonFile } from '../members'
import {
  generateSignInSheet,
  refreshSignInSheet,
  renderSignInSheetHtml,
  signInSheetPath,
  signInSheetState,
  type PdfRenderer
} from '../sign-in-sheet'

let root: string
let outside: string

function member(id: number, firstName: string, lastName: string): Member {
  return { id, firstName, lastName, mbdIds: [], aliases: [], marketing: true }
}

const roster: SeasonFile = {
  schemaVersion: 1,
  format: 3,
  teams: [
    { id: 'team_b', teamNo: 2, name: 'Bees & Co' },
    { id: 'team_a', teamNo: 1, name: 'Ants' }
  ],
  players: [
    { memberId: 2, teamId: 'team_a', position: 2 },
    { memberId: 1, teamId: 'team_a', position: 1 },
    { memberId: 3, teamId: 'team_b' },
    { memberId: 4, teamId: null },
    { memberId: 9, teamId: 'team_gone' }
  ]
}

const members = [
  member(1, 'Ann', 'Lee'),
  member(2, 'Bob', 'Kay'),
  member(3, 'Cy', 'Dee'),
  member(4, 'Di', 'Sub'),
  { ...member(5, 'Merged', 'Away'), mergedInto: 3 }
]

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'leagues-sheet-'))
  outside = await mkdtemp(join(tmpdir(), 'leagues-sheet-outside-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe('renderSignInSheetHtml', () => {
  test('lays out teams in lane-draw order with blank rows, then subs, with an escaped header', () => {
    const html = renderSignInSheetHtml({
      leagueName: 'Mixed <Triples>',
      season: '2025-26',
      file: roster,
      members
    })
    const captions = [...html.matchAll(/<caption>(.*?)<\/caption>/g)].map((match) => match[1])
    expect(captions).toEqual(['1. Ants', '2. Bees &amp; Co', 'Subs'])
    const names = [...html.matchAll(/<tr><td>(.*?)<\/td><td><\/td><td><\/td><\/tr>/g)].map(
      (match) => match[1]
    )
    // Ants by position, two blank rows; Bees, two blanks; subs include the orphaned team, four blanks.
    expect(names).toEqual([
      'Ann Lee',
      'Bob Kay',
      '',
      '',
      'Cy Dee',
      '',
      '',
      'Di Sub',
      'Member 9',
      '',
      '',
      '',
      ''
    ])
    expect(html).toContain('<h1>Mixed &lt;Triples&gt;</h1>')
    expect(html).toContain('2025-26 · Trios')
    expect(html).toContain('Week <span class="blank"></span>')
    expect(html).toContain('<th>Player</th><th class="tick">Cash</th><th class="tick">Card</th>')
  })

  test('lists a singles season as one block by surname, ignoring any teams left in the file', () => {
    const html = renderSignInSheetHtml({
      leagueName: 'Scratch Singles',
      season: '2025-26',
      file: { ...roster, format: 1 },
      members
    })
    const captions = [...html.matchAll(/<caption>(.*?)<\/caption>/g)].map((match) => match[1])
    expect(captions).toEqual(['Players'])
    const names = [...html.matchAll(/<tr><td>(.*?)<\/td><td><\/td><td><\/td><\/tr>/g)].map(
      (match) => match[1]
    )
    expect(names).toEqual([
      'Cy Dee',
      'Bob Kay',
      'Ann Lee',
      'Di Sub',
      'Member 9',
      '',
      '',
      '',
      '',
      '',
      ''
    ])
    expect(html).toContain('2025-26 · Singles')
  })
})

const fakePdf: PdfRenderer = async () => Buffer.from('%PDF-fake')

async function touch(path: string, offsetMs: number): Promise<void> {
  const when = new Date(Date.now() + offsetMs)
  await utimes(path, when, when)
}

async function revisionOf(path: string): Promise<string> {
  const info = await stat(path)
  return `${info.mtimeMs}:${info.size}`
}

describe('signInSheetState', () => {
  test('is missing, fresh once made, then stale when the roster changes or a player is renamed', async () => {
    await enableMembers(root)
    await writeFile(
      join(root, 'members.json'),
      JSON.stringify({ schemaVersion: 1, nextId: 6, members })
    )
    const seasonPath = join(root, 'monday/Pairs/2025-26')
    await mkdir(seasonPath, { recursive: true })
    await writeSeasonFile(seasonPath, roster)
    expect(await signInSheetState(seasonPath)).toBe('missing')

    const generate = (): Promise<string> =>
      generateSignInSheet({
        root,
        seasonPath,
        leagueName: 'P',
        season: '2025-26',
        renderPdf: fakePdf
      })
    await generate()
    expect(await signInSheetState(seasonPath)).toBe('fresh')

    // The stamp comes from the roster's own clock, so a roster from a slow machine still counts.
    await touch(join(seasonPath, 'meta.json'), -120_000)
    expect(await signInSheetState(seasonPath)).toBe('stale')
    await generate()
    expect(await signInSheetState(seasonPath)).toBe('fresh')

    // A renamed player changes what the sheet says, so their rosters are marked for regeneration.
    await saveMember(
      root,
      { ...members[0], lastName: 'Li' },
      await revisionOf(join(root, 'members.json'))
    )
    expect(await signInSheetState(seasonPath)).toBe('stale')
  })

  test('treats a symlink or a folder at the sheet path as missing, so it is regenerated', async () => {
    const seasonPath = join(root, 'monday/Pairs/2025-26')
    await mkdir(seasonPath, { recursive: true })
    await writeSeasonFile(seasonPath, roster)
    await writeFile(join(outside, 'private.pdf'), 'private')
    await symlink(join(outside, 'private.pdf'), signInSheetPath(seasonPath))
    expect(await signInSheetState(seasonPath)).toBe('missing')

    await rm(signInSheetPath(seasonPath))
    await mkdir(signInSheetPath(seasonPath))
    expect(await signInSheetState(seasonPath)).toBe('missing')
  })
})

describe('generateSignInSheet', () => {
  test('writes the rendered bytes into the season root using the master list names', async () => {
    await enableMembers(root)
    await writeFile(
      join(root, 'members.json'),
      JSON.stringify({ schemaVersion: 1, nextId: 6, members })
    )
    const seasonPath = join(root, 'monday/Pairs/2025-26')
    await mkdir(seasonPath, { recursive: true })
    await writeSeasonFile(seasonPath, roster)
    const rendered: string[] = []

    const path = await generateSignInSheet({
      root,
      seasonPath,
      leagueName: 'Monday Pairs',
      season: '2025-26',
      renderPdf: async (html) => {
        rendered.push(html)
        return Buffer.from('%PDF-fake')
      }
    })

    expect(path).toBe(signInSheetPath(seasonPath))
    expect(await readFile(path, 'utf8')).toBe('%PDF-fake')
    expect(rendered[0]).toContain('Ann Lee')
    expect(rendered[0]).toContain('<h1>Monday Pairs</h1>')
    // The sheet carries the roster's stamp and leaves no partial file behind.
    const rosterInfo = await stat(join(seasonPath, 'meta.json'))
    expect(Math.round((await stat(path)).mtimeMs)).toBe(Math.floor(rosterInfo.mtimeMs))
    // Windows lists names case-insensitively, so the order is not part of the check.
    expect((await readdir(seasonPath)).sort()).toEqual(['Sign-In Sheet.pdf', 'meta.json'])
  })

  test('refuses a season without a roster and a symlinked output', async () => {
    const seasonPath = join(root, 'monday/Pairs/2025-26')
    await mkdir(seasonPath, { recursive: true })
    await expect(
      generateSignInSheet({
        root,
        seasonPath,
        leagueName: 'P',
        season: '2025-26',
        renderPdf: fakePdf
      })
    ).rejects.toThrow('This season has no roster')

    await writeSeasonFile(seasonPath, roster)
    await writeFile(join(outside, 'private.pdf'), 'private')
    await symlink(join(outside, 'private.pdf'), signInSheetPath(seasonPath))
    await expect(
      generateSignInSheet({
        root,
        seasonPath,
        leagueName: 'P',
        season: '2025-26',
        renderPdf: fakePdf
      })
    ).rejects.toThrow('symbolic link')
    expect(await readFile(join(outside, 'private.pdf'), 'utf8')).toBe('private')
  })

  test('leaves the old sheet in place when the write fails part way', async () => {
    const seasonPath = join(root, 'monday/Pairs/2025-26')
    await mkdir(seasonPath, { recursive: true })
    await writeSeasonFile(seasonPath, roster)
    await writeFile(signInSheetPath(seasonPath), 'old sheet')
    await mkdir(`${signInSheetPath(seasonPath)}.partial`)

    await expect(
      generateSignInSheet({
        root,
        seasonPath,
        leagueName: 'P',
        season: '2025-26',
        renderPdf: fakePdf
      })
    ).rejects.toThrow()
    expect(await readFile(signInSheetPath(seasonPath), 'utf8')).toBe('old sheet')
  })
})

describe('refreshSignInSheet', () => {
  const ref = { day: 'monday', leagueFolder: 'Pairs', seasonName: '2025-26' } as const

  test('heads the sheet with the league display name and follows the roster after a save', async () => {
    await enableMembers(root)
    await writeFile(
      join(root, 'members.json'),
      JSON.stringify({ schemaVersion: 1, nextId: 6, members })
    )
    const leaguePath = join(root, 'monday/Pairs')
    const seasonPath = join(leaguePath, '2025-26')
    await mkdir(seasonPath, { recursive: true })
    await writeFile(join(leaguePath, 'meta.json'), JSON.stringify({ name: 'Monday Pairs' }))
    await writeSeasonFile(seasonPath, roster)
    const rendered: string[] = []
    const renderPdf: PdfRenderer = async (html) => {
      rendered.push(html)
      return Buffer.from(`%PDF-${rendered.length}`)
    }

    expect(await refreshSignInSheet(root, ref, renderPdf)).toBe(signInSheetPath(seasonPath))
    expect(rendered[0]).toContain('<h1>Monday Pairs</h1>')

    const revision = await revisionOf(join(seasonPath, 'meta.json'))
    await saveSeason(
      root,
      ref,
      {
        ...roster,
        teams: [...roster.teams, { id: 'team_c', teamNo: 3, name: 'Cats' }],
        players: roster.players.filter((player) => player.teamId !== 'team_gone')
      },
      revision
    )
    expect(await signInSheetState(seasonPath)).toBe('stale')
    await refreshSignInSheet(root, ref, renderPdf)
    expect(rendered[1]).toContain('3. Cats')
    expect(await readFile(signInSheetPath(seasonPath), 'utf8')).toBe('%PDF-2')
    expect(await signInSheetState(seasonPath)).toBe('fresh')
  })

  test('never generates into the archive', async () => {
    const archived = join(root, '_archives/Pairs/2024-25')
    await mkdir(archived, { recursive: true })
    await writeSeasonFile(archived, roster)
    let renders = 0
    const renderPdf: PdfRenderer = async () => {
      renders += 1
      return Buffer.from('pdf')
    }

    await expect(
      refreshSignInSheet(root, { ...ref, seasonName: '2024-25' }, renderPdf)
    ).rejects.toThrow()
    expect(renders).toBe(0)
    expect(await readdir(archived)).toEqual(['meta.json'])
  })
})
