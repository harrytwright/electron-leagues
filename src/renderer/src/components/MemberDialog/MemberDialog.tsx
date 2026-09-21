import { useId, useRef, useState } from 'react'
import { Button, Checkbox, Dialog, Input, Select, Text, Textarea } from '@cloudflare/kumo'
import {
  GENDERS,
  isUnder18,
  memberDisplayName,
  type Gender,
  type Member,
  type MemberInput
} from '@shared/members'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { sentenceCase } from '@renderer/lib/sentence-case'
import { useDialogTask } from '@renderer/hooks/use-dialog-task'
import { useQueryRefresh } from '@renderer/hooks/use-query-refresh'
import { useWriteOperation } from '@renderer/hooks/use-write-operation'
import { TaskDialog } from '../TaskDialog'
import type { Props } from './interface'

const NO_GENDER = 'unset'

const GENDER_ITEMS = {
  [NO_GENDER]: 'Not recorded',
  ...Object.fromEntries(GENDERS.map((gender) => [gender, sentenceCase(gender)]))
}

function isGender(value: string): value is Gender {
  return GENDERS.some((gender) => gender === value)
}

interface Draft {
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

function draftFrom(member: Member | null): Draft {
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

/** What main receives; the age rules run again there, so this only shapes the fields. */
function memberInputFromDraft(draft: Draft, member: Member | null): MemberInput {
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

export function MemberDialog({
  snapshot,
  member,
  open,
  onOpenChange,
  onSaved
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(member))
  const [wasOpen, setWasOpen] = useState(open)
  const [editedMemberId, setEditedMemberId] = useState(member?.id)
  const firstNameRef = useRef<HTMLInputElement>(null)
  const errorId = useId()
  const coordinator = useQueryRefresh()
  const operation = useWriteOperation({
    label: (input: MemberInput) =>
      input.id === undefined
        ? `Adding ${input.firstName} ${input.lastName}`
        : `Saving ${input.firstName} ${input.lastName}`,
    write: (input) => window.api.saveMember(input, snapshot.revision)
  })
  const task = useDialogTask({ open, onOpenChange, fieldRef: firstNameRef })

  // Each opening starts from the member as they are now; a refresh mid-edit keeps the draft.
  if (wasOpen !== open || editedMemberId !== member?.id) {
    setWasOpen(open)
    setEditedMemberId(member?.id)
    if (open) setDraft(draftFrom(member))
  }

  const junior = draft.dob !== '' && isUnder18({ dob: draft.dob }, new Date())
  const update = <Key extends keyof Draft>(key: Key, value: Draft[Key]): void => {
    setDraft((current) => ({ ...current, [key]: value }))
    if (task.error) task.edited()
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (task.busy) return
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      task.reject('A member needs a first and last name')
      return
    }
    const ticket = task.begin()
    try {
      const outcome = await operation.run(memberInputFromDraft(draft, member))
      const saved = outcome.result
      if (outcome.status === 'refresh-failed') {
        task.settle(ticket, {
          type: 'failed',
          error: `Saved ${memberDisplayName(saved)}, but the list could not be refreshed: ${outcome.refreshError}`
        })
        return
      }
      task.settle(ticket, { type: 'completed' })
      if (task.isCurrent(ticket)) onSaved(saved)
    } catch (caught) {
      task.settle(ticket, { type: 'failed', error: ipcErrorMessage(caught) })
      void coordinator.refresh()
    }
  }

  return (
    <TaskDialog open={open} onOpenChange={task.handleOpenChange} size="lg">
      <TaskDialog.Header
        title={member ? `Edit ${memberDisplayName(member)}` : 'New member'}
        description={
          member
            ? 'Details are kept in this location’s members list.'
            : 'The next member number is given out when you save.'
        }
      />

      <TaskDialog.Body onSubmit={(event) => void submit(event)}>
        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-semibold">Personal details</legend>
          <div className="grid grid-cols-2 gap-3">
            <Input
              ref={firstNameRef}
              label="First name"
              name="first-name"
              autoComplete="off"
              autoFocus
              value={draft.firstName}
              aria-invalid={task.error ? true : undefined}
              aria-describedby={task.error ? errorId : undefined}
              onChange={(event) => update('firstName', event.target.value)}
            />
            <Input
              label="Last name"
              name="last-name"
              autoComplete="off"
              value={draft.lastName}
              onChange={(event) => update('lastName', event.target.value)}
            />
            <Input
              label="Date of birth"
              name="dob"
              type="date"
              value={draft.dob}
              onChange={(event) => update('dob', event.target.value)}
            />
            <Select
              label="Gender"
              value={draft.gender}
              items={GENDER_ITEMS}
              onValueChange={(value) => {
                if (value) update('gender', value)
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
                onChange={(event) => update('guardianContact', event.target.value)}
              />
              <Text variant="secondary" size="sm">
                For under-18s, keep the parent or guardian’s details here rather than the young
                person’s own contact details.
              </Text>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Email"
                name="email"
                type="email"
                autoComplete="off"
                value={draft.email}
                onChange={(event) => update('email', event.target.value)}
              />
              <Input
                label="Phone"
                name="phone"
                type="tel"
                autoComplete="off"
                value={draft.phone}
                onChange={(event) => update('phone', event.target.value)}
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
            onCheckedChange={(checked) => update('marketing', checked)}
          />
        </fieldset>

        <fieldset className="grid gap-3 border-t border-kumo-line pt-4">
          <legend className="px-1 text-sm font-semibold">Record keeping</legend>
          <Textarea
            label="Notes"
            name="notes"
            value={draft.notes}
            onChange={(event) => update('notes', event.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="MBD IDs"
              name="mbd-ids"
              autoComplete="off"
              description="Separate multiple IDs with commas"
              value={draft.mbdIds}
              onChange={(event) => update('mbdIds', event.target.value)}
            />
            <Input
              label="Other names or spellings"
              name="aliases"
              autoComplete="off"
              description="Used when searching; separate with commas"
              value={draft.aliases}
              onChange={(event) => update('aliases', event.target.value)}
            />
          </div>
        </fieldset>

        {task.error ? (
          <Text id={errorId} variant="error" role="alert">
            {task.error}
          </Text>
        ) : null}

        <TaskDialog.Actions>
          <Dialog.Close
            render={(props) => (
              <Button {...props} type="button" variant="secondary" disabled={task.busy}>
                Cancel
              </Button>
            )}
          />
          <Button type="submit" variant="primary" disabled={task.busy}>
            {task.busy ? 'Saving…' : member ? 'Save member' : 'Add member'}
          </Button>
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}
