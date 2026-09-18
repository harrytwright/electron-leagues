import { useState } from 'react'
import { Button, Input, Select, Text } from '@cloudflare/kumo'
import { MAX_FORMAT, MIN_FORMAT, type FeeBreakdown, type SeasonFile } from '@shared/members'
import { useKeyedState } from '@renderer/hooks/use-keyed-state'
import { formatLabel } from '@renderer/lib/season-format'

export interface SettingsFormProps {
  file: SeasonFile
  /** Changes when the file on disk changes, which starts the form over from the saved values. */
  revision: string
  readOnly: boolean
  busy: boolean
  onSave: (file: SeasonFile) => Promise<string | null>
}

interface FeeLine {
  /** Stable while the line is edited, so removing one line keeps focus on the others. */
  key: number
  label: string
  amount: string
}

interface Draft {
  format: string
  startDate: string
  startTime: string
  weeks: string
  feeTotal: string
  breakdown: FeeLine[]
  subFee: string
  leagueSecretaryId: string
}

const FORMAT_ITEMS = Object.fromEntries(
  Array.from({ length: MAX_FORMAT - MIN_FORMAT + 1 }, (_, index) => {
    const format = MIN_FORMAT + index
    return [String(format), `${formatLabel(format)} (${format} per team)`]
  })
)

function draftFrom(file: SeasonFile): Draft {
  return {
    format: String(file.format),
    startDate: file.startDate ?? '',
    startTime: file.startTime ?? '',
    weeks: file.weeks === undefined ? '' : String(file.weeks),
    feeTotal: file.fees === undefined ? '' : String(file.fees.total),
    breakdown: (file.fees?.breakdown ?? []).map((part, index) => ({
      key: index,
      label: part.label,
      amount: String(part.amount)
    })),
    subFee: file.subFee === undefined ? '' : String(file.subFee),
    leagueSecretaryId: file.leagueSecretaryId ?? ''
  }
}

function money(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

/** The season file with the form's values applied, or the message stopping it. */
function fileFromDraft(draft: Draft, file: SeasonFile): { file: SeasonFile } | { error: string } {
  const next: SeasonFile = {
    schemaVersion: 1,
    format: Number(draft.format),
    teams: file.teams,
    players: file.players
  }
  if (draft.startDate) next.startDate = draft.startDate
  if (draft.startTime) next.startTime = draft.startTime
  if (draft.weeks.trim()) {
    const weeks = Number(draft.weeks)
    if (!Number.isInteger(weeks) || weeks < 1) return { error: 'Weeks must be a whole number' }
    next.weeks = weeks
  }
  if (draft.feeTotal.trim() || draft.breakdown.length > 0) {
    const total = money(draft.feeTotal)
    if (total === null) return { error: 'The weekly fee must be a number' }
    const breakdown: FeeBreakdown[] = []
    for (const line of draft.breakdown) {
      const amount = money(line.amount)
      if (!line.label.trim() || amount === null) {
        return { error: 'Each fee line needs a label and an amount' }
      }
      breakdown.push({ label: line.label.trim(), amount })
    }
    next.fees = { total, breakdown }
  }
  if (draft.subFee.trim()) {
    const subFee = money(draft.subFee)
    if (subFee === null) return { error: 'The sub fee must be a number' }
    next.subFee = subFee
  }
  if (draft.leagueSecretaryId.trim()) next.leagueSecretaryId = draft.leagueSecretaryId.trim()
  return { file: next }
}

export function SettingsForm({
  file,
  revision,
  readOnly,
  busy,
  onSave
}: SettingsFormProps): React.JSX.Element {
  const [draft, setDraft] = useKeyedState(revision, draftFrom(file))
  const [error, setError] = useState<string | null>(null)
  const update = <Key extends keyof Draft>(key: Key, value: Draft[Key]): void => {
    setDraft({ ...draft, [key]: value })
    setError(null)
  }
  const updateLine = (index: number, line: FeeLine): void => {
    update(
      'breakdown',
      draft.breakdown.map((current, position) => (position === index ? line : current))
    )
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (busy || readOnly) return
    const result = fileFromDraft(draft, file)
    if ('error' in result) {
      setError(result.error)
      return
    }
    await onSave(result.file)
  }

  return (
    <form
      className="grid max-w-xl gap-4 px-4 py-3"
      aria-label="Season settings"
      onSubmit={(event) => void submit(event)}
    >
      <fieldset disabled={readOnly || busy} className="contents">
        <Select
          label="Format"
          value={draft.format}
          items={FORMAT_ITEMS}
          onValueChange={(value) => {
            if (value) update('format', value)
          }}
        />
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Start date"
            name="start-date"
            type="date"
            value={draft.startDate}
            onChange={(event) => update('startDate', event.target.value)}
          />
          <Input
            label="Start time"
            name="start-time"
            type="time"
            value={draft.startTime}
            onChange={(event) => update('startTime', event.target.value)}
          />
          <Input
            label="Weeks"
            name="weeks"
            type="number"
            min={1}
            value={draft.weeks}
            onChange={(event) => update('weeks', event.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Fee per week (£)"
            name="fee-total"
            inputMode="decimal"
            value={draft.feeTotal}
            onChange={(event) => update('feeTotal', event.target.value)}
          />
          <Input
            label="Sub fee (£)"
            name="sub-fee"
            inputMode="decimal"
            value={draft.subFee}
            onChange={(event) => update('subFee', event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Text variant="secondary" size="sm">
            Fee breakdown, for quick look-up; it is not printed.
          </Text>
          {draft.breakdown.map((line, index) => (
            <div key={line.key} className="grid grid-cols-[1fr_8rem_auto] items-end gap-2">
              <Input
                aria-label={`Fee line ${index + 1} label`}
                placeholder="Lineage"
                value={line.label}
                onChange={(event) => updateLine(index, { ...line, label: event.target.value })}
              />
              <Input
                aria-label={`Fee line ${index + 1} amount`}
                inputMode="decimal"
                placeholder="0.00"
                value={line.amount}
                onChange={(event) => updateLine(index, { ...line, amount: event.target.value })}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  update(
                    'breakdown',
                    draft.breakdown.filter((_, position) => position !== index)
                  )
                }
              >
                Remove
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                update('breakdown', [
                  ...draft.breakdown,
                  {
                    key: draft.breakdown.reduce((max, line) => Math.max(max, line.key), -1) + 1,
                    label: '',
                    amount: ''
                  }
                ])
              }
            >
              Add fee line
            </Button>
          </div>
        </div>
        <Input
          label="LeagueSecretary season id"
          name="league-secretary-id"
          autoComplete="off"
          value={draft.leagueSecretaryId}
          onChange={(event) => update('leagueSecretaryId', event.target.value)}
        />
      </fieldset>
      {error ? (
        <Text variant="error" role="alert">
          {error}
        </Text>
      ) : null}
      {readOnly ? (
        <Text variant="secondary" size="sm">
          Archived seasons are read-only.
        </Text>
      ) : (
        <div>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      )}
    </form>
  )
}
