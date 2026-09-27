import {
  formatMemberNumber,
  GENDERS,
  memberDisplayName,
  type Gender,
  type Member,
  type MemberInput
} from '@shared/members'
import { sentenceCase } from '@renderer/lib/sentence-case'

export const NO_GENDER = 'unset'

export const GENDER_ITEMS = {
  [NO_GENDER]: 'Not recorded',
  ...Object.fromEntries(GENDERS.map((gender) => [gender, sentenceCase(gender)]))
}

export interface MemberDraft {
  firstName: string
  lastName: string
  dob: string
  gender: string
  email: string
  phone: string
  guardianContact: string
  /** The linked guardian's member number, or null for none. */
  guardianMemberId: number | null
  marketing: boolean
  notes: string
  mbdIds: string
  aliases: string
}

export function memberDraftFrom(member: Member | null): MemberDraft {
  return {
    firstName: member?.firstName ?? '',
    lastName: member?.lastName ?? '',
    dob: member?.dob ?? '',
    gender: member?.gender ?? NO_GENDER,
    email: member?.email ?? '',
    phone: member?.phone ?? '',
    guardianContact: member?.guardianContact ?? '',
    guardianMemberId: member?.guardianMemberId ?? null,
    marketing: member?.marketing ?? true,
    notes: member?.notes ?? '',
    mbdIds: member?.mbdIds.join(', ') ?? '',
    aliases: member?.aliases.join(', ') ?? ''
  }
}

function list(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function optional(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function isGender(value: string): value is Gender {
  return GENDERS.some((gender) => gender === value)
}

export function memberInputFromDraft(draft: MemberDraft, member: Member | null): MemberInput {
  const input: MemberInput = {
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    mbdIds: list(draft.mbdIds),
    aliases: list(draft.aliases),
    marketing: draft.marketing
  }
  if (member) input.id = member.id
  if (member?.cardIssued) input.cardIssued = member.cardIssued
  const dob = optional(draft.dob)
  if (dob) input.dob = dob
  if (isGender(draft.gender)) input.gender = draft.gender
  const email = optional(draft.email)
  if (email) input.email = email
  const phone = optional(draft.phone)
  if (phone) input.phone = phone
  const guardianContact = optional(draft.guardianContact)
  if (guardianContact) input.guardianContact = guardianContact
  if (draft.guardianMemberId !== null) input.guardianMemberId = draft.guardianMemberId
  const notes = optional(draft.notes)
  if (notes) input.notes = notes
  return input
}

/** True when saving either draft would write the same record, so whitespace alone is no change. */
export function sameMemberDraft(a: MemberDraft, b: MemberDraft): boolean {
  const left = memberInputFromDraft(a, null)
  const right = memberInputFromDraft(b, null)
  return (
    left.firstName === right.firstName &&
    left.lastName === right.lastName &&
    left.dob === right.dob &&
    left.gender === right.gender &&
    left.email === right.email &&
    left.phone === right.phone &&
    left.guardianContact === right.guardianContact &&
    left.guardianMemberId === right.guardianMemberId &&
    left.marketing === right.marketing &&
    left.notes === right.notes &&
    left.mbdIds.join(',') === right.mbdIds.join(',') &&
    left.aliases.join(',') === right.aliases.join(',')
  )
}

/** Live records other than the one being edited, in list order, for the guardian picker. */
export function guardianCandidates(members: readonly Member[], selfId?: number): Member[] {
  return members.filter(
    (member) => !member.deleted && member.mergedInto === undefined && member.id !== selfId
  )
}

const EMAIL_IN_TEXT = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/
const PHONE_IN_TEXT = /(?:\+44\s?|0)\d(?:[\s-]?\d){8,10}/

/**
 * A blank adult form for a junior's guardian, seeded from the free text contact:
 * the email and phone it holds, and a note saying whose guardian this is and
 * what was written, so nothing typed at the desk is lost.
 */
export function guardianDraftFrom(junior: Member, nextId: number): MemberDraft {
  const text = junior.guardianContact ?? ''
  const draft = memberDraftFrom(null)
  draft.email = EMAIL_IN_TEXT.exec(text)?.[0] ?? ''
  draft.phone = PHONE_IN_TEXT.exec(text)?.[0]?.trim() ?? ''
  draft.marketing = junior.marketing
  const who = `${memberDisplayName(junior)} (${formatMemberNumber(junior.id, nextId)})`
  draft.notes = text ? `Guardian of ${who}. Contact given as: ${text}` : `Guardian of ${who}.`
  return draft
}
