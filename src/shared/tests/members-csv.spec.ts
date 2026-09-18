import { expect, test } from 'vitest'
import { membersCsv } from '../members-csv'
import type { Member } from '../members'

function member(overrides: Partial<Member> & Pick<Member, 'id'>): Member {
  return {
    firstName: 'Jane',
    lastName: 'Doe',
    mbdIds: [],
    aliases: [],
    marketing: true,
    ...overrides
  }
}

test('writes a spreadsheet-friendly file with each member’s one contact and no live formulas', () => {
  const csv = membersCsv(
    [
      member({
        id: 7,
        firstName: 'Ann',
        lastName: 'Lee, "Annie"',
        dob: '1990-05-04',
        gender: 'female',
        email: 'ann@example.org',
        phone: '07700 900000',
        mbdIds: ['10', '11'],
        aliases: ['Annie Lee'],
        guardianContact: 'Left over from junior days',
        cardIssued: '2026-09-18',
        notes: 'Line one\nline two'
      }),
      member({
        id: 8,
        firstName: 'Kid',
        lastName: 'Lee',
        dob: '2015-01-01',
        email: 'should-not-appear@example.org',
        guardianContact: 'Ann Lee 07700 900000',
        marketing: false,
        notes: '=HYPERLINK("x")'
      })
    ],
    { nextId: 9, today: new Date(2026, 8, 18) }
  )
  const lines = csv.split('\r\n')
  expect(lines[0]).toBe(
    '\uFEFFNumber,First name,Last name,Date of birth,Gender,Email,Phone,Guardian contact,MBD IDs,Aliases,Marketing,Card issued,Notes'
  )
  expect(lines[1]).toBe(
    '000007,Ann,"Lee, ""Annie""",1990-05-04,female,ann@example.org,07700 900000,,10; 11,Annie Lee,yes,2026-09-18,"Line one\nline two"'
  )
  expect(lines[2]).toBe(
    '000008,Kid,Lee,2015-01-01,,,,Ann Lee 07700 900000,,,no,,"\'=HYPERLINK(""x"")"'
  )
  expect(lines[3]).toBe('')
})
