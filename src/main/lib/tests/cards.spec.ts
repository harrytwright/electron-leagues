import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { Member } from '../../../shared/members'
import { cardSheetFolder, clearCardSheets, generateCardSheet, renderCardSheetHtml } from '../cards'

let outputDir: string

const members: Member[] = [
  { id: 7, firstName: 'Ann', lastName: 'Lee <Jr>', mbdIds: [], aliases: [], marketing: true },
  { id: 12, firstName: 'Bob', lastName: 'Kay', mbdIds: [], aliases: [], marketing: true }
]

beforeEach(async () => {
  outputDir = await mkdtemp(join(tmpdir(), 'leagues-cards-'))
})

afterEach(async () => {
  await rm(outputDir, { recursive: true, force: true })
})

test('renders one card per member with the padded number and a barcode of the raw id', () => {
  const html = renderCardSheetHtml({ members, nextId: 13, title: 'Go Bowling <Leeds>' })
  expect(html.match(/class="card"/g)).toHaveLength(2)
  expect(html).toContain('<div class="name">Ann Lee &lt;Jr&gt;</div>')
  expect(html).toContain('<div class="club">Go Bowling &lt;Leeds&gt;</div>')
  expect(html).toContain('<div class="number">000007</div>')
  expect(html).toContain('aria-label="7"')
  expect(html).toContain('aria-label="12"')
})

test('writes the sheet into a private folder with a timestamped name, cleared on request', async () => {
  const rendered: string[] = []
  const path = await generateCardSheet({
    members,
    nextId: 13,
    title: 'Club',
    tempRoot: outputDir,
    now: new Date('2026-09-18T10:30:00Z'),
    renderPdf: async (html) => {
      rendered.push(html)
      return Buffer.from('%PDF-cards')
    }
  })
  expect(path).toBe(join(cardSheetFolder(outputDir), 'Member cards 2026-09-18T10-30-00-000Z.pdf'))
  expect(await readFile(path, 'utf8')).toBe('%PDF-cards')
  expect(rendered[0]).toContain('000012')
  // Windows has no POSIX mode bits, so the check reads back whatever it finds there.
  const posix = process.platform !== 'win32'
  const folderMode = (await stat(cardSheetFolder(outputDir))).mode & 0o777
  const fileMode = (await stat(path)).mode & 0o777
  expect(folderMode).toBe(posix ? 0o700 : folderMode)
  expect(fileMode).toBe(posix ? 0o600 : fileMode)

  await clearCardSheets(outputDir)
  expect(await readdir(outputDir)).toEqual([])
  await clearCardSheets(outputDir)
})
