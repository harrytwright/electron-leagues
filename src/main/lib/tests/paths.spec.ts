import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { assertInsideRoot, classifyTrashTarget, isInsideRoot } from '../paths'

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
