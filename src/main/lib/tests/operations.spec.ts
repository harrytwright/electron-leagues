import AdmZip from 'adm-zip'
import {
  chmod,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
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
  importFiles,
  initialiseRoot,
  prepareRootSelection,
  repairReservedLocations,
  syncSeasonWithTemplates,
  zipArchivedSeasons
} from '../operations'
import { UserFacingError } from '../fs-errors'
import { parseSeasonCreateRequest } from '../season-create-request'
import { FILE_RULES } from '../template-workflows'
import { resolveNewLiveSeasonRoot } from '../paths'

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
    await expect(createLeague(root, 'monday', '***')).rejects.toThrow(/name/i)
  })

  test('rejects a duplicate league folder', async () => {
    await createLeague(root, 'monday', 'Mens Triples')
    await expect(createLeague(root, 'monday', 'Mens Triples')).rejects.toThrow(/exists/i)
  })
})

describe('createSeason', () => {
  test('rejects an unknown workflow at the IPC boundary', () => {
    expect(() =>
      parseSeasonCreateRequest({
        day: 'monday',
        leagueFolder: 'Pairs',
        seasonName: '2026-27',
        source: 'unknown',
        archiveOldest: false
      })
    ).toThrow(new UserFacingError('Unknown season workflow'))
  })

  test('rejects a day that escapes the root at the IPC boundary', () => {
    expect(() =>
      parseSeasonCreateRequest({
        day: '..',
        leagueFolder: 'Pairs',
        seasonName: '2026-27',
        source: 'empty',
        archiveOldest: false
      })
    ).toThrow(new UserFacingError('Invalid league day'))
  })

  test.each([
    null,
    {},
    {
      day: 'monday',
      leagueFolder: 42,
      seasonName: '2026-27',
      source: 'empty',
      archiveOldest: false
    },
    {
      day: 'monday',
      leagueFolder: 'Pairs',
      seasonName: '2026-27',
      source: 'empty',
      archiveOldest: 'yes'
    }
  ])('rejects an invalid IPC request', (input) => {
    expect(() => parseSeasonCreateRequest(input)).toThrow(
      new UserFacingError('Invalid season request')
    )
  })

  test('rejects a league folder that escapes its weekday', async () => {
    await expect(
      createSeason({
        root,
        day: 'monday',
        leagueFolder: '../x',
        seasonName: '2026-27',
        source: 'empty',
        archiveOldest: false
      })
    ).rejects.toEqual(new UserFacingError('Invalid league folder'))
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
      source: 'empty',
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

  test('empty creates a truly empty season', async () => {
    await makeTree(root, {
      '_templates/players.xlsx': 'template',
      'monday/Mens Triples/2024-25/Rules.docx': 'previous'
    })
    const result = await createSeason({
      root,
      day: 'monday',
      leagueFolder: 'Mens Triples',
      seasonName: '2025-26',
      source: 'empty',
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
        source: 'empty',
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
        source: 'empty',
        archiveOldest: false
      })
    ).rejects.toThrow(/selected live league/)
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

  test('does nothing for an empty archive selection', async () => {
    await expect(zipArchivedSeasons(root, 'Mens Triples', [])).resolves.toEqual([])
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

  test.skipIf(process.getuid?.() === 0)(
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
})
