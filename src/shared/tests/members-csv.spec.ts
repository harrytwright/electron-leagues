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

test('a junior with a linked guardian carries that member’s name and contact', () => {
  const guardian = member({
    id: 7,
    firstName: 'Ann',
    lastName: 'Lee',
    dob: '1990-05-04',
    email: 'ann@example.org',
    phone: '07700 900000'
  })
  const junior = member({
    id: 8,
    firstName: 'Kid',
    lastName: 'Lee',
    dob: '2015-01-01',
    guardianMemberId: 7,
    guardianContact: 'Collects on Tuesdays'
  })
  const csv = membersCsv([junior], {
    nextId: 9,
    today: new Date(2026, 8, 18),
    members: [guardian, junior]
  })
  // The guardian's own contact comes first; the free text typed at the desk is kept too.
  expect(csv.split('\r\n')[1]).toBe(
    '000008,Kid,Lee,2015-01-01,,,,"Ann Lee, ann@example.org, 07700 900000, Collects on Tuesdays",,,yes,,'
  )
})

test('a marketing export drops an opted-out or deleted guardian’s contact, not just the free text', () => {
  const optedOut = member({
    id: 7,
    firstName: 'Ann',
    lastName: 'Lee',
    email: 'ann@example.org',
    marketing: false
  })
  const deleted = member({
    id: 9,
    firstName: 'Cal',
    lastName: 'Lee',
    email: 'cal@example.org',
    deleted: true
  })
  const juniorOfOptedOut = member({
    id: 8,
    firstName: 'Kid',
    lastName: 'Lee',
    dob: '2015-01-01',
    guardianMemberId: 7,
    // Free text seeded from the same guardian at link time; a marketing export must not
    // leak it as a fallback once the link itself is found unusable for that export.
    guardianContact: 'Ask at the desk'
  })
  const juniorOfDeleted = member({
    id: 10,
    firstName: 'Sam',
    lastName: 'Lee',
    dob: '2015-01-01',
    guardianMemberId: 9
  })
  const juniorWithNoLink = member({
    id: 11,
    firstName: 'Max',
    lastName: 'Lee',
    dob: '2015-01-01',
    guardianContact: 'Gran, gran@example.org'
  })
  const csv = membersCsv([juniorOfOptedOut, juniorOfDeleted, juniorWithNoLink], {
    nextId: 12,
    today: new Date(2026, 8, 18),
    members: [optedOut, deleted, juniorOfOptedOut, juniorOfDeleted, juniorWithNoLink],
    marketingOnly: true
  })
  const lines = csv.split('\r\n')
  // A linked guardian who is not usable for marketing yields nothing, not the free text.
  expect(lines[1]).toBe('000008,Kid,Lee,2015-01-01,,,,,,,yes,,')
  expect(lines[2]).toBe('000010,Sam,Lee,2015-01-01,,,,,,,yes,,')
  // A junior with no link at all still falls back to free text.
  expect(lines[3]).toBe('000011,Max,Lee,2015-01-01,,,,"Gran, gran@example.org",,,yes,,')
})
