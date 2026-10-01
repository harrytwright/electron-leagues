import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Checkbox, Collapsible, Input, Select, Text, Textarea } from '@cloudflare/kumo'
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check'
import { z } from 'zod'
import {
  buildMemberMergePreview,
  memberMergeResultSchema,
  withOriginalNames,
  type MemberMergeFieldPreview,
  type MemberMergePreview,
  type MemberMergeResult,
  type MemberMergeRosterAssignment,
  type MemberMergeSource
} from '@shared/member-merge'
import {
  applyAgeRules,
  formatMemberNumber,
  GENDERS,
  guardianOf,
  isSingles,
  isUnder18,
  memberDisplayName,
  resolveMember,
  type Member,
  type MembersSnapshot,
  type RosterSeason
} from '@shared/members'
import { DateField } from '@renderer/components/DateField'
import { GENDER_ITEMS, NO_GENDER } from '@renderer/components/MemberForm'
import { useQueryRefresh } from '@renderer/hooks/use-query-refresh'
import { useWriteOperation } from '@renderer/hooks/use-write-operation'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { pathTail } from '@renderer/lib/path-basename'
import { membersQueryKey } from '@renderer/queries/members'

type Field = MemberMergeFieldPreview['field']
/** Every field but the guardian link, which picks a member id rather than editing text. */
type ScalarField = Exclude<Field, 'guardianMemberId'>
type MergeValue = string | number | boolean | undefined
type Choice =
  | { kind: 'default' }
  | { kind: 'source'; value: MergeValue }
  | { kind: 'manual'; value: string | boolean }
type GuardianChoice = { kind: 'default' } | { kind: 'source'; value: number | undefined }

type SaveState =
  | { kind: 'editing'; error: string | null }
  | { kind: 'written'; saved: Member; refreshError: string; refreshing: boolean }

interface Props {
  snapshot: MembersSnapshot
  openingSnapshot: MembersSnapshot
  selectedIds: number[]
  mainId: number
  compact: boolean
  root: string
  selectionFrozen: boolean
  onMainChange: (id: number) => void
  onCancel: () => void
  onSaved: (member: Member) => void
  onFreezeSelection: () => void
  onUnfreezeSelection: () => void
  onBusyChange: (busy: boolean) => void
  onDirtyChange: (dirty: boolean) => void
  onBackgroundError: (message: string) => void
  onBackgroundSuccess: (message: string) => void
}

const FIELD_LABELS: Record<Field, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  dob: 'Date of birth',
  gender: 'Gender',
  email: 'Email',
  phone: 'Phone',
  guardianContact: 'Parent or guardian contact',
  guardianMemberId: 'Linked guardian',
  marketing: 'Marketing',
  cardIssued: 'Card issued',
  notes: 'Notes'
}

/** The label for a validation issue's first path segment, when it names a reviewed field. */
function fieldLabel(key: PropertyKey | undefined): string | undefined {
  for (const [field, label] of Object.entries(FIELD_LABELS)) {
    if (field === key) return label
  }
  return undefined
}

function memberById(members: readonly Member[], id: number): Member | undefined {
  const matches = members.filter((member) => member.id === id)
  return matches.length === 1 ? matches[0] : undefined
}

function sameValue(a: MergeValue, b: MergeValue): boolean {
  return a === b
}

function sameSelection(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id))
}

function displayValue(field: Field, value: MergeValue): string {
  if (value === undefined || value === '') return 'Not recorded'
  if (field === 'marketing') return value ? 'Allowed' : 'Not allowed'
  if (field === 'gender') return String(value).replace(/^./, (letter) => letter.toUpperCase())
  return String(value)
}

function textValue(value: MergeValue): string {
  if (value === true || value === false || value === undefined) return ''
  return String(value)
}

function optionalText(value: MergeValue): string | undefined {
  const trimmed = textValue(value).trim()
  return trimmed || undefined
}

function selectedValue(
  field: ScalarField,
  preview: MemberMergePreview,
  choice: Choice | undefined
): MergeValue {
  const fallback = preview.result[field]
  if (!choice || choice.kind === 'default') return fallback
  if (choice.kind === 'manual') return choice.value
  const available = preview.fields
    .find((candidate) => candidate.field === field)
    ?.alternatives.some((alternative) => sameValue(alternative.value, choice.value))
  return available ? choice.value : fallback
}

function sourceChoiceMissing(
  field: ScalarField,
  preview: MemberMergePreview,
  choice: Choice | undefined
): boolean {
  if (choice?.kind !== 'source') return false
  return !preview.fields
    .find((candidate) => candidate.field === field)
    ?.alternatives.some((alternative) => sameValue(alternative.value, choice.value))
}

function resultFrom(
  preview: MemberMergePreview,
  choices: Partial<Record<ScalarField, Choice>>,
  guardianChoice: GuardianChoice,
  sources: readonly Member[]
): MemberMergeResult {
  const gender = optionalText(selectedValue('gender', preview, choices.gender))
  const result: MemberMergeResult = {
    ...preview.result,
    firstName: textValue(selectedValue('firstName', preview, choices.firstName)).trim(),
    lastName: textValue(selectedValue('lastName', preview, choices.lastName)).trim(),
    dob: optionalText(selectedValue('dob', preview, choices.dob)),
    gender: GENDERS.find((candidate) => candidate === gender),
    email: optionalText(selectedValue('email', preview, choices.email)),
    phone: optionalText(selectedValue('phone', preview, choices.phone)),
    guardianContact: optionalText(
      selectedValue('guardianContact', preview, choices.guardianContact)
    ),
    guardianMemberId: guardianEffectiveValue(preview, guardianChoice),
    marketing: Boolean(selectedValue('marketing', preview, choices.marketing)),
    cardIssued: optionalText(selectedValue('cardIssued', preview, choices.cardIssued)),
    notes: optionalText(selectedValue('notes', preview, choices.notes))
  }
  return withOriginalNames(result, sources)
}

/** True when two merge results would write the same record, field by field. */
function sameMergeResult(a: MemberMergeResult, b: MemberMergeResult): boolean {
  return (
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.dob === b.dob &&
    a.gender === b.gender &&
    a.email === b.email &&
    a.phone === b.phone &&
    a.guardianContact === b.guardianContact &&
    a.guardianMemberId === b.guardianMemberId &&
    a.marketing === b.marketing &&
    a.cardIssued === b.cardIssued &&
    a.notes === b.notes &&
    a.mbdIds.length === b.mbdIds.length &&
    a.mbdIds.every((value, index) => value === b.mbdIds[index]) &&
    a.aliases.length === b.aliases.length &&
    a.aliases.every((value, index) => value === b.aliases[index])
  )
}

interface GuardianAlternative {
  value: number | undefined
  sources: MemberMergeSource[]
}

const guardianValueSchema = z.number().int().positive().optional()

/**
 * The guardian field's alternatives, parsed once at this boundary into their real shape
 * (a member id or none) so nothing downstream needs to re-examine the shared, wider
 * `string | number | boolean | undefined` type every other merge field's value can take.
 */
function guardianAlternatives(preview: MemberMergePreview): GuardianAlternative[] {
  const field = preview.fields.find((candidate) => candidate.field === 'guardianMemberId')
  return (field?.alternatives ?? []).map((alternative) => ({
    value: guardianValueSchema.parse(alternative.value),
    sources: alternative.sources
  }))
}

/** The guardian result the merge would actually write: the chosen source, falling back to the
 * default once the record it came from is no longer among the alternatives (deselected). */
function guardianEffectiveValue(
  preview: MemberMergePreview,
  choice: GuardianChoice
): number | undefined {
  if (choice.kind !== 'source') return preview.result.guardianMemberId
  const known = guardianAlternatives(preview).some(
    (alternative) => alternative.value === choice.value
  )
  return known ? choice.value : preview.result.guardianMemberId
}

/** True once the chosen source record has dropped out of the merge, so the result has quietly
 * fallen back to the default; mirrors `sourceChoiceMissing` for the scalar fields. */
function guardianChoiceMissing(preview: MemberMergePreview, choice: GuardianChoice): boolean {
  if (choice.kind !== 'source') return false
  return !guardianAlternatives(preview).some((alternative) => alternative.value === choice.value)
}

/**
 * The guardian picker's label for one alternative: the member's number and name, flagged when
 * the merge would refuse it (deleted, under 18, a duplicated number) or the link has followed a
 * merge to a survivor, or "None".
 */
function guardianAlternativeLabel(
  value: number | undefined,
  members: readonly Member[],
  nextId: number
): string {
  if (value === undefined) return 'None'
  const number = formatMemberNumber(value, nextId)
  const holders = members.filter((candidate) => candidate.id === value)
  if (holders.length > 1) return `Member ${number} (duplicated number)`
  const guardian = holders[0]
  if (!guardian) return `Member ${number} (no longer on the list)`
  const name = `${number} ${memberDisplayName(guardian)}`
  if (guardian.deleted) return `${name} (removed)`
  if (guardian.mergedInto !== undefined) {
    const survivor = resolveMember(members, guardian.id)
    return survivor
      ? `Member ${number} (merged into ${formatMemberNumber(survivor.id, nextId)} ${memberDisplayName(survivor)})`
      : `Member ${number} (no longer on the list)`
  }
  if (isUnder18(guardian, new Date())) return `${name} (under 18)`
  return name
}

function SourceAlternatives({
  field,
  preview,
  choice,
  disabled,
  onChoose,
  onUseDefault
}: {
  field: ScalarField
  preview: MemberMergePreview
  choice: Choice | undefined
  disabled: boolean
  onChoose: (choice: Choice) => void
  onUseDefault: () => void
}): React.JSX.Element {
  const alternatives =
    preview.fields.find((candidate) => candidate.field === field)?.alternatives ?? []
  const effective = selectedValue(field, preview, choice)
  const missing = sourceChoiceMissing(field, preview, choice)
  return (
    <div className="grid gap-1.5">
      {missing ? (
        <Text variant="secondary" size="sm" role="status">
          The chosen source record was removed. The result now uses the default value.
        </Text>
      ) : null}
      {field === 'notes' ? (
        <button
          type="button"
          disabled={disabled}
          aria-pressed={!choice || choice.kind === 'default' || missing}
          className="grid rounded-md px-3 py-2 text-left ring ring-kumo-line hover:bg-kumo-tint disabled:opacity-60 aria-pressed:ring-kumo-brand"
          onClick={onUseDefault}
        >
          <span className="flex items-start justify-between gap-3">
            <span className="font-medium">Combined (default)</span>
            {!choice || choice.kind === 'default' || missing ? (
              <span className="flex h-lh shrink-0 items-center text-kumo-brand">
                <CheckIcon aria-hidden size={14} weight="bold" />
                <span className="sr-only">Selected</span>
              </span>
            ) : null}
          </span>
          <span className="text-sm whitespace-pre-wrap text-kumo-subtle">
            {displayValue(field, preview.result.notes)}
          </span>
        </button>
      ) : choice ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={onUseDefault}
          >
            Use default
          </Button>
        </div>
      ) : null}
      {alternatives.length <= 1 ? (
        <Text variant="secondary" size="sm">
          All selected records: {displayValue(field, alternatives[0]?.value)}
        </Text>
      ) : (
        <div
          className="grid gap-1.5"
          role="group"
          aria-label={`${FIELD_LABELS[field]} source values`}
        >
          {alternatives.map((alternative, index) => {
            const selected =
              field === 'notes'
                ? choice?.kind === 'source' &&
                  sameValue(choice.value, alternative.value) &&
                  !missing
                : sameValue(effective, alternative.value) && choice?.kind !== 'manual' && !missing
            return (
              <button
                key={`${JSON.stringify(alternative.value)}-${index}`}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                className="flex items-start justify-between gap-3 rounded-md px-3 py-2 text-left ring ring-kumo-line hover:bg-kumo-tint disabled:opacity-60 aria-pressed:ring-kumo-brand"
                onClick={() => onChoose({ kind: 'source', value: alternative.value })}
              >
                <span className="grid min-w-0 gap-0.5">
                  <span className="font-medium">{displayValue(field, alternative.value)}</span>
                  <span className="text-sm text-kumo-subtle">
                    {alternative.sources.map((source) => source.label).join(', ')}
                  </span>
                </span>
                {selected ? (
                  <span className="flex h-lh shrink-0 items-center text-kumo-brand">
                    <CheckIcon aria-hidden size={14} weight="bold" />
                    <span className="sr-only">Selected</span>
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MergeField({
  field,
  preview,
  choice,
  disabled,
  onChange,
  onUseDefault
}: {
  field: Exclude<ScalarField, 'notes'>
  preview: MemberMergePreview
  choice: Choice | undefined
  disabled: boolean
  onChange: (choice: Choice) => void
  onUseDefault: () => void
}): React.JSX.Element {
  const value = selectedValue(field, preview, choice)
  const control =
    field === 'marketing' ? (
      <Checkbox
        label="Send marketing and club updates"
        checked={Boolean(value)}
        disabled={disabled}
        onCheckedChange={(checked) => onChange({ kind: 'manual', value: checked })}
      />
    ) : field === 'gender' ? (
      <Select
        label={FIELD_LABELS[field]}
        value={textValue(value) || NO_GENDER}
        items={GENDER_ITEMS}
        disabled={disabled}
        onValueChange={(next) =>
          onChange({ kind: 'manual', value: next && next !== NO_GENDER ? next : '' })
        }
      />
    ) : field === 'dob' || field === 'cardIssued' ? (
      <DateField
        label={FIELD_LABELS[field]}
        name={`merge-${field}`}
        value={textValue(value)}
        disabled={disabled}
        fromYear={field === 'dob' ? new Date().getFullYear() - 100 : 2000}
        toYear={new Date().getFullYear()}
        openAt={field === 'dob' ? new Date(new Date().getFullYear() - 30, 0) : undefined}
        onChange={(next) => onChange({ kind: 'manual', value: next })}
      />
    ) : (
      <Input
        label={FIELD_LABELS[field]}
        name={`merge-${field}`}
        type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
        autoComplete="off"
        value={textValue(value)}
        disabled={disabled}
        onChange={(event) => onChange({ kind: 'manual', value: event.target.value })}
      />
    )
  return (
    <section className="grid gap-2 border-t border-kumo-line pt-3 first:border-t-0 first:pt-0">
      <SourceAlternatives
        field={field}
        preview={preview}
        choice={choice}
        disabled={disabled}
        onChoose={onChange}
        onUseDefault={onUseDefault}
      />
      {control}
    </section>
  )
}

/** The guardian link's own field row: alternatives are member ids, not free text. */
function GuardianField({
  preview,
  choice,
  members,
  nextId,
  disabled,
  onChoose,
  onUseDefault
}: {
  preview: MemberMergePreview
  choice: GuardianChoice
  members: readonly Member[]
  nextId: number
  disabled: boolean
  onChoose: (choice: GuardianChoice) => void
  onUseDefault: () => void
}): React.JSX.Element {
  const alternatives = guardianAlternatives(preview)
  const effective = guardianEffectiveValue(preview, choice)
  const missing = guardianChoiceMissing(preview, choice)
  return (
    <section className="grid gap-2 border-t border-kumo-line pt-3 first:border-t-0 first:pt-0">
      <Text as="h3" variant="heading">
        {FIELD_LABELS.guardianMemberId}
      </Text>
      {missing ? (
        <Text variant="secondary" size="sm" role="status">
          The chosen source record was removed. The result now uses the default value.
        </Text>
      ) : null}
      {choice.kind === 'source' ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={onUseDefault}
          >
            Use default
          </Button>
        </div>
      ) : null}
      {alternatives.length <= 1 ? (
        <Text variant="secondary" size="sm">
          All selected records: {guardianAlternativeLabel(alternatives[0]?.value, members, nextId)}
        </Text>
      ) : (
        <div
          className="grid gap-1.5"
          role="group"
          aria-label={`${FIELD_LABELS.guardianMemberId} source values`}
        >
          {alternatives.map((alternative, index) => {
            const selected = effective === alternative.value && !missing
            return (
              <button
                key={`${JSON.stringify(alternative.value)}-${index}`}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                className="flex items-start justify-between gap-3 rounded-md px-3 py-2 text-left ring ring-kumo-line hover:bg-kumo-tint disabled:opacity-60 aria-pressed:ring-kumo-brand"
                onClick={() => onChoose({ kind: 'source', value: alternative.value })}
              >
                <span className="grid min-w-0 gap-0.5">
                  <span className="font-medium">
                    {guardianAlternativeLabel(alternative.value, members, nextId)}
                  </span>
                  <span className="text-sm text-kumo-subtle">
                    {alternative.sources.map((source) => source.label).join(', ')}
                  </span>
                </span>
                {selected ? (
                  <span className="flex h-lh shrink-0 items-center text-kumo-brand">
                    <CheckIcon aria-hidden size={14} weight="bold" />
                    <span className="sr-only">Selected</span>
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

function assignmentLabel(
  assignment: MemberMergeRosterAssignment,
  season: RosterSeason | undefined,
  nextId: number
): string {
  const team = season?.file.teams.find((candidate) => candidate.id === assignment.teamId)
  const parts: string[] = []
  if (team) parts.push(team.name)
  else if (assignment.teamId !== null) parts.push('Unknown team')
  else if (!season || !isSingles(season.file)) parts.push('Substitute')
  if (assignment.position) parts.push(`position ${assignment.position}`)
  if (assignment.leagueSecretaryId) parts.push(`LeagueSecretary id ${assignment.leagueSecretaryId}`)
  if (assignment.memberId !== assignment.source.id) {
    parts.push(`listed as ${formatMemberNumber(assignment.memberId, nextId)}`)
  }
  return parts.join(', ') || 'Listed'
}

function RosterDifferences({
  preview,
  snapshot
}: {
  preview: MemberMergePreview
  snapshot: MembersSnapshot
}): React.JSX.Element | null {
  if (preview.rosterDifferences.length === 0) return null
  return (
    <section className="grid gap-2 border-t border-kumo-line pt-4">
      <Text as="h3" variant="heading">
        Roster assignments
      </Text>
      <Text variant="secondary" size="sm">
        Where selected records differ, the main record’s own entry is kept, then an old number of
        the main record, then the earliest selected record.
      </Text>
      <ul className="grid gap-2">
        {preview.rosterDifferences.map((difference) => {
          const season = snapshot.seasons.find((candidate) => candidate.path === difference.path)
          return (
            <li key={difference.path} className="rounded-md px-3 py-2 ring ring-kumo-line">
              <div className="font-medium">
                {difference.leagueName} · {difference.season}
              </div>
              <ul className="mt-1 grid gap-0.5 text-sm text-kumo-subtle">
                {difference.assignments.map((assignment, index) => (
                  <li key={`${assignment.memberId}-${index}`}>
                    {assignment.source.label}:{' '}
                    {assignmentLabel(assignment, season, snapshot.nextId)}
                    {assignment.retained ? ' (kept)' : ' (dropped)'}
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function MergeMemberPane({
  snapshot,
  openingSnapshot,
  selectedIds,
  mainId,
  compact,
  root,
  selectionFrozen,
  onMainChange,
  onCancel,
  onSaved,
  onFreezeSelection,
  onUnfreezeSelection,
  onBusyChange,
  onDirtyChange,
  onBackgroundError,
  onBackgroundSuccess
}: Props): React.JSX.Element {
  const [choices, setChoices] = useState<Partial<Record<ScalarField, Choice>>>({})
  const [guardianChoice, setGuardianChoice] = useState<GuardianChoice>({ kind: 'default' })
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'editing', error: null })
  const [openingSelection] = useState(() => ({ selectedIds, mainId }))
  const active = useRef(true)
  const bodyRef = useRef<HTMLDivElement>(null)
  const alertRef = useRef<HTMLDivElement>(null)
  const coordinator = useQueryRefresh()
  const sources = useMemo(
    () => selectedIds.flatMap((id) => memberById(openingSnapshot.members, id) ?? []),
    [openingSnapshot.members, selectedIds]
  )
  const preview = useMemo(
    () =>
      sources.length >= 2
        ? buildMemberMergePreview(sources, mainId, openingSnapshot.seasons, openingSnapshot.members)
        : null,
    [mainId, openingSnapshot, sources]
  )
  const stale = snapshot.revision !== openingSnapshot.revision
  const result = useMemo(
    () => (preview ? resultFrom(preview, choices, guardianChoice, sources) : null),
    [choices, guardianChoice, preview, sources]
  )
  const reviewedResult = result ? applyAgeRules(result, new Date()) : null
  const parsed = reviewedResult ? memberMergeResultSchema.safeParse(reviewedResult) : null
  const junior = reviewedResult ? isUnder18(reviewedResult, new Date()) : false
  const linkedGuardian = result ? guardianOf(result, openingSnapshot.members) : null
  const guardianField = preview?.fields.find((candidate) => candidate.field === 'guardianMemberId')
  const guardianSourceLabel = guardianField?.alternatives
    .find((alternative) => alternative.value === result?.guardianMemberId)
    ?.sources.map((source) => source.label)
    .join(', ')
  const guardianLinked =
    guardianField?.alternatives.some((alternative) => alternative.value !== undefined) ?? false
  const guardianRecorded =
    preview?.fields
      .find((candidate) => candidate.field === 'guardianContact')
      ?.alternatives.some((alternative) => alternative.value !== undefined) ||
    choices.guardianContact !== undefined
  const frozen = selectionFrozen || saveState.kind === 'written'
  const operation = useWriteOperation({
    operation: 'mergeMemberGroup',
    label: () => `Merging ${selectedIds.length} members`,
    write: window.api.mergeMemberGroup,
    refreshQueryKey: membersQueryKey
  })

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  useEffect(() => {
    onBusyChange(operation.pending)
    return () => onBusyChange(false)
  }, [onBusyChange, operation.pending])

  // A stale merge can only be cancelled, so leaving it needs no confirmation. A choice that
  // lands back on the default result (the same value picked, or typed back to it) is not a
  // change either, so the result itself is compared rather than whether any choice was made.
  const dirty =
    saveState.kind !== 'written' &&
    !stale &&
    (mainId !== openingSelection.mainId ||
      !sameSelection(selectedIds, openingSelection.selectedIds) ||
      (preview !== null && result !== null && !sameMergeResult(result, preview.result)))
  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    if (saveState.kind === 'editing' && !saveState.error) return
    bodyRef.current?.scrollTo?.({ top: 0 })
    alertRef.current?.focus()
  }, [saveState])

  const change = (field: ScalarField, choice: Choice): void => {
    if (frozen) return
    setChoices((current) => ({ ...current, [field]: choice }))
    setSaveState({ kind: 'editing', error: null })
  }

  const resetField = (field: ScalarField): void => {
    if (frozen) return
    setChoices((current) => {
      const next = { ...current }
      delete next[field]
      return next
    })
    setSaveState({ kind: 'editing', error: null })
  }

  const changeGuardian = (choice: GuardianChoice): void => {
    if (frozen) return
    setGuardianChoice(choice)
    setSaveState({ kind: 'editing', error: null })
  }

  const resetGuardian = (): void => {
    if (frozen) return
    setGuardianChoice({ kind: 'default' })
    setSaveState({ kind: 'editing', error: null })
  }

  const submit = async (): Promise<void> => {
    if (
      !reviewedResult ||
      !parsed?.success ||
      selectedIds.length < 2 ||
      stale ||
      operation.pending ||
      frozen
    )
      return
    const attempted = `${reviewedResult.firstName} ${reviewedResult.lastName}`.trim()
    const request = {
      sourceIds: [...selectedIds],
      mainId,
      result: reviewedResult,
      expectedRevision: openingSnapshot.revision
    }
    onFreezeSelection()
    try {
      const outcome = await operation.run(request)
      if (!active.current) {
        if (outcome.status === 'refresh-failed') {
          onBackgroundError(
            `Merged ${attempted} in ${pathTail(root)}, but the members list could not be refreshed: ${outcome.refreshError}`
          )
        } else {
          onBackgroundSuccess(`Merged ${attempted} in ${pathTail(root)}`)
        }
        return
      }
      if (outcome.status === 'refresh-failed') {
        setSaveState({
          kind: 'written',
          saved: outcome.result,
          refreshError: outcome.refreshError,
          refreshing: false
        })
      } else onSaved(outcome.result)
    } catch (caught) {
      const message = ipcErrorMessage(caught)
      if (!active.current) {
        onBackgroundError(`Couldn’t merge ${attempted} in ${pathTail(root)}: ${message}`)
        return
      }
      onUnfreezeSelection()
      setSaveState({ kind: 'editing', error: message })
      void coordinator.refresh()
    }
  }

  const retryRefresh = async (): Promise<void> => {
    if (saveState.kind !== 'written' || saveState.refreshing) return
    const saved = saveState.saved
    setSaveState({ ...saveState, refreshing: true })
    try {
      await coordinator.refresh({ queryKey: membersQueryKey(root), throwOnError: true })
      if (active.current) onSaved(saved)
    } catch (caught) {
      if (active.current)
        setSaveState({
          kind: 'written',
          saved,
          refreshError: ipcErrorMessage(caught),
          refreshing: false
        })
    }
  }

  const mainItems = Object.fromEntries(
    sources.map((source) => [
      String(source.id),
      `${formatMemberNumber(source.id, openingSnapshot.nextId)} ${memberDisplayName(source)}`
    ])
  )
  const firstIssue = parsed && !parsed.success ? parsed.error.issues[0] : undefined
  const issueLabel = firstIssue ? fieldLabel(firstIssue.path[0]) : undefined
  const invalidMessage = firstIssue
    ? issueLabel
      ? `${issueLabel}: ${firstIssue.message}`
      : firstIssue.message
    : null
  const disabled = operation.pending || frozen || stale

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      role="region"
      aria-label="Merge members workspace"
    >
      <header
        className={`z-10 flex shrink-0 items-start justify-between gap-3 border-b border-kumo-line bg-kumo-base ${compact ? 'px-3 py-2' : 'px-5 py-4'}`}
      >
        <div className="grid min-w-0 gap-1">
          <Text as="h2" variant="heading" size="lg">
            Merge members
          </Text>
          <Text variant="secondary" size="sm">
            {selectedIds.length} selected
          </Text>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={operation.pending}
            onClick={() => (saveState.kind === 'written' ? onSaved(saveState.saved) : onCancel())}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={disabled || selectedIds.length < 2 || !parsed?.success}
            onClick={() => void submit()}
          >
            {operation.pending ? 'Merging…' : 'Merge members'}
          </Button>
        </div>
      </header>
      <div
        ref={bodyRef}
        className={`relative min-h-0 flex-1 overflow-auto ${compact ? 'px-3 py-3' : 'px-5 py-4'}`}
      >
        <div className="grid gap-4">
          {stale && saveState.kind !== 'written' ? (
            <div
              ref={alertRef}
              role="alert"
              tabIndex={-1}
              className="rounded-md bg-kumo-tint px-3 py-2 ring ring-kumo-line"
            >
              <Text variant="error">
                The members list changed after this merge was opened. Cancel and start the merge
                again.
              </Text>
            </div>
          ) : null}
          {saveState.kind === 'editing' && saveState.error ? (
            <div
              ref={alertRef}
              role="alert"
              tabIndex={-1}
              className="rounded-md bg-kumo-tint px-3 py-2 ring ring-kumo-line"
            >
              <Text variant="error">{saveState.error}</Text>
            </div>
          ) : null}
          {saveState.kind === 'written' ? (
            <div
              ref={alertRef}
              role="alert"
              tabIndex={-1}
              className="grid gap-2 rounded-md bg-kumo-tint px-3 py-2 ring ring-kumo-line"
            >
              <Text variant="error">
                Merged {memberDisplayName(saveState.saved)}, but the list could not be refreshed:{' '}
                {saveState.refreshError}
              </Text>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={saveState.refreshing}
                  onClick={() => void retryRefresh()}
                >
                  {saveState.refreshing ? 'Refreshing…' : 'Retry refresh'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onSaved(saveState.saved)}
                >
                  Close
                </Button>
              </div>
            </div>
          ) : null}
          <Collapsible.Root
            key={selectedIds.length > 3 ? 'many-sources' : 'few-sources'}
            defaultOpen={!compact && selectedIds.length <= 3}
          >
            <Collapsible.DefaultTrigger>
              Selected records ({selectedIds.length})
            </Collapsible.DefaultTrigger>
            <Collapsible.DefaultPanel className="pt-2">
              <ul className="flex flex-wrap gap-1.5">
                {sources.map((source) => (
                  <li key={source.id} className="rounded-md bg-kumo-tint px-2 py-1 text-sm">
                    <span className="font-mono text-[0.9em]">
                      {formatMemberNumber(source.id, openingSnapshot.nextId)}
                    </span>{' '}
                    {memberDisplayName(source)}
                  </li>
                ))}
              </ul>
            </Collapsible.DefaultPanel>
          </Collapsible.Root>
          {sources.length < 2 || !preview || !result ? (
            <Text variant="secondary">
              Select at least two eligible members from the list to compare and merge them.
            </Text>
          ) : (
            <>
              <Select
                label="Main record"
                description="This member number survives the merge."
                value={String(mainId)}
                items={mainItems}
                disabled={disabled}
                onValueChange={(value) => {
                  if (value) onMainChange(Number(value))
                }}
              />
              {invalidMessage ? <Text variant="error">{invalidMessage}</Text> : null}
              <section className="grid gap-3">
                <div className="grid gap-1">
                  <Text as="h3" variant="heading">
                    Result
                  </Text>
                  <Text variant="secondary" size="sm">
                    Choose a source value or edit the result directly.
                  </Text>
                </div>
                {(['firstName', 'lastName', 'dob', 'gender'] as const).map((field) => (
                  <MergeField
                    key={field}
                    field={field}
                    preview={preview}
                    choice={choices[field]}
                    disabled={disabled}
                    onChange={(choice) => change(field, choice)}
                    onUseDefault={() => resetField(field)}
                  />
                ))}
                {junior ? (
                  <Text variant="secondary" size="sm">
                    This result is under 18, so the parent or guardian contact is kept and personal
                    email and phone details are removed.
                  </Text>
                ) : (
                  <>
                    <MergeField
                      field="email"
                      preview={preview}
                      choice={choices.email}
                      disabled={disabled}
                      onChange={(choice) => change('email', choice)}
                      onUseDefault={() => resetField('email')}
                    />
                    <MergeField
                      field="phone"
                      preview={preview}
                      choice={choices.phone}
                      disabled={disabled}
                      onChange={(choice) => change('phone', choice)}
                      onUseDefault={() => resetField('phone')}
                    />
                  </>
                )}
                {junior || guardianLinked ? (
                  <>
                    <GuardianField
                      preview={preview}
                      choice={guardianChoice}
                      members={openingSnapshot.members}
                      nextId={openingSnapshot.nextId}
                      disabled={disabled}
                      onChoose={changeGuardian}
                      onUseDefault={resetGuardian}
                    />
                    {linkedGuardian ? (
                      <Text variant="secondary" size="sm">
                        Linked guardian: {memberDisplayName(linkedGuardian)} (
                        {formatMemberNumber(linkedGuardian.id, openingSnapshot.nextId)}), from{' '}
                        {guardianSourceLabel ?? 'the merged records'}.
                      </Text>
                    ) : null}
                  </>
                ) : null}
                {junior || guardianRecorded ? (
                  <>
                    {junior ? null : (
                      <Text variant="secondary" size="sm">
                        A parent or guardian contact from a junior record stays on the result until
                        it is cleared here.
                      </Text>
                    )}
                    <MergeField
                      field="guardianContact"
                      preview={preview}
                      choice={choices.guardianContact}
                      disabled={disabled}
                      onChange={(choice) => change('guardianContact', choice)}
                      onUseDefault={() => resetField('guardianContact')}
                    />
                  </>
                ) : null}
                {(['marketing', 'cardIssued'] as const).map((field) => (
                  <MergeField
                    key={field}
                    field={field}
                    preview={preview}
                    choice={choices[field]}
                    disabled={disabled}
                    onChange={(choice) => change(field, choice)}
                    onUseDefault={() => resetField(field)}
                  />
                ))}
              </section>
              <section className="grid gap-2 border-t border-kumo-line pt-4">
                <Text as="h3" variant="heading">
                  Notes
                </Text>
                <SourceAlternatives
                  field="notes"
                  preview={preview}
                  choice={choices.notes}
                  disabled={disabled}
                  onChoose={(choice) => change('notes', choice)}
                  onUseDefault={() => resetField('notes')}
                />
                <Textarea
                  label="Combined notes"
                  name="merge-notes"
                  value={String(selectedValue('notes', preview, choices.notes) ?? '')}
                  disabled={disabled}
                  onChange={(event) =>
                    change('notes', { kind: 'manual', value: event.target.value })
                  }
                />
              </section>
              <section className="grid gap-2 border-t border-kumo-line pt-4">
                <Text as="h3" variant="heading">
                  Combined identifiers
                </Text>
                <div>
                  <span className="font-medium">Other names or spellings: </span>
                  {result.aliases.join(', ') || 'None'}
                </div>
                <div>
                  <span className="font-medium">MBD IDs: </span>
                  {result.mbdIds.join(', ') || 'None'}
                </div>
              </section>
              <RosterDifferences preview={preview} snapshot={openingSnapshot} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
