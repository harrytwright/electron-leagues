import { formatMemberNumber, isUnder18, type Member } from './members'

/** Excel reads a file as UTF-8 only when it starts with a byte order mark. */
const BOM = '\uFEFF'

const COLUMNS = [
  'Number',
  'First name',
  'Last name',
  'Date of birth',
  'Gender',
  'Email',
  'Phone',
  'Guardian contact',
  'MBD IDs',
  'Aliases',
  'Marketing',
  'Card issued',
  'Notes'
] as const

/** A cell a spreadsheet would run as a formula is written as text instead. */
function csvCell(value: string): string {
  const text = /^[=+\-@]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export interface MembersCsvOptions {
  nextId: number
  today: Date
}

/**
 * One row per member in the order given, as a spreadsheet opens it: a byte order
 * mark so Excel reads UTF-8, CRLF line ends. Under-18s carry their guardian's
 * contact and never their own, even if a record somehow holds one; adults carry
 * only their own, whatever guardian contact is still on file.
 */
export function membersCsv(members: readonly Member[], options: MembersCsvOptions): string {
  const lines = [COLUMNS.join(',')]
  for (const member of members) {
    const junior = isUnder18(member, options.today)
    const row = [
      formatMemberNumber(member.id, options.nextId),
      member.firstName,
      member.lastName,
      member.dob ?? '',
      member.gender ?? '',
      junior ? '' : (member.email ?? ''),
      junior ? '' : (member.phone ?? ''),
      junior ? (member.guardianContact ?? '') : '',
      member.mbdIds.join('; '),
      member.aliases.join('; '),
      member.marketing ? 'yes' : 'no',
      member.cardIssued ?? '',
      member.notes ?? ''
    ]
    lines.push(row.map(csvCell).join(','))
  }
  return `${BOM}${lines.join('\r\n')}\r\n`
}
