import { forwardRef } from 'react'
import { Button, Checkbox, Combobox, Input, Select, Text, Textarea } from '@cloudflare/kumo'
import {
  formatMemberNumber,
  isUnder18,
  memberDisplayName,
  resolveMember,
  type Member
} from '@shared/members'
import { DateField } from '../DateField'
import { GENDER_ITEMS, type MemberDraft } from './member-form-data'

const OLDEST_BIRTH_YEARS = 100
const TYPICAL_AGE = 30

interface Props {
  draft: MemberDraft
  /** Members a junior may be linked to as their guardian: live records other than this one. */
  guardians: readonly Member[]
  nextId: number
  errorId?: string
  invalidNames?: { firstName: boolean; lastName: boolean }
  onChange: <Key extends keyof MemberDraft>(key: Key, value: MemberDraft[Key]) => void
}

/**
 * The Combobox label for a guardian: a deleted record reads "(removed)", but one that was
 * merged into another number still works (`guardianOf` follows the merge), so it is named
 * by its survivor instead of being flagged as gone.
 */
function guardianOptionLabel(
  guardian: Member,
  guardians: readonly Member[],
  nextId: number
): string {
  const base = `${formatMemberNumber(guardian.id, nextId)} ${memberDisplayName(guardian)}`
  if (guardian.deleted) return `${base} (removed)`
  if (guardian.mergedInto !== undefined) {
    const survivor = resolveMember(guardians, guardian.id)
    return survivor
      ? `${base} (merged into ${formatMemberNumber(survivor.id, nextId)} ${memberDisplayName(survivor)})`
      : `${base} (removed)`
  }
  return base
}

function GuardianLinkField({
  draft,
  guardians,
  nextId,
  junior,
  onChange
}: {
  draft: MemberDraft
  guardians: readonly Member[]
  nextId: number
  /** An adult only ever sees the stale row below, with a Remove control, never the picker. */
  junior: boolean
  onChange: Props['onChange']
}): React.JSX.Element {
  const linkedId = draft.guardianMemberId
  const linkedGuardian = guardians.find((guardian) => guardian.id === linkedId) ?? null

  if (!junior || (linkedId !== null && linkedGuardian === null)) {
    const label = linkedGuardian
      ? guardianOptionLabel(linkedGuardian, guardians, nextId)
      : linkedId !== null
        ? `Member ${formatMemberNumber(linkedId, nextId)} (no longer on the list)`
        : 'None'
    return (
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Linked guardian</span>
        <div className="flex items-center justify-between gap-3 rounded-md px-3 py-2 ring ring-kumo-line">
          <Text variant="secondary">{label}</Text>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange('guardianMemberId', null)}
          >
            Remove the linked guardian
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Combobox<Member>
      label="Linked guardian"
      description="A member whose own contact details stand in for this person"
      items={guardians}
      value={linkedGuardian}
      onValueChange={(guardian) => onChange('guardianMemberId', guardian?.id ?? null)}
      itemToStringLabel={(guardian) => guardianOptionLabel(guardian, guardians, nextId)}
      autoComplete="off"
    >
      <Combobox.TriggerInput
        placeholder="Name or member number"
        clearLabel="Remove the linked guardian"
      />
      <Combobox.Content>
        <Combobox.Empty>No members match.</Combobox.Empty>
        <Combobox.List>
          {(guardian: Member) => (
            <Combobox.Item key={guardian.id} value={guardian}>
              {guardianOptionLabel(guardian, guardians, nextId)}
            </Combobox.Item>
          )}
        </Combobox.List>
      </Combobox.Content>
    </Combobox>
  )
}

export const MemberForm = forwardRef<HTMLInputElement, Props>(function MemberForm(
  { draft, guardians, nextId, errorId, invalidNames, onChange },
  firstNameRef
) {
  const junior = draft.dob !== '' && isUnder18({ dob: draft.dob }, new Date())
  const thisYear = new Date().getFullYear()
  const linkedGuardian =
    guardians.find((guardian) => guardian.id === draft.guardianMemberId) ?? null
  const showGuardianLink = junior || draft.guardianMemberId !== null

  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-semibold">Personal details</legend>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">
          <Input
            ref={firstNameRef}
            label="First name"
            name="first-name"
            autoComplete="off"
            autoFocus
            value={draft.firstName}
            aria-invalid={invalidNames?.firstName || undefined}
            aria-describedby={invalidNames?.firstName ? errorId : undefined}
            onChange={(event) => onChange('firstName', event.target.value)}
          />
          <Input
            label="Last name"
            name="last-name"
            autoComplete="off"
            value={draft.lastName}
            aria-invalid={invalidNames?.lastName || undefined}
            aria-describedby={invalidNames?.lastName ? errorId : undefined}
            onChange={(event) => onChange('lastName', event.target.value)}
          />
          <DateField
            label="Date of birth"
            name="dob"
            value={draft.dob}
            onChange={(value) => onChange('dob', value)}
            fromYear={thisYear - OLDEST_BIRTH_YEARS}
            toYear={thisYear}
            openAt={new Date(thisYear - TYPICAL_AGE, 0)}
          />
          <Select
            label="Gender"
            value={draft.gender}
            items={GENDER_ITEMS}
            onValueChange={(value) => {
              if (value) onChange('gender', value)
            }}
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-3 border-t border-kumo-line pt-4">
        <legend className="px-1 text-sm font-semibold">Contact details</legend>
        {junior ? (
          <div className="grid gap-3">
            <GuardianLinkField
              draft={draft}
              guardians={guardians}
              nextId={nextId}
              junior={junior}
              onChange={onChange}
            />
            <div className="grid gap-1.5">
              <Input
                label="Parent or guardian contact"
                name="guardian-contact"
                autoComplete="off"
                value={draft.guardianContact}
                onChange={(event) => onChange('guardianContact', event.target.value)}
              />
              <Text variant="secondary" size="sm">
                {linkedGuardian
                  ? 'Anything else about reaching them. Their own contact details come from the linked record.'
                  : 'For under-18s, keep the parent or guardian’s details here rather than the young person’s own contact details.'}
              </Text>
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">
              <Input
                label="Email"
                name="email"
                type="email"
                autoComplete="off"
                value={draft.email}
                onChange={(event) => onChange('email', event.target.value)}
              />
              <Input
                label="Phone"
                name="phone"
                type="tel"
                autoComplete="off"
                value={draft.phone}
                onChange={(event) => onChange('phone', event.target.value)}
              />
            </div>
            {showGuardianLink ? (
              <GuardianLinkField
                draft={draft}
                guardians={guardians}
                nextId={nextId}
                junior={junior}
                onChange={onChange}
              />
            ) : null}
          </div>
        )}
        <Checkbox
          label={
            junior
              ? 'Send youth updates to the parent or guardian'
              : 'Send marketing and club updates'
          }
          checked={draft.marketing}
          onCheckedChange={(checked) => onChange('marketing', checked)}
        />
      </fieldset>

      <fieldset className="grid gap-3 border-t border-kumo-line pt-4">
        <legend className="px-1 text-sm font-semibold">Record keeping</legend>
        <Textarea
          label="Notes"
          name="notes"
          value={draft.notes}
          onChange={(event) => onChange('notes', event.target.value)}
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">
          <Input
            label="MBD IDs"
            name="mbd-ids"
            autoComplete="off"
            description="Separate multiple IDs with commas"
            value={draft.mbdIds}
            onChange={(event) => onChange('mbdIds', event.target.value)}
          />
          <Input
            label="Other names or spellings"
            name="aliases"
            autoComplete="off"
            description="Used when searching; separate with commas"
            value={draft.aliases}
            onChange={(event) => onChange('aliases', event.target.value)}
          />
        </div>
      </fieldset>
    </div>
  )
})
