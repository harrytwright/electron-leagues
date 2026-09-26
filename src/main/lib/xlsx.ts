import AdmZip from 'adm-zip'
import type { DelimitedTable } from '../../shared/imports'
import { UserFacingError } from './fs-errors'

/** Excel counts days from a phantom 29 February 1900, so days before it sit one day later. */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30)
const EXCEL_EARLY_EPOCH_MS = Date.UTC(1899, 11, 31)
const EXCEL_LEAP_BUG_SERIAL = 60
const DAY_MS = 86_400_000

function decodeEntities(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replaceAll('&amp;', '&')
}

/** Every `<t>` run inside an element, joined: rich text splits one string across several. */
function textRuns(xml: string): string {
  return decodeEntities(
    [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => match[1]).join('')
  )
}

function sharedStrings(zip: AdmZip): string[] {
  const entry = zip.getEntry('xl/sharedStrings.xml')
  if (!entry) return []
  const xml = entry.getData().toString('utf8')
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => textRuns(match[1]))
}

/** Which cell styles carry a date format, so a serial number can be read back as a day. */
function dateStyles(zip: AdmZip): Set<number> {
  const entry = zip.getEntry('xl/styles.xml')
  if (!entry) return new Set()
  const xml = entry.getData().toString('utf8')
  const dateFormats = new Set<string>(['14', '15', '16', '17', '22'])
  for (const match of xml.matchAll(/<numFmt\s[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    const code = match[2].replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '')
    if (/[dmy]/i.test(code) && !/[#0]/.test(code)) dateFormats.add(match[1])
  }
  const cellXfs = xml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)
  if (!cellXfs) return new Set()
  const styles = new Set<number>()
  ;[...cellXfs[1].matchAll(/<xf\s[^>]*>|<xf\s[^>]*\/>/g)].forEach((match, index) => {
    const id = match[0].match(/numFmtId="(\d+)"/)
    if (id && dateFormats.has(id[1])) styles.add(index)
  })
  return styles
}

function isoDateFromSerial(serial: number): string {
  const days = Math.round(serial)
  const epoch = days < EXCEL_LEAP_BUG_SERIAL ? EXCEL_EARLY_EPOCH_MS : EXCEL_EPOCH_MS
  return new Date(epoch + days * DAY_MS).toISOString().slice(0, 10)
}

function columnIndex(reference: string): number {
  let index = 0
  for (const char of reference.replace(/\d+$/, '')) {
    index = index * 26 + (char.charCodeAt(0) - 64)
  }
  return index - 1
}

function firstSheetPath(zip: AdmZip): string {
  const workbook = zip.getEntry('xl/workbook.xml')?.getData().toString('utf8') ?? ''
  const rels = zip.getEntry('xl/_rels/workbook.xml.rels')?.getData().toString('utf8') ?? ''
  const sheet = workbook.match(/<sheet\s[^>]*r:id="([^"]+)"/)
  const target = sheet
    ? rels.match(new RegExp(`<Relationship\\s[^>]*Id="${sheet[1]}"[^>]*Target="([^"]+)"`))
    : null
  if (target) return target[1].startsWith('/') ? target[1].slice(1) : `xl/${target[1]}`
  return 'xl/worksheets/sheet1.xml'
}

/**
 * The first sheet of a workbook as text cells, the way a CSV of it would read:
 * shared and inline strings, numbers as typed, dates as ISO days, blanks as empty.
 * Only what a bowler export needs; formulas are read by their cached value.
 */
export function readXlsxTable(bytes: Buffer): DelimitedTable {
  let zip: AdmZip
  try {
    zip = new AdmZip(bytes)
  } catch {
    throw new UserFacingError('This file is not a workbook Excel can open')
  }
  const strings = sharedStrings(zip)
  const dates = dateStyles(zip)
  const sheet = zip.getEntry(firstSheetPath(zip))
  if (!sheet) throw new UserFacingError('This workbook has no sheet to read')
  const xml = sheet.getData().toString('utf8')
  const records: string[][] = []
  for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = []
    for (const cell of row[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cell[1]
      const body = cell[2] ?? ''
      const reference = attributes.match(/\br="([A-Z]+)\d*"/)
      if (!reference) continue
      const index = columnIndex(reference[1])
      const type = attributes.match(/\bt="([^"]+)"/)?.[1]
      const style = attributes.match(/\bs="(\d+)"/)?.[1]
      const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? ''
      let text: string
      if (type === 's') text = value === '' ? '' : (strings[Number(value)] ?? '')
      else if (type === 'inlineStr' || type === 'str')
        text = type === 'str' ? decodeEntities(value) : textRuns(body)
      else if (type === 'b') text = value === '1' ? 'TRUE' : 'FALSE'
      else if (value !== '' && style !== undefined && dates.has(Number(style))) {
        text = isoDateFromSerial(Number(value))
      } else text = decodeEntities(value)
      while (cells.length < index) cells.push('')
      cells[index] = text.trim()
    }
    records.push(cells)
  }
  const [header = [], ...rows] = records.filter((cells) => cells.some((cell) => cell !== ''))
  const columns = header.map((cell) => cell.trim())
  return { columns, rows: rows.map((row) => columns.map((_, index) => row[index] ?? '')) }
}
