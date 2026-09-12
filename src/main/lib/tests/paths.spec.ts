import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { UserFacingError } from '../fs-errors'
import {
  assertInsideRoot,
  classifyTrashTarget,
  isInsideRoot,
  planTrash,
  resolveImportDestination
} from '../paths'

let root: string
let outside: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'leagues-paths-'))
  outside = await mkdtemp(join(tmpdir(), 'leagues-outside-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe('isInsideRoot', () => {
  test('accepts descendants and rejects the root itself', () => {
    expect(isInsideRoot(root, join(root, 'monday'))).toBe(true)
    expect(isInsideRoot(root, join(root, 'monday', 'League', '2025-26'))).toBe(true)
    expect(isInsideRoot(root, root)).toBe(false)
    expect(isInsideRoot(root, `${root}${sep}`)).toBe(false)
  })

  test('rejects parent traversal, siblings and unrelated absolute paths', () => {
    expect(isInsideRoot(root, join(root, '..'))).toBe(false)
    expect(isInsideRoot(root, join(root, 'monday', '..', '..', 'etc'))).toBe(false)
    expect(isInsideRoot(root, `${root}-sibling`)).toBe(false)
    expect(isInsideRoot(root, outside)).toBe(false)
  })

  test('a folder whose name merely starts with two dots is still inside', () => {
    expect(isInsideRoot(root, join(root, '..dots'))).toBe(true)
  })
})

describe('assertInsideRoot', () => {
  test('returns the resolved path for a real descendant', async () => {
    await mkdir(join(root, 'monday'))
    await expect(assertInsideRoot(root, join(root, 'monday'))).resolves.toBe(join(root, 'monday'))
  })

  test('rejects paths outside the root', async () => {
    await expect(assertInsideRoot(root, outside)).rejects.toThrow(/outside the leagues folder/)
  })

  test('rejects a symlinked folder inside the root that points outside it', async () => {
    await symlink(outside, join(root, 'escape'))
    await expect(assertInsideRoot(root, join(root, 'escape'))).rejects.toThrow(
      /outside the leagues folder/
    )
  })

  test('rejects a symlinked file inside the root that points outside it', async () => {
    await writeFile(join(outside, 'secret.txt'), 'x')
    await symlink(join(outside, 'secret.txt'), join(root, 'secret.txt'))
    await expect(assertInsideRoot(root, join(root, 'secret.txt'))).rejects.toThrow(
      /outside the leagues folder/
    )
  })

  test('accepts a symlink that stays inside the root', async () => {
    await mkdir(join(root, 'monday'))
    await symlink(join(root, 'monday'), join(root, 'alias'))
    await expect(assertInsideRoot(root, join(root, 'alias'))).resolves.toBe(join(root, 'alias'))
  })

  test('accepts either spelling when the root itself is reached through a symlink', async () => {
    await mkdir(join(root, 'monday'))
    const linkRoot = join(outside, 'link-root')
    await symlink(root, linkRoot)
    await expect(assertInsideRoot(linkRoot, join(root, 'monday'))).resolves.toBeDefined()
    await expect(assertInsideRoot(root, join(linkRoot, 'monday'))).resolves.toBeDefined()
  })

  test('surfaces a missing target as ENOENT', async () => {
    await expect(assertInsideRoot(root, join(root, 'missing'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  test('allows the root only when the caller opts in', async () => {
    await expect(assertInsideRoot(root, root)).rejects.toThrow(/outside the leagues folder/)
    await expect(assertInsideRoot(root, root, { allowRoot: true })).resolves.toBe(root)
  })
})

describe('resolveImportDestination', () => {
  test.each([
    ['live league', 'monday/Pairs'],
    ['live season child', 'monday/Pairs/2025-26/results'],
    ['shared', '_shared'],
    ['templates', '_templates/nested'],
    ['root-level other item', 'Notes'],
    ['root-level underscored item', '_Notes']
  ])('accepts a %s destination', async (_label, requested) => {
    await mkdir(join(root, requested), { recursive: true })
    await expect(resolveImportDestination(root, join(root, requested))).resolves.toBe(
      join(root, requested)
    )
  })

  test.each(['', '_archives/Pairs', 'monday', 'monday/Pairs/not-a-season', '_unknown/nested'])(
    'rejects the disallowed layout %j',
    async (requested) => {
      const destination = requested ? join(root, requested) : root
      await expect(resolveImportDestination(root, destination)).rejects.toBeInstanceOf(
        UserFacingError
      )
    }
  )

  test('rejects an in-root destination alias', async () => {
    await mkdir(join(root, '_shared'), { recursive: true })
    await mkdir(join(root, 'monday/Pairs'), { recursive: true })
    await symlink(join(root, '_shared'), join(root, 'monday/Pairs/2025-26'))

    await expect(
      resolveImportDestination(root, join(root, 'monday/Pairs/2025-26'))
    ).rejects.toThrow(/does not match/)
  })
})

describe('classifyTrashTarget', () => {
  test('recognises league and season folders', () => {
    expect(classifyTrashTarget(root, join(root, 'monday', 'Mens Triples'))).toBe('league')
    expect(classifyTrashTarget(root, join(root, 'monday', 'Mens Triples', '2025-26'))).toBe(
      'season'
    )
    expect(classifyTrashTarget(root, join(root, 'friday', 'Trios', '2026-Q1'))).toBe('season')
  })

  test('rejects everything else', () => {
    expect(classifyTrashTarget(root, root)).toBeNull()
    expect(classifyTrashTarget(root, join(root, 'monday'))).toBeNull()
    expect(classifyTrashTarget(root, join(root, '_templates'))).toBeNull()
    expect(classifyTrashTarget(root, join(root, '_archives', 'Mens Triples'))).toBeNull()
    expect(classifyTrashTarget(root, join(root, 'monday', 'Mens Triples', 'Old Stuff'))).toBeNull()
    expect(
      classifyTrashTarget(root, join(root, 'monday', 'Mens Triples', '2025-26', 'Rules.docx'))
    ).toBeNull()
    expect(classifyTrashTarget(root, join(outside, 'monday', 'Mens Triples'))).toBeNull()
  })
})

describe('planTrash', () => {
  const league = (): string => join(root, 'monday', 'Mens Triples')

  test('a league with archives trashes the archive first, then the league', async () => {
    await mkdir(join(league(), '2025-26'), { recursive: true })
    await mkdir(join(root, '_archives', 'Mens Triples', '2023-24'), { recursive: true })
    await expect(planTrash(root, league())).resolves.toEqual({
      kind: 'league',
      paths: [join(root, '_archives', 'Mens Triples'), league()]
    })
  })

  test('a league without archives trashes only itself', async () => {
    await mkdir(league(), { recursive: true })
    await expect(planTrash(root, league())).resolves.toEqual({
      kind: 'league',
      paths: [league()]
    })
  })

  test('a season never touches the archives', async () => {
    await mkdir(join(league(), '2025-26'), { recursive: true })
    await mkdir(join(root, '_archives', 'Mens Triples', '2023-24'), { recursive: true })
    await expect(planTrash(root, join(league(), '2025-26'))).resolves.toEqual({
      kind: 'season',
      paths: [join(league(), '2025-26')]
    })
  })

  test('rejects files, wrong depths and anything outside the root as user-facing errors', async () => {
    await mkdir(league(), { recursive: true })
    await writeFile(join(root, 'monday', 'stray.docx'), 'x')
    await writeFile(join(league(), '2024'), 'a file named like a season')
    const cases = [
      join(root, 'monday', 'stray.docx'),
      join(league(), '2024'),
      join(root, 'monday'),
      root,
      outside
    ]
    for (const target of cases) {
      const err = await planTrash(root, target).catch((e: Error) => e)
      expect(err, target).toBeInstanceOf(UserFacingError)
    }
  })

  test('a target that already vanished gets a friendly message', async () => {
    await expect(planTrash(root, join(root, 'monday', 'Ghost'))).rejects.toThrow(
      'That folder no longer exists'
    )
  })
})
