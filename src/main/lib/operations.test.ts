import AdmZip from 'adm-zip'
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  createLeague,
  createSeason,
  importFiles,
  initialiseRoot,
  zipArchivedSeasons
} from './operations'

let root: string
let outside: string

async function makeTree(base: string, paths: Record<string, string | null>): Promise<void> {
  for (const [rel, content] of Object.entries(paths)) {
    const abs = join(base, rel)
    if (content === null) {
      await mkdir(abs, { recursive: true })
    } else {
      await mkdir(join(abs, '..'), { recursive: true })
      await writeFile(abs, content)
    }
  }
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  )
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'leagues-ops-'))
  outside = await mkdtemp(join(tmpdir(), 'leagues-src-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe('initialiseRoot', () => {
  test('creates the special folders and seeds templates', async () => {
    await makeTree(outside, { 'Rules.docx': 'template', 'Sign-In Sheet.docx': 'template' })
    await initialiseRoot(root, outside)
    expect(await exists(join(root, '_templates/Rules.docx'))).toBe(true)
    expect(await exists(join(root, '_shared'))).toBe(true)
    expect(await exists(join(root, '_archives'))).toBe(true)
  })

  test('does not overwrite existing templates', async () => {
    await makeTree(root, { '_templates/Rules.docx': 'mine' })
    await makeTree(outside, { 'Rules.docx': 'seed' })
    await initialiseRoot(root, outside)
    expect(await readFile(join(root, '_templates/Rules.docx'), 'utf8')).toBe('mine')
  })
})

describe('createLeague', () => {
  test('creates the league folder under its day with a meta.json', async () => {
    const path = await createLeague(root, 'monday', "Men's Triples: League")
    expect(path).toBe(join(root, 'monday', "Men's Triples League"))
    const meta = JSON.parse(await readFile(join(path, 'meta.json'), 'utf8'))
    expect(meta).toMatchObject({ name: "Men's Triples: League", day: 'monday', seasons: [] })
  })

  test('rejects a league whose name sanitises to nothing', async () => {
    await expect(createLeague(root, 'monday', '***')).rejects.toThrow(/name/i)
  })

  test('rejects a duplicate league folder', async () => {
    await createLeague(root, 'monday', 'Mens Triples')
    await expect(createLeague(root, 'monday', 'Mens Triples')).rejects.toThrow(/exists/i)
  })
})

describe('createSeason', () => {
  test('creates a season from templates', async () => {
    await makeTree(root, {
      '_templates/Rules.docx': 'template-rules',
      '_templates/Sign-In Sheet.docx': 'template-signin',
      'monday/Mens Triples': null
    })
    const result = await createSeason({
      root,
      day: 'monday',
      leagueFolder: 'Mens Triples',
      seasonName: '2025-26',
      source: 'templates',
      archiveOldest: true
    })
    expect(result.seasonPath).toBe(join(root, 'monday/Mens Triples/2025-26'))
    expect(await readFile(join(result.seasonPath, 'Rules.docx'), 'utf8')).toBe('template-rules')
    expect(result.archived).toBeNull()
  })

  test('creates a season copying the previous season documents', async () => {
    await makeTree(root, {
      'monday/Mens Triples/2024-25/Rules.docx': 'last-years-rules',
      'monday/Mens Triples/2024-25/Sign-In Sheet.docx': 'last-years-signin'
    })
    const result = await createSeason({
      root,
      day: 'monday',
      leagueFolder: 'Mens Triples',
      seasonName: '2025-26',
      source: 'previous',
      archiveOldest: true
    })
    expect(await readFile(join(result.seasonPath, 'Rules.docx'), 'utf8')).toBe('last-years-rules')
  })

  test('moves the oldest season to the archive when more than two live', async () => {
    await makeTree(root, {
      'monday/Mens Triples/2023-24/Rules.docx': 'old',
      'monday/Mens Triples/2024-25/Rules.docx': 'prev'
    })
    const result = await createSeason({
      root,
      day: 'monday',
      leagueFolder: 'Mens Triples',
      seasonName: '2025-26',
      source: 'previous',
      archiveOldest: true
    })
    expect(result.archived).toBe('2023-24')
    expect(await exists(join(root, 'monday/Mens Triples/2023-24'))).toBe(false)
    expect(await readFile(join(root, '_archives/Mens Triples/2023-24/Rules.docx'), 'utf8')).toBe(
      'old'
    )
  })

  test('leaves three seasons live when archiving is declined', async () => {
    await makeTree(root, {
      'monday/Mens Triples/2023-24/Rules.docx': 'old',
      'monday/Mens Triples/2024-25/Rules.docx': 'prev'
    })
    const result = await createSeason({
      root,
      day: 'monday',
      leagueFolder: 'Mens Triples',
      seasonName: '2025-26',
      source: 'previous',
      archiveOldest: false
    })
    expect(result.archived).toBeNull()
    expect(await exists(join(root, 'monday/Mens Triples/2023-24'))).toBe(true)
  })

  test('records createdAt for the new season in meta.json', async () => {
    await makeTree(root, { 'monday/Mens Triples': null, '_templates/Rules.docx': 't' })
    await createSeason({
      root,
      day: 'monday',
      leagueFolder: 'Mens Triples',
      seasonName: '2025-26',
      source: 'templates',
      archiveOldest: true
    })
    const meta = JSON.parse(await readFile(join(root, 'monday/Mens Triples/meta.json'), 'utf8'))
    expect(meta.seasons[0].name).toBe('2025-26')
    expect(typeof meta.seasons[0].createdAt).toBe('string')
  })

  test('rejects an invalid season name', async () => {
    await makeTree(root, { 'monday/Mens Triples': null })
    await expect(
      createSeason({
        root,
        day: 'monday',
        leagueFolder: 'Mens Triples',
        seasonName: 'Winter 25',
        source: 'templates',
        archiveOldest: true
      })
    ).rejects.toThrow(/season name/i)
  })

  test('rejects a season that already exists', async () => {
    await makeTree(root, { 'monday/Mens Triples/2025-26': null })
    await expect(
      createSeason({
        root,
        day: 'monday',
        leagueFolder: 'Mens Triples',
        seasonName: '2025-26',
        source: 'templates',
        archiveOldest: true
      })
    ).rejects.toThrow(/exists/i)
  })
})

describe('zipArchivedSeasons', () => {
  test('zips each selected archived season into its own zip', async () => {
    await makeTree(root, {
      '_archives/Mens Triples/2022-23/Rules.docx': 'r22',
      '_archives/Mens Triples/2023-24/Rules.docx': 'r23',
      '_archives/Mens Triples/2023-24/bls-backup.bak': 'bls'
    })
    const zips = await zipArchivedSeasons(root, 'Mens Triples', ['2023-24'])
    expect(zips).toEqual([join(root, '_archives/Mens Triples/2023-24.zip')])
    const entries = new AdmZip(zips[0])
      .getEntries()
      .map((e) => e.entryName)
      .sort()
    expect(entries).toEqual(['2023-24/Rules.docx', '2023-24/bls-backup.bak'])
    expect(await exists(join(root, '_archives/Mens Triples/2022-23.zip'))).toBe(false)
  })

  test('rejects a season with no archive folder', async () => {
    await expect(zipArchivedSeasons(root, 'Mens Triples', ['2020-21'])).rejects.toThrow(
      /no archive/i
    )
  })
})

describe('importFiles', () => {
  test('copies files into the destination', async () => {
    await makeTree(root, { 'monday/Mens Triples/2025-26': null })
    await makeTree(outside, { 'bls-backup.bak': 'data' })
    const dest = join(root, 'monday/Mens Triples/2025-26')
    await importFiles(dest, [join(outside, 'bls-backup.bak')])
    expect(await readFile(join(dest, 'bls-backup.bak'), 'utf8')).toBe('data')
  })

  test('never overwrites an existing file — adds a numbered suffix', async () => {
    await makeTree(root, { 'monday/Mens Triples/2025-26/bls-backup.bak': 'original' })
    await makeTree(outside, { 'bls-backup.bak': 'newer' })
    const dest = join(root, 'monday/Mens Triples/2025-26')
    await importFiles(dest, [join(outside, 'bls-backup.bak')])
    expect(await readFile(join(dest, 'bls-backup.bak'), 'utf8')).toBe('original')
    expect(await readFile(join(dest, 'bls-backup (2).bak'), 'utf8')).toBe('newer')
    expect((await readdir(dest)).sort()).toEqual(['bls-backup (2).bak', 'bls-backup.bak'])
  })
})
