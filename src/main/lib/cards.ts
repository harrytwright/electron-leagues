import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { code128Svg } from '../../shared/code128'
import { formatMemberNumber, memberDisplayName, type Member } from '../../shared/members'
import type { PdfRenderer } from './sign-in-sheet'

/** CR80, the size of a bank card, laid out eight to an A4 page. */
const CARD_WIDTH_MM = 85.6
const CARD_HEIGHT_MM = 54
const BARCODE_HEIGHT_MM = 12
const BARCODE_MODULE_MM = 0.33

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export interface CardSheetInput {
  members: readonly Member[]
  nextId: number
  /** The club name printed on every card. */
  title: string
}

function card(member: Member, input: CardSheetInput): string {
  const number = formatMemberNumber(member.id, input.nextId)
  return `<div class="card">
<div class="club">${escapeHtml(input.title)}</div>
<div class="name">${escapeHtml(memberDisplayName(member))}</div>
<div class="barcode">${code128Svg(String(member.id), { height: BARCODE_HEIGHT_MM, module: BARCODE_MODULE_MM })}</div>
<div class="number">${number}</div>
</div>`
}

/** The barcode carries the raw number; the printed number is padded for reading out. */
export function renderCardSheetHtml(input: CardSheetInput): string {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>${escapeHtml(input.title)} member cards</title>
<style>
@page { size: A4 portrait; margin: 12mm; }
body { margin: 0; font: 10pt system-ui, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; }
.sheet { display: grid; grid-template-columns: repeat(2, ${CARD_WIDTH_MM}mm); gap: 6mm 10mm; justify-content: center; }
.card { width: ${CARD_WIDTH_MM}mm; height: ${CARD_HEIGHT_MM}mm; box-sizing: border-box; padding: 4mm 5mm; border: 0.3mm dashed #999; border-radius: 3mm; display: flex; flex-direction: column; break-inside: avoid; }
.club { font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; color: #555; }
.name { font-size: 13pt; font-weight: 600; margin: 1.5mm 0 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.barcode svg { display: block; height: ${BARCODE_HEIGHT_MM}mm; max-width: 100%; }
.number { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 11pt; letter-spacing: 0.15em; text-align: center; margin-top: 1mm; }
</style>
</head>
<body>
<div class="sheet">
${input.members.map((member) => card(member, input)).join('\n')}
</div>
</body>
</html>
`
}

/** Sheets sit in a folder only this user can read, under the system temporary folder. */
const CARD_SHEET_FOLDER = 'gobowling-leagues-cards'

export function cardSheetFolder(tempRoot: string): string {
  return join(tempRoot, CARD_SHEET_FOLDER)
}

export interface CardSheetOptions extends CardSheetInput {
  /** The system temporary folder; the sheet is printed from there and cleared on quit. */
  tempRoot: string
  renderPdf: PdfRenderer
  now: Date
}

/** Write the sheet and give back its path; nothing in the leagues folder changes. */
export async function generateCardSheet(options: CardSheetOptions): Promise<string> {
  const folder = cardSheetFolder(options.tempRoot)
  await mkdir(folder, { recursive: true, mode: 0o700 })
  const stamp = options.now.toISOString().replace(/[:.]/g, '-')
  const path = join(folder, `Member cards ${stamp}.pdf`)
  const pdf = await options.renderPdf(renderCardSheetHtml(options))
  await writeFile(path, pdf, { mode: 0o600 })
  return path
}

/** Names on a card sheet are personal data; nothing of them outlives the app. */
export async function clearCardSheets(tempRoot: string): Promise<void> {
  await rm(cardSheetFolder(tempRoot), { recursive: true, force: true })
}
