import AdmZip from 'adm-zip'
import { ZipArchive } from 'archiver'
import { execFileSync } from 'node:child_process'
import {
  chmod,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  createLeague,
  createSeason,
  createSeasonRoster,
  importFiles,
  initialiseRoot,
  prepareRootSelection,
  renameLeague,
  repairReservedLocations,
  syncSeasonWithTemplates,
  zipArchivedSeasons
} from '../operations'
import { UserFacingError } from '../fs-errors'
import { seasonFileSchema, type SeasonFile } from '../../../shared/members'
import type { LeagueMeta } from '../../../shared/meta'
import { FILE_RULES } from '../template-workflows'
import { resolveNewLiveSeasonRoot } from '../paths'
import { enableMembers, writeSeasonFile } from '../members'
import { scanLeaguesRoot } from '../scanner'

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
  vi.restoreAllMocks()
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
    await makeTree(outside, { 'Rules.docx': 'seed', 'Sign-In Sheet.docx': 'sign-in' })
    await initialiseRoot(root, outside)
    expect(await readFile(join(root, '_templates/Rules.docx'), 'utf8')).toBe('mine')
  })

  test('repairs both defaults without leagues, preserving edits and ignoring custom bundle files', async () => {
    await makeTree(root, { '_templates/Rules.docx': 'my edited rules' })
    await makeTree(outside, {
      'Rules.docx': 'bundled rules',
      'Sign-In Sheet.docx': 'bundled sign-in',
      'Custom.docx': 'not reserved'
    })

    await repairReservedLocations(root, outside)

    expect(await readFile(join(root, '_templates/Rules.docx'), 'utf8')).toBe('my edited rules')
    expect(await readFile(join(root, '_templates/Sign-In Sheet.docx'), 'utf8')).toBe(
      'bundled sign-in'
    )
    expect(await exists(join(root, '_templates/Custom.docx'))).toBe(false)
  })

  test('is idempotent and tolerates concurrent repair attempts', async () => {
    await makeTree(outside, { 'Rules.docx': 'rules', 'Sign-In Sheet.docx': 'sign-in' })
    await Promise.all([
      repairReservedLocations(root, outside),
      repairReservedLocations(root, outside),
      repairReservedLocations(root, outside)
    ])
    const before = await stat(join(root, '_templates/Rules.docx'))
    await repairReservedLocations(root, outside)
    const after = await stat(join(root, '_templates/Rules.docx'))
    expect(after.mtimeMs).toBe(before.mtimeMs)
  })

  test('never recreates a missing selected root', async () => {
    await rm(root, { recursive: true })
    const repair = repairReservedLocations(root, outside)
    await expect(repair).rejects.toBeInstanceOf(UserFacingError)
    await expect(repair).rejects.toThrow('That folder no longer exists')
    expect(await exists(root)).toBe(false)
  })

  test('preserves an unexpected error raised inside repair', async () => {
    await makeTree(outside, { 'Rules.docx': 'rules', 'Sign-In Sheet.docx': 'sign-in' })
    const fault = new TypeError('broken rule')
    vi.spyOn(FILE_RULES, 'fill-missing').mockRejectedValueOnce(fault)

    await expect(repairReservedLocations(root, outside)).rejects.toBe(fault)
  })

  test('rejects reserved symlinks and conflicting required-template entries', async () => {
    await symlink(outside, join(root, '_shared'))
    await expect(repairReservedLocations(root)).rejects.toThrow(/symbolic link/)
    await rm(join(root, '_shared'))
    await makeTree(root, { '_templates/Rules.docx/nested.txt': 'conflict' })
    await makeTree(outside, { 'Rules.docx': 'rules', 'Sign-In Sheet.docx': 'sign-in' })
    await expect(repairReservedLocations(root, outside)).rejects.toThrow(/not a regular file/)
    expect(await readFile(join(root, '_templates/Rules.docx/nested.txt'), 'utf8')).toBe('conflict')
  })

  test('select mode does not create reserved folders', async () => {
    await prepareRootSelection(root, 'select', outside)

    expect(await readdir(root)).toEqual([])
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
    await expect(createLeague(root, 'monday', '***')).rejects.toBeInstanceOf(UserFacingError)
  })

  test('rejects a duplicate league folder', async () => {
    await createLeague(root, 'monday', 'Mens Triples')
    await expect(createLeague(root, 'monday', 'Mens Triples')).rejects.toBeInstanceOf(
      UserFacingError
    )
  })

  test('never writes into a league folder that already exists', async () => {
    await makeTree(root, { 'monday/Pairs/.keep': '' })

    const attempt = createLeague(root, 'monday', 'Pairs')
    await expect(attempt).rejects.toBeInstanceOf(UserFacingError)
    await expect(attempt).rejects.toThrow(/already exists/)
    expect(await readdir(join(root, 'monday/Pairs'))).toEqual(['.keep'])
  })

  test('rejects an in-root weekday alias before creating a league', async () => {
    await makeTree(root, { monday: null, tuesday: null })
    await rm(join(root, 'monday'), { recursive: true })
    await symlink(join(root, 'tuesday'), join(root, 'monday'))

    await expect(createLeague(root, 'monday', 'Pairs')).rejects.toThrow(/does not match/)
    expect(await readdir(join(root, 'tuesday'))).toEqual([])
  })

  test('reports an existing league before validating its different real layout', async () => {
    await makeTree(root, { monday: null, 'tuesday/Trios': null })
    await symlink(join(root, 'tuesday/Trios'), join(root, 'monday/Pairs'))

    const attempt = createLeague(root, 'monday', 'Pairs')
    await expect(attempt).rejects.toBeInstanceOf(UserFacingError)
    await expect(attempt).rejects.toThrow('A league folder named "Pairs" already exists')
    expect(await readdir(join(root, 'tuesday/Trios'))).toEqual([])
  })
})

describe('renameLeague', () => {
  async function readMeta(leaguePath: string): Promise<LeagueMeta> {
    return JSON.parse(await readFile(join(leaguePath, 'meta.json'), 'utf8'))
  }

  test('renames the folder, its archive and the display name together', async () => {
    const original = await createLeague(root, 'monday', 'Mixed Triples')
    await makeTree(root, {
      'monday/Mixed Triples/2025-26/Rules.docx': 'rules',
      '_archives/Mixed Triples/2023-24/Rules.docx': 'old rules'
    })

    const renamed = await renameLeague({
      root,
      day: 'monday',
      leagueFolder: 'Mixed Triples',
      displayName: ' Monday Trios: Mixed '
    })

    expect(renamed).toBe(join(root, 'monday', 'Monday Trios Mixed'))
    expect(await exists(original)).toBe(false)
    expect(await exists(join(root, '_archives/Mixed Triples'))).toBe(false)
    expect(await exists(join(renamed, '2025-26/Rules.docx'))).toBe(true)
    expect(await exists(join(root, '_archives/Monday Trios Mixed/2023-24/Rules.docx'))).toBe(true)
    expect(await readMeta(renamed)).toMatchObject({
      name: 'Monday Trios: Mixed',
      day: 'monday',
      seasons: [{ name: '2025-26', status: 'active' }],
      archivedSeasons: ['2023-24']
    })
  })

  test('changes only the display name when the folder name stays the same', async () => {
    const path = await createLeague(root, 'monday', 'Mixed Triples')
    await writeFile(
      join(path, 'meta.json'),
      JSON.stringify({ name: 'Mixed Triples', extra: { venue: 'Lanes' } })
    )

    expect(
      await renameLeague({
        root,
        day: 'monday',
        leagueFolder: 'Mixed Triples',
        displayName: 'Mixed Triples?'
      })
    ).toBe(path)
    expect(await readMeta(path)).toMatchObject({
      name: 'Mixed Triples?',
      extra: { venue: 'Lanes' }
    })
  })

  test('renames a league that has no archive folder yet', async () => {
    await createLeague(root, 'monday', 'Pairs')
    const renamed = await renameLeague({
      root,
      day: 'monday',
      leagueFolder: 'Pairs',
      displayName: 'Doubles'
    })
    expect(renamed).toBe(join(root, 'monday', 'Doubles'))
    expect(await exists(join(root, '_archives/Doubles'))).toBe(false)
  })

  test('rejects a name that sanitises to nothing', async () => {
    await createLeague(root, 'monday', 'Pairs')
    await expect(
      renameLeague({ root, day: 'monday', leagueFolder: 'Pairs', displayName: '***' })
    ).rejects.toBeInstanceOf(UserFacingError)
  })

  test('refuses to move onto an existing league folder', async () => {
    await createLeague(root, 'monday', 'Pairs')
    await createLeague(root, 'monday', 'Trios')

    const attempt = renameLeague({
      root,
      day: 'monday',
      leagueFolder: 'Pairs',
      displayName: 'Trios'
    })
    await expect(attempt).rejects.toThrow('A league folder named "Trios" already exists')
    expect(await exists(join(root, 'monday/Pairs'))).toBe(true)
    expect((await readMeta(join(root, 'monday/Trios'))).name).toBe('Trios')
  })

  test('moves nothing when the archive slot is already taken', async () => {
    await createLeague(root, 'monday', 'Pairs')
    await makeTree(root, {
      '_archives/Pairs/2023-24/.keep': '',
      '_archives/Doubles/2022-23/.keep': ''
    })

    const attempt = renameLeague({
      root,
      day: 'monday',
      leagueFolder: 'Pairs',
      displayName: 'Doubles'
    })
    await expect(attempt).rejects.toThrow('An archive folder named "Doubles" already exists')
    expect(await exists(join(root, 'monday/Pairs'))).toBe(true)
    expect(await exists(join(root, 'monday/Doubles'))).toBe(false)
    expect(await exists(join(root, '_archives/Pairs/2023-24'))).toBe(true)
  })

  test('puts the league folder back when its archive cannot follow', async () => {
    await createLeague(root, 'monday', 'Pairs')
    await makeTree(root, { '_archives/Pairs/2023-24/.keep': '' })
    const moves: string[] = []
    const moveFolder = async (from: string, to: string): Promise<void> => {
      moves.push(from)
      if (from === join(root, '_archives', 'Pairs')) {
        throw Object.assign(new Error('busy'), { code: 'EBUSY' })
      }
      await rename(from, to)
    }

    const attempt = renameLeague(
      { root, day: 'monday', leagueFolder: 'Pairs', displayName: 'Doubles' },
      moveFolder
    )
    await expect(attempt).rejects.toThrow(/open in another program/)
    expect(moves).toEqual([
      join(root, 'monday', 'Pairs'),
      join(root, '_archives', 'Pairs'),
      join(root, 'monday', 'Doubles')
    ])
    expect(await exists(join(root, 'monday/Pairs'))).toBe(true)
    expect(await exists(join(root, 'monday/Doubles'))).toBe(false)
    expect(await exists(join(root, '_archives/Pairs/2023-24'))).toBe(true)
  })

  test('rejects a missing league and a symlinked meta.json before moving anything', async () => {
    await expect(
      renameLeague({ root, day: 'monday', leagueFolder: 'Ghost', displayName: 'Spirit' })
    ).rejects.toThrow('That folder no longer exists')

    await makeTree(root, { 'monday/Linked/2025-26': null, 'outside.json': '{}' })
    await symlink(join(root, 'outside.json'), join(root, 'monday/Linked/meta.json'))
    await expect(
      renameLeague({ root, day: 'monday', leagueFolder: 'Linked', displayName: 'Unlinked' })
    ).rejects.toThrow('meta.json can’t be a symbolic link')
    expect(await exists(join(root, 'monday/Linked'))).toBe(true)
  })

  test('rejects path syntax in the league folder', async () => {
    await expect(
      renameLeague({ root, day: 'monday', leagueFolder: '../monday', displayName: 'Pairs' })
    ).rejects.toThrow('Invalid league folder')
  })
})

describe('createSeason', () => {
  test('rejects a league folder that escapes its weekday', async () => {
    await expect(
      createSeason({
        root,
        day: 'monday',
        leagueFolder: '../x',
        seasonName: '2026-27',
        source: 'templates',
        archiveOldest: false
      })
    ).rejects.toEqual(new UserFacingError('Invalid league folder'))
  })

  test('rejects a league whose meta.json is a symlink without creating the season', async () => {
    await makeTree(root, { 'monday/Mens Triples/2024-25/Rules.docx': 'prev' })
    await makeTree(outside, { 'Notes.txt': 'private notes' })
    await symlink(join(outside, 'Notes.txt'), join(root, 'monday/Mens Triples/meta.json'))

    await expect(
      createSeason({
        root,
        day: 'monday',
        leagueFolder: 'Mens Triples',
        seasonName: '2025-26',
        source: 'templates',
        archiveOldest: false
      })
    ).rejects.toEqual(new UserFacingError('meta.json can’t be a symbolic link'))
    expect(await readFile(join(outside, 'Notes.txt'), 'utf8')).toBe('private notes')
    expect(await exists(join(root, 'monday/Mens Triples/2025-26'))).toBe(false)
  })

  test('library season creation does not seed a deleted bundled template', async () => {
    await makeTree(outside, { 'Rules.docx': 'bundled', 'Sign-In Sheet.docx': 'bundled' })
    await initialiseRoot(root, outside)
    await rm(join(root, '_templates/Rules.docx'))
    await makeTree(root, { 'monday/Pairs': null })

    await createSeason({
      root,
      day: 'monday',
      leagueFolder: 'Pairs',
      seasonName: '2026-27',
      source: 'templates',
      archiveOldest: false
    })

    expect(await exists(join(root, '_templates/Rules.docx'))).toBe(false)
  })

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

  test('previous files win while newly added custom templates fill missing names', async () => {
    await makeTree(root, {
      '_templates/players.xlsx': 'new player template',
      '_templates/Rules.docx': 'new rules',
      'monday/Mens Triples/2024-25/players.xlsx': 'last season players'
    })
    const result = await createSeason({
      root,
      day: 'monday',
      leagueFolder: 'Mens Triples',
      seasonName: '2025-26',
      source: 'previous',
      archiveOldest: false
    })
    expect(await readFile(join(result.seasonPath, 'players.xlsx'), 'utf8')).toBe(
      'last season players'
    )
    expect(await readFile(join(result.seasonPath, 'Rules.docx'), 'utf8')).toBe('new rules')
  })

  test('an empty templates folder creates a season with no documents', async () => {
    await makeTree(root, {
      _templates: null,
      'monday/Mens Triples/2024-25/Rules.docx': 'previous'
    })
    const result = await createSeason({
      root,
      day: 'monday',
      leagueFolder: 'Mens Triples',
      seasonName: '2025-26',
      source: 'templates',
      archiveOldest: false
    })
    expect(await readdir(result.seasonPath)).toEqual([])
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

  test('refuses to archive over an existing archive folder', async () => {
    await makeTree(root, {
      '_archives/Mens Triples/2023-24/Rules.docx': 'archived copy',
      'monday/Mens Triples/2023-24/Rules.docx': 'old',
      'monday/Mens Triples/2024-25/Rules.docx': 'prev'
    })

    await expect(
      createSeason({
        root,
        day: 'monday',
        leagueFolder: 'Mens Triples',
        seasonName: '2025-26',
        source: 'templates',
        archiveOldest: true
      })
    ).rejects.toEqual(
      new UserFacingError('An archive folder for “2023-24” already exists in “Mens Triples”')
    )
    expect(await readFile(join(root, '_archives/Mens Triples/2023-24/Rules.docx'), 'utf8')).toBe(
      'archived copy'
    )
    expect(await readFile(join(root, 'monday/Mens Triples/2023-24/Rules.docx'), 'utf8')).toBe('old')
    expect((await readdir(join(root, 'monday/Mens Triples'))).sort()).toEqual([
      '2023-24',
      '2024-25'
    ])
    expect(await readdir(join(root, '_archives/Mens Triples/2023-24'))).toEqual(['Rules.docx'])
  })

  test('refuses to archive onto a dangling symlink', async () => {
    await makeTree(root, {
      '_archives/Mens Triples': null,
      'monday/Mens Triples/2023-24/Rules.docx': 'old',
      'monday/Mens Triples/2024-25/Rules.docx': 'prev'
    })
    await symlink(join(outside, 'gone'), join(root, '_archives/Mens Triples/2023-24'))

    await expect(
      createSeason({
        root,
        day: 'monday',
        leagueFolder: 'Mens Triples',
        seasonName: '2025-26',
        source: 'templates',
        archiveOldest: true
      })
    ).rejects.toEqual(
      new UserFacingError('An archive folder for “2023-24” already exists in “Mens Triples”')
    )
    expect((await readdir(join(root, 'monday/Mens Triples'))).sort()).toEqual([
      '2023-24',
      '2024-25'
    ])
    expect(await readFile(join(root, 'monday/Mens Triples/2023-24/Rules.docx'), 'utf8')).toBe('old')
    expect(await exists(join(root, 'monday/Mens Triples/2025-26'))).toBe(false)
  })

  test('does not move a live season through an archive league symlink', async () => {
    await makeTree(root, {
      _archives: null,
      'monday/Mens Triples/2022-23/Rules.docx': 'oldest',
      'monday/Mens Triples/2023-24/Rules.docx': 'older',
      'monday/Mens Triples/2024-25/Rules.docx': 'previous'
    })
    await symlink(outside, join(root, '_archives/Mens Triples'))

    await expect(
      createSeason({
        root,
        day: 'monday',
        leagueFolder: 'Mens Triples',
        seasonName: '2025-26',
        source: 'templates',
        archiveOldest: true
      })
    ).rejects.toEqual(new UserFacingError('Path is outside the leagues folder'))
    expect((await readdir(join(root, 'monday/Mens Triples'))).sort()).toEqual([
      '2022-23',
      '2023-24',
      '2024-25'
    ])
    expect(await readdir(outside)).toEqual([])
  })

  test('does not move a live season when the archives folder is an outside symlink', async () => {
    await makeTree(root, {
      'monday/Mens Triples/2022-23/Rules.docx': 'oldest',
      'monday/Mens Triples/2023-24/Rules.docx': 'older',
      'monday/Mens Triples/2024-25/Rules.docx': 'previous'
    })
    await symlink(outside, join(root, '_archives'))

    await expect(
      createSeason({
        root,
        day: 'monday',
        leagueFolder: 'Mens Triples',
        seasonName: '2025-26',
        source: 'templates',
        archiveOldest: true
      })
    ).rejects.toEqual(new UserFacingError('Reserved folder “_archives” can’t be a symbolic link'))
    expect((await readdir(join(root, 'monday/Mens Triples'))).sort()).toEqual([
      '2022-23',
      '2023-24',
      '2024-25'
    ])
    expect(await readdir(outside)).toEqual([])
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

  test('writes archived seasons in season order so a heal scan leaves meta.json unchanged', async () => {
    await makeTree(root, {
      '_archives/Mens Triples/2023-24/.keep': '',
      '_archives/Mens Triples/2021-22/.keep': '',
      '_archives/Mens Triples/Photos/.keep': '',
      'monday/Mens Triples/2024-25/Rules.docx': 'prev'
    })
    await createSeason({
      root,
      day: 'monday',
      leagueFolder: 'Mens Triples',
      seasonName: '2025-26',
      source: 'templates',
      archiveOldest: false
    })

    const metaPath = join(root, 'monday/Mens Triples/meta.json')
    const beforeScan = await readFile(metaPath, 'utf8')
    expect(JSON.parse(beforeScan).archivedSeasons).toEqual(['2021-22', '2023-24', 'Photos'])
    await scanLeaguesRoot(root, { heal: true })
    expect(await readFile(metaPath, 'utf8')).toBe(beforeScan)
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
    expect(meta.seasons[0].createdAt).toEqual(expect.any(String))
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

  test('rejects a non-canonical season name before taking the template lock', async () => {
    await rm(root, { recursive: true })
    await expect(
      createSeason({
        root,
        day: 'monday',
        leagueFolder: 'Mens Triples',
        seasonName: ' 2025-26 ',
        source: 'templates',
        archiveOldest: true
      })
    ).rejects.toEqual(new UserFacingError('Invalid season name'))
    expect(await exists(root)).toBe(false)
  })

  test('rejects a league symlink outside the root without creating a season', async () => {
    await makeTree(root, { monday: null })
    await symlink(outside, join(root, 'monday/Mens Triples'))

    await expect(
      createSeason({
        root,
        day: 'monday',
        leagueFolder: 'Mens Triples',
        seasonName: '2025-26',
        source: 'templates',
        archiveOldest: false
      })
    ).rejects.toThrow(/outside the leagues folder/)
    expect(await exists(join(outside, '2025-26'))).toBe(false)
    expect(await readdir(root)).toEqual(['monday'])
  })

  test('rejects an in-root league symlink alias without creating a season', async () => {
    await makeTree(root, { monday: null, 'tuesday/Trios': null })
    await symlink(join(root, 'tuesday/Trios'), join(root, 'monday/Pairs'))

    await expect(
      createSeason({
        root,
        day: 'monday',
        leagueFolder: 'Pairs',
        seasonName: '2025-26',
        source: 'templates',
        archiveOldest: false
      })
    ).rejects.toThrow(/does not match/)
    expect(await readdir(join(root, 'monday'))).toEqual(['Pairs'])
    expect(await readdir(join(root, 'tuesday/Trios'))).toEqual([])
  })

  test('validates missing season parents without creating them', async () => {
    await expect(resolveNewLiveSeasonRoot(root, 'monday', 'Pairs', '2025-26')).resolves.toBe(
      join(root, 'monday/Pairs/2025-26')
    )
    expect(await readdir(root)).toEqual([])
    await symlink(outside, join(root, 'monday'))
    await expect(resolveNewLiveSeasonRoot(root, 'monday', 'Pairs', '2025-26')).rejects.toThrow(
      /outside the leagues folder/
    )
    expect(await readdir(outside)).toEqual([])
  })

  test('rejects a season that already exists', async () => {
    await makeTree(root, { 'monday/Mens Triples/2025-26': null })
    const attempt = createSeason({
      root,
      day: 'monday',
      leagueFolder: 'Mens Triples',
      seasonName: '2025-26',
      source: 'templates',
      archiveOldest: true
    })
    await expect(attempt).rejects.toBeInstanceOf(UserFacingError)
    await expect(attempt).rejects.toThrow(/exists/i)
  })
})

describe('createSeason with the members database', () => {
  async function seasonFileOf(rel: string): Promise<SeasonFile> {
    return seasonFileSchema.parse(JSON.parse(await readFile(join(root, rel, 'meta.json'), 'utf8')))
  }

  test('writes no season file while the location has not enabled members', async () => {
    await makeTree(root, { 'monday/Pairs': null })
    await createSeason({
      root,
      day: 'monday',
      leagueFolder: 'Pairs',
      seasonName: '2025-26',
      source: 'templates',
      archiveOldest: false,
      roster: { format: 2, carryOver: false }
    })
    expect(await exists(join(root, 'monday/Pairs/2025-26/meta.json'))).toBe(false)
  })

  test('writes a default season file when the dialog sent no roster options', async () => {
    await enableMembers(root)
    await makeTree(root, { 'monday/Pairs': null })
    await createSeason({
      root,
      day: 'monday',
      leagueFolder: 'Pairs',
      seasonName: '2025-26',
      source: 'templates',
      archiveOldest: false
    })
    expect(await seasonFileOf('monday/Pairs/2025-26')).toEqual({
      schemaVersion: 1,
      format: 3,
      teams: [],
      players: []
    })
  })

  test('carries the roster over even when documents come from the templates', async () => {
    await enableMembers(root)
    await makeTree(root, {
      '_templates/Rules.docx': 'template',
      'monday/Pairs/2024-25/Rules.docx': 'prev'
    })
    await writeSeasonFile(join(root, 'monday/Pairs/2024-25'), {
      schemaVersion: 1,
      format: 2,
      teams: [{ id: 'team_a', teamNo: 1, name: 'Strikers' }],
      players: [{ memberId: 1, teamId: 'team_a' }]
    })
    await createSeason({
      root,
      day: 'monday',
      leagueFolder: 'Pairs',
      seasonName: '2025-26',
      source: 'templates',
      archiveOldest: false,
      roster: { format: 2, carryOver: true }
    })
    expect(await readFile(join(root, 'monday/Pairs/2025-26/Rules.docx'), 'utf8')).toBe('template')
    expect((await seasonFileOf('monday/Pairs/2025-26')).players).toEqual([
      { memberId: 1, teamId: 'team_a' }
    ])
  })

  test('starts a season file with the chosen format', async () => {
    await enableMembers(root)
    await makeTree(root, { 'monday/Pairs': null })
    await createSeason({
      root,
      day: 'monday',
      leagueFolder: 'Pairs',
      seasonName: '2025-26',
      source: 'templates',
      archiveOldest: false,
      roster: { format: 2, carryOver: true }
    })
    expect(await seasonFileOf('monday/Pairs/2025-26')).toEqual({
      schemaVersion: 1,
      format: 2,
      teams: [],
      players: []
    })
  })

  test('carries teams and players over from the previous season and nothing else', async () => {
    await enableMembers(root)
    await makeTree(root, { 'monday/Pairs/2024-25/Rules.docx': 'prev' })
    await writeSeasonFile(join(root, 'monday/Pairs/2024-25'), {
      schemaVersion: 1,
      format: 2,
      startDate: '2024-09-02',
      weeks: 30,
      fees: { total: 10, breakdown: [] },
      leagueSecretaryId: 'ls-season-1',
      teams: [{ id: 'team_a', teamNo: 1, name: 'Strikers' }],
      players: [{ memberId: 1, teamId: 'team_a', position: 2, leagueSecretaryId: 'ls-bowler-9' }]
    })
    await createSeason({
      root,
      day: 'monday',
      leagueFolder: 'Pairs',
      seasonName: '2025-26',
      source: 'previous',
      archiveOldest: false,
      roster: { format: 3, carryOver: true }
    })
    // LeagueSecretary ids belong to one season, so neither the season's nor a bowler's comes across.
    expect(await seasonFileOf('monday/Pairs/2025-26')).toEqual({
      schemaVersion: 1,
      format: 3,
      teams: [{ id: 'team_a', teamNo: 1, name: 'Strikers' }],
      players: [{ memberId: 1, teamId: 'team_a', position: 2 }]
    })
    expect(await readFile(join(root, 'monday/Pairs/2025-26/Rules.docx'), 'utf8')).toBe('prev')
  })

  test('leaves the roster empty when carry-over is off', async () => {
    await enableMembers(root)
    await makeTree(root, { 'monday/Pairs/2024-25/Rules.docx': 'prev' })
    await writeSeasonFile(join(root, 'monday/Pairs/2024-25'), {
      schemaVersion: 1,
      format: 2,
      teams: [{ id: 'team_a', teamNo: 1, name: 'Strikers' }],
      players: [{ memberId: 1, teamId: 'team_a' }]
    })
    await createSeason({
      root,
      day: 'monday',
      leagueFolder: 'Pairs',
      seasonName: '2025-26',
      source: 'previous',
      archiveOldest: false,
      roster: { format: 2, carryOver: false }
    })
    expect(await seasonFileOf('monday/Pairs/2025-26')).toEqual({
      schemaVersion: 1,
      format: 2,
      teams: [],
      players: []
    })
  })
})

describe('createSeasonRoster', () => {
  const ref = { root: '', day: 'monday' as const, leagueFolder: 'Pairs', seasonName: '2025-26' }

  async function seasonFileOf(rel: string): Promise<SeasonFile> {
    return seasonFileSchema.parse(JSON.parse(await readFile(join(root, rel, 'meta.json'), 'utf8')))
  }

  test('gives an existing season a roster carried over from the one before it', async () => {
    await enableMembers(root)
    await makeTree(root, {
      'monday/Pairs/2024-25/Rules.docx': 'prev',
      'monday/Pairs/2025-26/Rules.docx': 'current'
    })
    await writeSeasonFile(join(root, 'monday/Pairs/2024-25'), {
      schemaVersion: 1,
      format: 2,
      teams: [{ id: 'team_a', teamNo: 1, name: 'Strikers' }],
      players: [{ memberId: 1, teamId: 'team_a', leagueSecretaryId: 'ls-1' }]
    })

    await createSeasonRoster({ ...ref, root, roster: { format: 2, carryOver: true } })
    expect(await seasonFileOf('monday/Pairs/2025-26')).toEqual({
      schemaVersion: 1,
      format: 2,
      teams: [{ id: 'team_a', teamNo: 1, name: 'Strikers' }],
      players: [{ memberId: 1, teamId: 'team_a' }]
    })
    expect(await readFile(join(root, 'monday/Pairs/2025-26/Rules.docx'), 'utf8')).toBe('current')

    await expect(
      createSeasonRoster({ ...ref, root, roster: { format: 3, carryOver: false } })
    ).rejects.toThrow('already has a roster')
  })

  test('carries players into a singles season without their teams', async () => {
    await enableMembers(root)
    await makeTree(root, { 'monday/Pairs/2024-25': null, 'monday/Pairs/2025-26': null })
    await writeSeasonFile(join(root, 'monday/Pairs/2024-25'), {
      schemaVersion: 1,
      format: 2,
      teams: [{ id: 'team_a', teamNo: 1, name: 'Strikers' }],
      players: [{ memberId: 1, teamId: 'team_a', position: 1 }]
    })

    await createSeasonRoster({ ...ref, root, roster: { format: 1, carryOver: true } })
    expect(await seasonFileOf('monday/Pairs/2025-26')).toEqual({
      schemaVersion: 1,
      format: 1,
      teams: [],
      players: [{ memberId: 1, teamId: null, position: 1 }]
    })
  })

  test('refuses a location without the database, an archived season and a missing one', async () => {
    await makeTree(root, { 'monday/Pairs/2025-26': null, '_archives/Pairs/2023-24': null })
    await expect(
      createSeasonRoster({ ...ref, root, roster: { format: 3, carryOver: false } })
    ).rejects.toThrow('not enabled')

    await enableMembers(root)
    await expect(
      createSeasonRoster({
        ...ref,
        root,
        seasonName: '2023-24',
        roster: { format: 3, carryOver: false }
      })
    ).rejects.toThrow()
    await expect(
      createSeasonRoster({
        ...ref,
        root,
        seasonName: '2026-27',
        roster: { format: 3, carryOver: false }
      })
    ).rejects.toThrow()
    expect(await exists(join(root, '_archives/Pairs/2023-24/meta.json'))).toBe(false)
  })
})

describe('syncSeasonWithTemplates', () => {
  test('adds missing templates once and is then a no-op', async () => {
    await makeTree(root, {
      '_templates/Rules.docx': 'rules',
      '_templates/players.xlsx': 'players template',
      'monday/Mens Triples/2025-26/players.xlsx': 'existing players'
    })
    const opts = {
      root,
      day: 'monday' as const,
      leagueFolder: 'Mens Triples',
      seasonName: '2025-26'
    }
    await expect(syncSeasonWithTemplates(opts)).resolves.toEqual({
      added: ['Rules.docx'],
      skipped: ['players.xlsx']
    })
    await expect(syncSeasonWithTemplates(opts)).resolves.toEqual({
      added: [],
      skipped: expect.arrayContaining(['Rules.docx', 'players.xlsx'])
    })
    expect(await readFile(join(root, 'monday/Mens Triples/2025-26/players.xlsx'), 'utf8')).toBe(
      'existing players'
    )
  })

  test('rejects invalid targets and symlink aliases to archived seasons', async () => {
    await makeTree(root, {
      '_templates/Rules.docx': 'rules',
      '_archives/Mens Triples/2023-24/Rules.docx': 'archived',
      'monday/Mens Triples': null
    })
    await symlink(
      join(root, '_archives/Mens Triples/2023-24'),
      join(root, 'monday/Mens Triples/2023-24')
    )
    await expect(
      syncSeasonWithTemplates({
        root,
        day: 'monday',
        leagueFolder: 'Mens Triples',
        seasonName: '2023-24'
      })
    ).rejects.toThrow(/live season/)
    await expect(
      syncSeasonWithTemplates({
        root,
        day: 'monday',
        leagueFolder: '../_archives',
        seasonName: '2023-24'
      })
    ).rejects.toThrow(/league folder/)
  })
})

describe('zipArchivedSeasons', () => {
  test('zips each selected archived season into its own zip', async () => {
    await makeTree(root, {
      '_archives/Mens Triples/2022-23/Rules.docx': 'r22',
      '_archives/Mens Triples/2023-24/Rules.docx': 'r23',
      '_archives/Mens Triples/2023-24/bls-backup.bak': 'bls'
    })
    const result = await zipArchivedSeasons(root, 'Mens Triples', ['2023-24'])
    expect(result).toEqual({
      zips: [join(root, '_archives/Mens Triples/2023-24.zip')],
      failed: []
    })
    const entries = new AdmZip(result.zips[0])
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

  test('does nothing for an empty archive selection', async () => {
    await expect(zipArchivedSeasons(root, 'Mens Triples', [])).resolves.toEqual({
      zips: [],
      failed: []
    })
    expect(await readdir(root)).toEqual([])
  })

  test('rejects path traversal before writing an archive', async () => {
    await makeTree(root, { '_archives/Mens Triples': null })

    await expect(zipArchivedSeasons(root, '../x', ['2025-26'])).rejects.toEqual(
      new UserFacingError('Invalid league folder')
    )
    await expect(zipArchivedSeasons(root, 'Mens Triples', ['../../evil'])).rejects.toEqual(
      new UserFacingError('Invalid season name')
    )
    expect(await readdir(join(root, '_archives/Mens Triples'))).toEqual([])
  })

  test('rejects a dangling symlink at the zip output path', async () => {
    await makeTree(root, { '_archives/Mens Triples/2025-26': null })
    const zipPath = join(root, '_archives/Mens Triples/2025-26.zip')
    await symlink(join(outside, 'missing.zip'), zipPath)

    await expect(zipArchivedSeasons(root, 'Mens Triples', ['2025-26'])).rejects.toThrow(
      /symbolic link/
    )
    expect(await exists(join(outside, 'missing.zip'))).toBe(false)
  })

  test('validates the entire selection before writing its first zip', async () => {
    await makeTree(root, { '_archives/Mens Triples/2025-26': null })
    await expect(
      zipArchivedSeasons(root, 'Mens Triples', ['2025-26', '../../evil'])
    ).rejects.toThrow(/season name/)
    expect(await readdir(join(root, '_archives/Mens Triples'))).toEqual(['2025-26'])
  })

  test('rejects a zip symlink to an existing user document inside the root', async () => {
    await makeTree(root, {
      '_archives/Mens Triples/2025-26': null,
      '_templates/Rules.docx': 'user rules'
    })
    await symlink(
      join(root, '_templates/Rules.docx'),
      join(root, '_archives/Mens Triples/2025-26.zip')
    )
    await expect(zipArchivedSeasons(root, 'Mens Triples', ['2025-26'])).rejects.toThrow(
      /symbolic link/
    )
    expect(await readFile(join(root, '_templates/Rules.docx'), 'utf8')).toBe('user rules')
  })

  test('rejects an archive directory symlink outside the root before writing', async () => {
    await makeTree(root, { _archives: null })
    await makeTree(outside, { '2025-26': null })
    await symlink(outside, join(root, '_archives/Mens Triples'))
    await expect(zipArchivedSeasons(root, 'Mens Triples', ['2025-26'])).rejects.toBeInstanceOf(
      UserFacingError
    )
    expect(await readdir(outside)).toEqual(['2025-26'])
  })

  test('rejects an in-root archive league alias before writing', async () => {
    await makeTree(root, { '_archives/Other League/2025-26/Rules.docx': 'rules' })
    await symlink(join(root, '_archives/Other League'), join(root, '_archives/Mens Triples'))

    await expect(zipArchivedSeasons(root, 'Mens Triples', ['2025-26'])).rejects.toThrow(
      /does not match/
    )
    expect(await readdir(join(root, '_archives/Other League'))).toEqual(['2025-26'])
  })

  test('settles when a directory occupies the zip output path', async () => {
    await makeTree(root, {
      '_archives/Mens Triples/2025-26/Rules.docx': 'rules',
      '_archives/Mens Triples/2025-26.zip': null
    })

    await expect(zipArchivedSeasons(root, 'Mens Triples', ['2025-26'])).rejects.toBeInstanceOf(
      UserFacingError
    )
    expect((await stat(join(root, '_archives/Mens Triples/2025-26.zip'))).isDirectory()).toBe(true)
  })

  test('removes a partial output and maps an archive failure', async () => {
    await makeTree(root, { '_archives/Mens Triples/2025-26/Rules.docx': 'rules' })
    const fault = Object.assign(new Error('archive denied'), { code: 'EACCES' })
    vi.spyOn(ZipArchive.prototype, 'finalize').mockImplementationOnce(function (
      this: ZipArchive
    ): Promise<void> {
      this.emit('error', fault)
      return Promise.reject(fault)
    })

    await expect(zipArchivedSeasons(root, 'Mens Triples', ['2025-26'])).rejects.toEqual(
      new UserFacingError('That folder can’t be read or changed (permission denied)')
    )
    expect(await exists(join(root, '_archives/Mens Triples/2025-26.zip'))).toBe(false)
  })

  test('zips the remaining seasons when one fails', async () => {
    await makeTree(root, {
      '_archives/Mens Triples/2024-25/Rules.docx': 'rules',
      '_archives/Mens Triples/2025-26/Rules.docx': 'rules'
    })
    const fault = Object.assign(new Error('archive denied'), { code: 'EACCES' })
    vi.spyOn(ZipArchive.prototype, 'finalize').mockImplementationOnce(function (
      this: ZipArchive
    ): Promise<void> {
      this.emit('error', fault)
      return Promise.reject(fault)
    })

    await expect(zipArchivedSeasons(root, 'Mens Triples', ['2024-25', '2025-26'])).resolves.toEqual(
      {
        zips: [join(root, '_archives/Mens Triples/2025-26.zip')],
        failed: [
          {
            season: '2024-25',
            message: 'That folder can’t be read or changed (permission denied)'
          }
        ]
      }
    )
    expect(await exists(join(root, '_archives/Mens Triples/2024-25.zip'))).toBe(false)
    expect(await exists(join(root, '_archives/Mens Triples/2025-26.zip'))).toBe(true)
  })

  test.skipIf(process.platform === 'win32')(
    'fails a season whose archive reports a warning',
    async () => {
      const fifoPath = join(root, '_archives/Mens Triples/2025-26/cloud-placeholder')
      await makeTree(root, { '_archives/Mens Triples/2025-26/Rules.docx': 'rules' })
      execFileSync('mkfifo', [fifoPath])

      const archive = zipArchivedSeasons(root, 'Mens Triples', ['2025-26'])

      await expect(archive).rejects.toBeInstanceOf(UserFacingError)
      await expect(archive).rejects.toThrow(/^“2025-26” couldn’t be zipped completely:/)
      expect(await exists(join(root, '_archives/Mens Triples/2025-26.zip'))).toBe(false)
    },
    10_000
  )

  test.skipIf(process.platform === 'win32')(
    'stores a dangling symlink without failing',
    async () => {
      const seasonDir = join(root, '_archives/Mens Triples/2025-26')
      await makeTree(root, { '_archives/Mens Triples/2025-26/Rules.docx': 'rules' })
      await symlink(join(outside, 'missing.pdf'), join(seasonDir, 'missing.pdf'))

      const result = await zipArchivedSeasons(root, 'Mens Triples', ['2025-26'])

      expect(result).toEqual({
        zips: [join(root, '_archives/Mens Triples/2025-26.zip')],
        failed: []
      })
      expect(new AdmZip(result.zips[0]).getEntry('2025-26/missing.pdf')).not.toBeNull()
    }
  )

  // Root ignores mode bits, and Windows ignores them on directories altogether.
  test.skipIf(process.getuid?.() === 0 || process.platform === 'win32')(
    'settles with a user-facing error when the zip destination is read-only',
    async () => {
      const archiveDir = join(root, '_archives/Mens Triples')
      await makeTree(root, { '_archives/Mens Triples/2025-26/Rules.docx': 'rules' })
      await chmod(archiveDir, 0o500)

      try {
        await expect(zipArchivedSeasons(root, 'Mens Triples', ['2025-26'])).rejects.toBeInstanceOf(
          UserFacingError
        )
      } finally {
        await chmod(archiveDir, 0o700)
      }
    }
  )
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

  test('does not follow a dangling symlink at a candidate target name', async () => {
    await makeTree(root, { 'monday/Mens Triples/2025-26': null })
    await makeTree(outside, { 'bls-backup.bak': 'newer' })
    const dest = join(root, 'monday/Mens Triples/2025-26')
    const danglingTarget = join(outside, 'missing.bak')
    await symlink(danglingTarget, join(dest, 'bls-backup.bak'))

    await importFiles(dest, [join(outside, 'bls-backup.bak')])

    expect(await readFile(join(dest, 'bls-backup (2).bak'), 'utf8')).toBe('newer')
    expect(await exists(danglingTarget)).toBe(false)
  })

  test('copies the rest when one source is missing', async () => {
    await makeTree(root, { 'monday/Mens Triples/2025-26': null })
    await makeTree(outside, { 'a.pdf': 'a', 'c.pdf': 'c' })
    const dest = join(root, 'monday/Mens Triples/2025-26')
    const missing = join(outside, 'b.pdf')

    await expect(
      importFiles(dest, [join(outside, 'a.pdf'), missing, join(outside, 'c.pdf')])
    ).resolves.toEqual({
      copied: [join(dest, 'a.pdf'), join(dest, 'c.pdf')],
      failed: [{ source: missing, message: 'That folder no longer exists' }]
    })
    expect(await readFile(join(dest, 'a.pdf'), 'utf8')).toBe('a')
    expect(await readFile(join(dest, 'c.pdf'), 'utf8')).toBe('c')
  })

  test('rejects when every source fails', async () => {
    await makeTree(root, { 'monday/Mens Triples/2025-26': null })
    const dest = join(root, 'monday/Mens Triples/2025-26')

    await expect(
      importFiles(dest, [join(outside, 'a.pdf'), join(outside, 'b.pdf')])
    ).rejects.toBeInstanceOf(UserFacingError)
    expect(await readdir(dest)).toEqual([])
  })
})
