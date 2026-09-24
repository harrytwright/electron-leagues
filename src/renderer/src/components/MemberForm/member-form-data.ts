import { GENDERS, type Gender, type Member, type MemberInput } from '@shared/members'

export const NO_GENDER = 'unset'

export interface MemberDraft {
  firstName: string
  lastName: string
  dob: string
  gender: string
  email: string
  phone: string
  guardianContact: string
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
  const notes = optional(draft.notes)
  if (notes) input.notes = notes
  return input
}
