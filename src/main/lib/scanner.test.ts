import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { scanLeaguesRoot } from './scanner'

let root: string

async function makeTree(paths: Record<string, string | null>): Promise<void> {
  for (const [rel, content] of Object.entries(paths)) {
    const abs = join(root, rel)
    if (content === null) {
      await mkdir(abs, { recursive: true })
    } else {
      await mkdir(join(abs, '..'), { recursive: true })
      await writeFile(abs, content)
    }
  }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'leagues-scan-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('scanLeaguesRoot', () => {
  test('finds leagues under weekday folders with sorted, statused seasons', async () => {
    await makeTree({
      'monday/Mens Triples/2025-26/Rules.docx': 'x',
      'monday/Mens Triples/2025-26/Sign-In Sheet.docx': 'x',
      'monday/Mens Triples/2024-25/Rules.docx': 'x'
    })
    const tree = await scanLeaguesRoot(root)
    const league = tree.days.monday[0]
    expect(league.folderName).toBe('Mens Triples')
    expect(league.running).toBe(true)
    expect(league.seasons.map((s) => [s.name, s.status])).toEqual([
      ['2024-25', 'previous'],
      ['2025-26', 'active']
    ])
    expect(league.seasons[1].files.map((f) => f.name).sort()).toEqual([
      'Rules.docx',
      'Sign-In Sheet.docx'
    ])
  })

  test('skips underscore folders as leagues but lists shared and template files', async () => {
    await makeTree({
      '_shared/Opening Times.docx': 'x',
      '_templates/Rules.docx': 'x',
      '_archives/.keep': ''
    })
    const tree = await scanLeaguesRoot(root)
    expect(Object.values(tree.days).flat()).toEqual([])
    expect(tree.sharedFiles.map((f) => f.name)).toEqual(['Opening Times.docx'])
    expect(tree.templateFiles.map((f) => f.name)).toEqual(['Rules.docx'])
  })

  test('lists non-weekday, non-underscore root entries as unrecognised', async () => {
    await makeTree({ 'Random Stuff/notes.txt': 'x', 'loose-file.txt': 'x' })
    const tree = await scanLeaguesRoot(root)
    expect(tree.unrecognisedRootEntries.map((e) => e.name).sort()).toEqual([
      'Random Stuff',
      'loose-file.txt'
    ])
  })

  test('a league with no season folders is not running but still browsable', async () => {
    await makeTree({ 'tuesday/New League/Ideas.docx': 'x' })
    const league = (await scanLeaguesRoot(root)).days.tuesday[0]
    expect(league.running).toBe(false)
    expect(league.seasons).toEqual([])
    expect(league.otherEntries.map((e) => e.name)).toEqual(['Ideas.docx'])
  })

  test('non-season folders inside a league are listed as other entries', async () => {
    await makeTree({
      'monday/Mens Triples/2025-26/Rules.docx': 'x',
      'monday/Mens Triples/Old Stuff/misc.txt': 'x'
    })
    const league = (await scanLeaguesRoot(root)).days.monday[0]
    expect(league.otherEntries.map((e) => [e.name, e.kind])).toEqual([['Old Stuff', 'folder']])
  })

  test('meta.json is not listed among other entries', async () => {
    await makeTree({
      'monday/Mens Triples/2025-26/Rules.docx': 'x',
      'monday/Mens Triples/meta.json': '{}'
    })
    const league = (await scanLeaguesRoot(root)).days.monday[0]
    expect(league.otherEntries).toEqual([])
  })

  test('archived seasons are read from _archives/{league}', async () => {
    await makeTree({
      'monday/Mens Triples/2025-26/Rules.docx': 'x',
      '_archives/Mens Triples/2023-24/Rules.docx': 'x',
      '_archives/Mens Triples/2022-23/Rules.docx': 'x'
    })
    const league = (await scanLeaguesRoot(root)).days.monday[0]
    expect(league.archivedSeasons).toEqual(['2022-23', '2023-24'])
    expect(league.meta.archivedSeasons).toEqual(['2022-23', '2023-24'])
  })

  test('heal writes a fresh meta.json when missing', async () => {
    await makeTree({ 'monday/Mens Triples/2025-26/Rules.docx': 'x' })
    await scanLeaguesRoot(root, { heal: true })
    const written = JSON.parse(await readFile(join(root, 'monday/Mens Triples/meta.json'), 'utf8'))
    expect(written).toMatchObject({
      schemaVersion: 1,
      name: 'Mens Triples',
      day: 'monday',
      seasons: [{ name: '2025-26', status: 'active' }]
    })
  })

  test('heal preserves display name and extra from an existing meta.json', async () => {
    await makeTree({
      'monday/Mens Triples/2025-26/Rules.docx': 'x',
      'monday/Mens Triples/meta.json': JSON.stringify({
        schemaVersion: 1,
        name: "Men's Triples League",
        day: 'monday',
        seasons: [{ name: '2019-20', type: 'cross-year', status: 'active' }],
        archivedSeasons: [],
        extra: { contact: 'Dave' }
      })
    })
    const tree = await scanLeaguesRoot(root, { heal: true })
    expect(tree.days.monday[0].meta.name).toBe("Men's Triples League")
    const written = JSON.parse(await readFile(join(root, 'monday/Mens Triples/meta.json'), 'utf8'))
    expect(written.name).toBe("Men's Triples League")
    expect(written.extra).toEqual({ contact: 'Dave' })
    expect(written.seasons.map((s: { name: string }) => s.name)).toEqual(['2025-26'])
  })

  test('scan without heal never writes meta.json', async () => {
    await makeTree({ 'monday/Mens Triples/2025-26/Rules.docx': 'x' })
    await scanLeaguesRoot(root)
    await expect(readFile(join(root, 'monday/Mens Triples/meta.json'), 'utf8')).rejects.toThrow()
  })

  test('reports presence of the special folders', async () => {
    await makeTree({ '_templates/.keep': '', 'monday/.keep': '' })
    const tree = await scanLeaguesRoot(root)
    expect(tree.hasTemplates).toBe(true)
    expect(tree.hasShared).toBe(false)
  })
})
