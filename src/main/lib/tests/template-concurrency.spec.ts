import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createSeason, repairReservedLocations, withTemplateLock } from '../operations'
import { readEntryMetadata } from '../template-workflows'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'leagues-template-races-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

test('season creation waits for an in-flight template transaction to finish writing', async () => {
  const source = join(root, 'bundle')
  const templates = join(root, '_templates')
  await Promise.all([
    mkdir(source),
    mkdir(templates),
    mkdir(join(root, 'monday/Pairs'), { recursive: true })
  ])
  await writeFile(join(source, 'Rules.docx'), 'complete rules')
  await writeFile(join(source, 'Sign-In Sheet.docx'), 'sign-in')
  await writeFile(join(templates, 'Sign-In Sheet.docx'), 'sign-in')

  const started = Promise.withResolvers<void>()
  const finishCopy = Promise.withResolvers<void>()
  const repairing = withTemplateLock(root, async () => {
    const target = join(templates, 'Rules.docx')
    await writeFile(target, 'partial')
    started.resolve()
    await finishCopy.promise
    await writeFile(target, 'complete rules')
  })
  await started.promise
  let created = false
  const creating = createSeason({
    root,
    day: 'monday',
    leagueFolder: 'Pairs',
    seasonName: '2026-27',
    source: 'templates',
    archiveOldest: false
  }).then((result) => {
    created = true
    return result
  })
  try {
    await delay(50)
    expect(created).toBe(false)
  } finally {
    finishCopy.resolve()
    await repairing
    await creating
  }
  expect(await readFile(join(root, 'monday/Pairs/2026-27/Rules.docx'), 'utf8')).toBe(
    'complete rules'
  )
})

test('a failed repair releases the queue for a subsequent attempt', async () => {
  await writeFile(join(root, '_shared'), 'conflict')
  await expect(repairReservedLocations(root)).rejects.toThrow(/not a folder/)
  await rm(join(root, '_shared'))
  await expect(repairReservedLocations(root)).resolves.toMatchObject({ warnings: [] })
})

test('metadata skips hidden names before statting and tolerates vanished children', async () => {
  await writeFile(join(root, '.temporary'), 'hidden')
  await writeFile(join(root, 'temporary.docx'), 'vanishing')
  await writeFile(join(root, 'Rules.docx'), 'rules')
  const snapshot = await readdir(root)
  await rm(join(root, 'temporary.docx'))

  expect((await readEntryMetadata(root, snapshot)).map((file) => file.relativePath)).toEqual([
    'Rules.docx'
  ])
})

test('metadata errors other than a vanished child are still surfaced', async () => {
  await writeFile(join(root, 'Rules.docx'), 'rules')
  await expect(readEntryMetadata(join(root, 'Rules.docx'), ['child'])).rejects.toMatchObject({
    code: 'ENOTDIR'
  })
})
