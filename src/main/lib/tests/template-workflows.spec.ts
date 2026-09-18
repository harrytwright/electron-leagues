import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  executeCopyPlan,
  FILE_RULES,
  readDirectMetadata,
  WORKFLOW_HANDLERS,
  type FileMetadata
} from '../template-workflows'

let root: string

const file = (relativePath: string): FileMetadata => ({
  relativePath,
  kind: 'file',
  size: 10,
  mtimeMs: 100
})

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'leagues-workflows-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('workflow planning', () => {
  test('fill-missing considers current destination metadata and plans no writes itself', async () => {
    const current = [file('Rules.docx')]
    const templates = [file('Rules.docx'), file('Players.xlsx')]
    await expect(FILE_RULES['fill-missing'](current, templates)).resolves.toEqual({
      copies: [{ source: 'templates', relativePath: 'Players.xlsx' }],
      skips: [{ relativePath: 'Rules.docx', reason: 'already-present' }]
    })
  })

  test('a season file is never copied forward, from the previous season or a template', async () => {
    const previous = [file('meta.json'), file('Rules.docx')]
    const templates = [file('meta.json')]
    await expect(WORKFLOW_HANDLERS.previous(previous, templates)).resolves.toEqual({
      copies: [{ source: 'current', relativePath: 'Rules.docx' }],
      skips: [
        { relativePath: 'meta.json', reason: 'reserved' },
        { relativePath: 'meta.json', reason: 'reserved' }
      ]
    })
  })

  test('a generated sign-in sheet stays with its own season', async () => {
    const previous = [file('Sign-In Sheet.pdf'), file('Sign-In Sheet.docx')]
    await expect(WORKFLOW_HANDLERS.previous(previous, [])).resolves.toEqual({
      copies: [{ source: 'current', relativePath: 'Sign-In Sheet.docx' }],
      skips: [{ relativePath: 'Sign-In Sheet.pdf', reason: 'generated' }]
    })
  })

  test('previous wins filename collisions before templates fill gaps', async () => {
    const result = await WORKFLOW_HANDLERS.previous(
      [file('Players.xlsx'), file('.private'), { ...file('folder'), kind: 'directory' }],
      [file('Players.xlsx'), file('Rules.docx')]
    )
    expect(result.copies).toEqual([
      { source: 'current', relativePath: 'Players.xlsx' },
      { source: 'templates', relativePath: 'Rules.docx' }
    ])
    expect(result.skips).toEqual(
      expect.arrayContaining([
        { relativePath: '.private', reason: 'hidden' },
        { relativePath: 'folder', reason: 'not-file' },
        { relativePath: 'Players.xlsx', reason: 'already-present' }
      ])
    )
  })
})

describe('exclusive copy execution', () => {
  test('a destination created after planning is skipped, never overwritten', async () => {
    const templates = join(root, 'templates')
    const destination = join(root, 'destination')
    await Promise.all([mkdir(templates), mkdir(destination)])
    await writeFile(join(templates, 'Rules.docx'), 'template')
    const plan = await FILE_RULES['fill-missing']([], await readDirectMetadata(templates))
    await writeFile(join(destination, 'Rules.docx'), 'won race')

    await expect(executeCopyPlan(plan, { templates, destination })).resolves.toEqual({
      added: [],
      skipped: ['Rules.docx']
    })
    expect(await readFile(join(destination, 'Rules.docx'), 'utf8')).toBe('won race')
  })

  test('rejects a source swapped for an outside symlink after planning', async () => {
    const templates = join(root, 'templates')
    const destination = join(root, 'destination')
    const outside = join(root, 'outside.docx')
    await Promise.all([mkdir(templates), mkdir(destination)])
    await writeFile(join(templates, 'Rules.docx'), 'template')
    await writeFile(outside, 'outside')
    const plan = await FILE_RULES['fill-missing']([], await readDirectMetadata(templates))
    await rm(join(templates, 'Rules.docx'))
    await symlink(outside, join(templates, 'Rules.docx'))

    await expect(executeCopyPlan(plan, { templates, destination })).rejects.toThrow(
      /outside|regular file/
    )
  })
})
