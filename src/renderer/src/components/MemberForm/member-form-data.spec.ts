import { expect, it } from 'vitest'
import { makeMember } from '@renderer/tests/fixtures'
import { guardianCandidates, memberDraftFrom, sameMemberDraft } from './member-form-data'

const today = new Date(2026, 8, 27)
const juniorDob = `${today.getFullYear() - 10}-01-01`

it('offers only live, adult, uniquely numbered records other than the one being edited', () => {
  const members = [
    makeMember({ id: 1, firstName: 'Ann', lastName: 'Lee' }),
    makeMember({ id: 2, firstName: 'Gone', lastName: 'Away', deleted: true }),
    makeMember({ id: 3, firstName: 'Old', lastName: 'Name', mergedInto: 1 }),
    makeMember({ id: 4, firstName: 'Kid', lastName: 'Lee', dob: juniorDob }),
    makeMember({ id: 5, firstName: 'Dup', lastName: 'One' }),
    makeMember({ id: 5, firstName: 'Dup', lastName: 'Two' }),
    makeMember({ id: 6, firstName: 'Self', lastName: 'Editing' })
  ]

  const candidates = guardianCandidates(members, 6, today)

  expect(candidates.map((member) => member.id)).toEqual([1])
})

it('keeps the currently linked guardian visible even when it would otherwise be excluded', () => {
  const deletedGuardian = makeMember({ id: 2, firstName: 'Gone', lastName: 'Away', deleted: true })
  const mergedGuardian = makeMember({ id: 3, firstName: 'Old', lastName: 'Name', mergedInto: 1 })
  const juniorGuardian = makeMember({ id: 4, firstName: 'Kid', lastName: 'Lee', dob: juniorDob })
  const members = [
    makeMember({ id: 1, firstName: 'Ann', lastName: 'Lee' }),
    deletedGuardian,
    mergedGuardian,
    juniorGuardian
  ]

  expect(guardianCandidates(members, undefined, today, 2)).toContain(deletedGuardian)
  expect(guardianCandidates(members, undefined, today, 3)).toContain(mergedGuardian)
  expect(guardianCandidates(members, undefined, today, 4)).toContain(juniorGuardian)
  // A linkedId that names nobody adds nothing extra; it is handled entirely in the form.
  expect(guardianCandidates(members, undefined, today, 999).map((member) => member.id)).toEqual([1])
})

it('treats a reordered alias or MBD id list as unchanged', () => {
  const a = memberDraftFrom(
    makeMember({ id: 1, aliases: ['Annie', 'A. Lee'], mbdIds: ['10', '11'] })
  )
  const b = memberDraftFrom(
    makeMember({ id: 1, aliases: ['A. Lee', 'Annie'], mbdIds: ['11', '10'] })
  )

  expect(sameMemberDraft(a, b)).toBe(true)
})

it('still catches a genuine change once order is ignored', () => {
  const a = memberDraftFrom(makeMember({ id: 1, aliases: ['Annie'] }))
  const b = memberDraftFrom(makeMember({ id: 1, aliases: ['Annie', 'Ann'] }))

  expect(sameMemberDraft(a, b)).toBe(false)
})
