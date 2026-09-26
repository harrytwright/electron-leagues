import { forwardRef } from 'react'
import { Checkbox, Input, Select, Text, Textarea } from '@cloudflare/kumo'
import { isUnder18 } from '@shared/members'
import { DateField } from '../DateField'
import { GENDER_ITEMS, type MemberDraft } from './member-form-data'

const OLDEST_BIRTH_YEARS = 100
const TYPICAL_AGE = 30

interface Props {
  draft: MemberDraft
  errorId?: string
  invalidNames?: { firstName: boolean; lastName: boolean }
  onChange: <Key extends keyof MemberDraft>(key: Key, value: MemberDraft[Key]) => void
}

export const MemberForm = forwardRef<HTMLInputElement, Props>(function MemberForm(
  { draft, errorId, invalidNames, onChange },
  firstNameRef
) {
  const junior = draft.dob !== '' && isUnder18({ dob: draft.dob }, new Date())
  const thisYear = new Date().getFullYear()

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
          <div className="grid gap-1.5">
            <Input
              label="Parent or guardian contact"
              name="guardian-contact"
              autoComplete="off"
              value={draft.guardianContact}
              onChange={(event) => onChange('guardianContact', event.target.value)}
            />
            <Text variant="secondary" size="sm">
              For under-18s, keep the parent or guardian’s details here rather than the young
              person’s own contact details.
            </Text>
          </div>
        ) : (
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
