import { useRef, useState } from 'react'
import { Button, Checkbox, Dialog, Input, Select, Text } from '@cloudflare/kumo'
import { DEFAULT_FORMAT, MAX_FORMAT, MIN_FORMAT } from '@shared/members'
import { parseSeasonName, suggestSeasonName, type SeasonType } from '@shared/season'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { useDialogTask } from '@renderer/hooks/use-dialog-task'
import { useWriteOperation } from '@renderer/hooks/use-write-operation'
import { formatLabel } from '@renderer/lib/season-format'
import { HelpLink } from '../HelpLink'
import { TaskDialog } from '../TaskDialog'
import type { Props, SeasonTypeOption } from './interface'

const TYPES: ReadonlyArray<SeasonTypeOption> = [
  { value: 'cross-year', label: 'Cross-year', example: '2025-26' },
  { value: 'full-year', label: 'Full year', example: '2025' },
  { value: 'quarter', label: 'Quarter', example: '2026-Q1' }
]

const TYPE_ITEMS = TYPES.map((item) => ({
  value: item.value,
  label: `${item.label} (e.g. ${item.example})`
}))

const FORMAT_ITEMS = Object.fromEntries(
  Array.from({ length: MAX_FORMAT - MIN_FORMAT + 1 }, (_, index) => {
    const format = MIN_FORMAT + index
    return [String(format), `${formatLabel(format)} (${format} per team)`]
  })
)

function isSeasonType(value: string): value is SeasonType {
  return TYPES.some((type) => type.value === value)
}

type CreateSeasonRequest = Parameters<typeof window.api.createSeason>[0]

export function NewSeasonDialog({
  league,
  roster = null,
  open,
  onOpenChange,
  onCreated
}: Props): React.JSX.Element {
  const latestSeasonName = league.seasons.at(-1)?.name
  const current = latestSeasonName ? parseSeasonName(latestSeasonName) : null
  const initialType = current?.type ?? 'cross-year'
  const [type, setType] = useState<SeasonType>(initialType)
  const [name, setName] = useState(() => suggestSeasonName(initialType, current, new Date()))
  const [copyDocuments, setCopyDocuments] = useState(true)
  const [carryOver, setCarryOver] = useState(true)
  const [format, setFormat] = useState(roster?.defaultFormat ?? DEFAULT_FORMAT)
  const [archiveOldest, setArchiveOldest] = useState(true)
  const [wasOpen, setWasOpen] = useState(open)
  const nameRef = useRef<HTMLInputElement>(null)
  const operation = useWriteOperation({
    label: () => 'Creating season',
    write: (request: CreateSeasonRequest) => window.api.createSeason(request)
  })
  const task = useDialogTask({ open, onOpenChange, fieldRef: nameRef })

  // Reset only on the closed→open transition — a tree refresh while the
  // dialog is open must not wipe what the user has typed.
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      const latest = latestSeasonName ? parseSeasonName(latestSeasonName) : null
      const nextType = latest?.type ?? 'cross-year'
      setType(nextType)
      setName(suggestSeasonName(nextType, latest, new Date()))
      setCopyDocuments(true)
      setCarryOver(true)
      setFormat(roster?.defaultFormat ?? DEFAULT_FORMAT)
      setArchiveOldest(true)
    }
  }

  const parsed = parseSeasonName(name)
  const oldest = league.seasons[0]
  const willArchive = league.seasons.length >= 2 ? oldest : null
  // Only a running league has a previous season to copy from.
  const offerPrevious = league.running

  const changeType = (nextType: SeasonType): void => {
    setType(nextType)
    setName(suggestSeasonName(nextType, current, new Date()))
    task.edited()
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (task.busy) return
    if (!parsed || parsed.type !== type) {
      const typeLabel = TYPES.find((item) => item.value === type)?.label.toLowerCase() ?? type
      task.reject(`Not a valid ${typeLabel} season name`)
      return
    }

    const request: CreateSeasonRequest = {
      day: league.day,
      leagueFolder: league.folderName,
      seasonName: parsed.name,
      source: offerPrevious && copyDocuments ? 'previous' : 'templates',
      // Never ask main to archive when the option was never shown.
      archiveOldest: willArchive ? archiveOldest : false
    }
    if (roster) request.roster = { format, carryOver: offerPrevious && carryOver }

    const ticket = task.begin()
    try {
      const outcome = await operation.run(request)
      if (outcome.status === 'refresh-failed') {
        task.settle(ticket, {
          type: 'failed',
          error: `Created “${parsed.name}”, but the league could not be refreshed: ${outcome.refreshError}`
        })
        return
      }
      task.settle(ticket, { type: 'completed' })
      if (task.isCurrent(ticket)) onCreated()
    } catch (caught) {
      task.settle(ticket, { type: 'failed', error: ipcErrorMessage(caught) })
    }
  }

  return (
    <TaskDialog open={open} onOpenChange={task.handleOpenChange} size="lg">
      <TaskDialog.Header
        title={`New season — ${league.meta.name}`}
        description={
          roster
            ? 'Choose the season name, its format and what to carry over.'
            : 'Choose the season name and starting documents.'
        }
      />

      <TaskDialog.Body onSubmit={(event) => void submit(event)}>
        <Select
          label="Season type"
          value={type}
          items={TYPE_ITEMS}
          onValueChange={(value) => {
            if (value && isSeasonType(value)) changeType(value)
          }}
        />

        <div className="grid gap-1.5">
          <Input
            ref={nameRef}
            label="Season name"
            name="season-name"
            autoComplete="off"
            autoFocus
            value={name}
            aria-invalid={task.error ? true : undefined}
            aria-describedby={task.error ? 'new-season-error' : undefined}
            onChange={(event) => {
              setName(event.target.value)
              if (task.error) task.edited()
            }}
          />
          <div>
            <HelpLink link="seasonNames">How season names work</HelpLink>
          </div>
        </div>

        {roster ? (
          <Select
            label="Format"
            value={String(format)}
            items={FORMAT_ITEMS}
            onValueChange={(value) => {
              const next = Number(value)
              if (Number.isInteger(next) && next >= MIN_FORMAT && next <= MAX_FORMAT) {
                setFormat(next)
              }
            }}
          />
        ) : null}

        {offerPrevious ? (
          <div className="grid gap-2">
            <Checkbox
              label="Copy documents from previous season"
              checked={copyDocuments}
              onCheckedChange={setCopyDocuments}
            />
            {roster ? (
              <Checkbox
                label="Carry over teams and players"
                checked={carryOver}
                onCheckedChange={setCarryOver}
              />
            ) : null}
          </div>
        ) : (
          <Text variant="secondary" size="sm">
            Documents are copied from the templates.
          </Text>
        )}

        {willArchive ? (
          <div className="grid gap-1.5">
            <Checkbox
              label={`Archive “${willArchive.name}” (moves it to _archives)`}
              checked={archiveOldest}
              onCheckedChange={setArchiveOldest}
            />
            <div>
              <HelpLink link="archiving">What archiving does</HelpLink>
            </div>
          </div>
        ) : null}

        {task.error ? (
          <Text id="new-season-error" variant="error" role="alert">
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
          <Button type="submit" variant="primary" disabled={task.busy || !name.trim()}>
            {task.busy ? 'Creating…' : 'Create season'}
          </Button>
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}
