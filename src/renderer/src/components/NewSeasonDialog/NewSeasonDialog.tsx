import { useRef, useState } from 'react'
import { Button, Checkbox, Dialog, Input, Select, Text } from '@cloudflare/kumo'
import { parseSeasonName, suggestSeasonName, type SeasonType } from '@shared/season'
import {
  isWorkflowId,
  NEW_SEASON_WORKFLOWS,
  STOPPED_SEASON_WORKFLOWS,
  WORKFLOWS
} from '@shared/workflows'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { useDialogTask } from '@renderer/hooks/use-dialog-task'
import { useWriteOperation } from '@renderer/hooks/use-write-operation'
import { HelpLink } from '../HelpLink'
import { TaskDialog } from '../TaskDialog'
import type { Props, SeasonTypeOption, Source } from './interface'

const TYPES: ReadonlyArray<SeasonTypeOption> = [
  { value: 'cross-year', label: 'Cross-year', example: '2025-26' },
  { value: 'full-year', label: 'Full year', example: '2025' },
  { value: 'quarter', label: 'Quarter', example: '2026-Q1' }
]

const TYPE_ITEMS = TYPES.map((item) => ({
  value: item.value,
  label: `${item.label} (e.g. ${item.example})`
}))

const RUNNING_SOURCE_ITEMS = Object.fromEntries(
  NEW_SEASON_WORKFLOWS.map((id) => [id, WORKFLOWS[id].label])
)

const STOPPED_SOURCE_ITEMS = Object.fromEntries(
  NEW_SEASON_WORKFLOWS.map((id) => [
    id,
    STOPPED_SEASON_WORKFLOWS.includes(id)
      ? WORKFLOWS[id].label
      : { label: WORKFLOWS[id].label, disabled: true }
  ])
)

function isSeasonType(value: string): value is SeasonType {
  return TYPES.some((type) => type.value === value)
}

function isSource(value: string): value is Source {
  return isWorkflowId(value)
}

type CreateSeasonRequest = Parameters<typeof window.api.createSeason>[0]

export function NewSeasonDialog({
  league,
  open,
  onOpenChange,
  onCreated
}: Props): React.JSX.Element {
  const latestSeasonName = league.seasons.at(-1)?.name
  const current = latestSeasonName ? parseSeasonName(latestSeasonName) : null
  const initialType = current?.type ?? 'cross-year'
  const [type, setType] = useState<SeasonType>(initialType)
  const [name, setName] = useState(() => suggestSeasonName(initialType, current, new Date()))
  const [source, setSource] = useState<Source>(league.running ? 'previous' : 'templates')
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
      setSource(league.running ? 'previous' : 'templates')
      setArchiveOldest(true)
    }
  }

  const parsed = parseSeasonName(name)
  const oldest = league.seasons[0]
  const willArchive = league.seasons.length >= 2 ? oldest : null

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

    const ticket = task.begin()
    try {
      const outcome = await operation.run({
        day: league.day,
        leagueFolder: league.folderName,
        seasonName: parsed.name,
        source,
        // Never ask main to archive when the option was never shown.
        archiveOldest: willArchive ? archiveOldest : false
      })
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
        description="Choose the season name and starting documents."
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

        <Select
          label="Starting documents"
          value={source}
          items={league.running ? RUNNING_SOURCE_ITEMS : STOPPED_SOURCE_ITEMS}
          onValueChange={(value) => {
            if (value && isSource(value)) setSource(value)
          }}
        />

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
