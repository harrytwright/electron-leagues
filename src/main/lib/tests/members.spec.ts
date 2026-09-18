import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { emptyMembersFile, type SeasonFile } from '../../../shared/members'
import { buildMembersSnapshot, enableMembers, membersEnabled, writeSeasonFile } from '../members'
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

function seasonFile(overrides: Partial<SeasonFile> = {}): SeasonFile {
  return { schemaVersion: 1, format: 3, teams: [], players: [], ...overrides }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'leagues-members-'))
  outside = await mkdtemp(join(tmpdir(), 'leagues-members-outside-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe('enableMembers', () => {
  test('creates the master list once and leaves an existing one alone', async () => {
    expect(await membersEnabled(root)).toBe(false)
    expect(await enableMembers(root)).toBe(true)
    expect(await membersEnabled(root)).toBe(true)
    expect(JSON.parse(await readFile(join(root, 'members.json'), 'utf8'))).toEqual(
      emptyMembersFile()
    )

    await writeFile(join(root, 'members.json'), '{"kept": true}')
    expect(await enableMembers(root)).toBe(false)
    expect(await readFile(join(root, 'members.json'), 'utf8')).toBe('{"kept": true}')
  })

  test('refuses to write through a symlinked master list', async () => {
    await writeFile(join(outside, 'private.json'), 'private')
    await symlink(join(outside, 'private.json'), join(root, 'members.json'))

    expect(await membersEnabled(root)).toBe(false)
    await expect(enableMembers(root)).rejects.toThrow('members.json can’t be a symbolic link')
    expect(await readFile(join(outside, 'private.json'), 'utf8')).toBe('private')
  })
})

describe('buildMembersSnapshot', () => {
  test('is disabled without a master list, whatever the seasons hold', async () => {
    await makeTree(root, { 'monday/Pairs/2025-26/Rules.docx': 'x' })
    await writeSeasonFile(join(root, 'monday/Pairs/2025-26'), seasonFile())

    const snapshot = await buildMembersSnapshot(root, await scanLeaguesRoot(root))
    expect(snapshot).toEqual({
      enabled: false,
      nextId: 1,
      members: [],
      seasons: [],
      problems: []
    })
  })

  test('reads live and archived season files and skips seasons without one', async () => {
    await enableMembers(root)
    await makeTree(root, {
      'monday/Pairs/2024-25/Rules.docx': 'x',
      'monday/Pairs/2025-26/Rules.docx': 'x',
      '_archives/Pairs/2023-24/Rules.docx': 'x',
      'monday/Pairs/meta.json': JSON.stringify({ name: 'Monday Pairs' })
    })
    await writeSeasonFile(
      join(root, 'monday/Pairs/2025-26'),
      seasonFile({ players: [{ memberId: 1, teamId: null }] })
    )
    await writeSeasonFile(join(root, '_archives/Pairs/2023-24'), seasonFile({ format: 2 }))

    const snapshot = await buildMembersSnapshot(root, await scanLeaguesRoot(root))
    expect(snapshot.enabled).toBe(true)
    expect(
      snapshot.seasons.map((season) => [
        season.season,
        season.archived,
        season.leagueName,
        season.file.format
      ])
    ).toEqual([
      ['2025-26', false, 'Monday Pairs', 3],
      ['2023-24', true, 'Monday Pairs', 2]
    ])
    expect(snapshot.problems).toEqual([
      { kind: 'unlinked-player', path: join(root, 'monday/Pairs/2025-26'), memberId: 1 }
    ])
  })

  test('reports an unreadable file by name instead of failing the snapshot', async () => {
    await makeTree(root, {
      'members.json': '{ not json',
      'monday/Pairs/2025-26/meta.json': JSON.stringify({ schemaVersion: 1, format: 'three' }),
      'monday/Pairs/2024-25/meta.json': JSON.stringify({
        schemaVersion: 1,
        format: 3,
        teams: [],
        players: [{ memberId: 1, teamId: null }]
      })
    })

    const snapshot = await buildMembersSnapshot(root, await scanLeaguesRoot(root))
    expect(snapshot.enabled).toBe(true)
    expect(snapshot.members).toEqual([])
    expect(snapshot.seasons.map((season) => season.season)).toEqual(['2024-25'])
    // Roster rows are not reported as unlinked while the master list itself cannot be read.
    expect(snapshot.problems).toEqual([
      expect.objectContaining({
        kind: 'invalid-file',
        path: join(root, 'members.json'),
        message: expect.stringContaining('members.json is not valid JSON')
      }),
      expect.objectContaining({
        kind: 'invalid-file',
        path: join(root, 'monday/Pairs/2025-26'),
        message: expect.stringContaining('meta.json has an unexpected shape at format')
      })
    ])
  })
})
