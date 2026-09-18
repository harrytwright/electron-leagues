import { useRef, useState } from 'react'
import { Button, Checkbox, Dialog, Select, Text } from '@cloudflare/kumo'
import { DEFAULT_FORMAT, MAX_FORMAT, MIN_FORMAT } from '@shared/members'
import type { SeasonSyncRequest } from '@shared/season-create'
import { useDialogTask } from '@renderer/hooks/use-dialog-task'
import { useWriteOperation } from '@renderer/hooks/use-write-operation'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { formatLabel } from '@renderer/lib/season-format'
import { TaskDialog } from '../TaskDialog'

const FORMAT_ITEMS = Object.fromEntries(
  Array.from({ length: MAX_FORMAT - MIN_FORMAT + 1 }, (_, index) => {
    const format = MIN_FORMAT + index
    return [String(format), `${formatLabel(format)} (${format} per team)`]
  })
)

export interface CreateRosterDialogProps {
  season: SeasonSyncRequest
  /** The format last season used, so a returning league starts from it. */
  defaultFormat?: number
  /** True when the season before this one has a roster to carry over. */
  previousHasRoster: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

interface RosterRequest {
  format: number
  carryOver: boolean
}

/** Gives a season made before the members database was on its own roster file. */
export function CreateRosterDialog({
  season,
  defaultFormat,
  previousHasRoster,
  open,
  onOpenChange,
  onCreated
}: CreateRosterDialogProps): React.JSX.Element {
  const [format, setFormat] = useState(defaultFormat ?? DEFAULT_FORMAT)
  const [carryOver, setCarryOver] = useState(true)
  const [wasOpen, setWasOpen] = useState(open)
  const fieldRef = useRef<HTMLDivElement>(null)
  const task = useDialogTask({ open, onOpenChange, fieldRef })
  const operation = useWriteOperation({
    label: () => `Setting up the ${season.seasonName} roster`,
    write: (request: RosterRequest) => window.api.createSeasonRoster(season, request)
  })

  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setFormat(defaultFormat ?? DEFAULT_FORMAT)
      setCarryOver(true)
    }
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (task.busy) return
    const ticket = task.begin()
    try {
      const outcome = await operation.run({ format, carryOver: previousHasRoster && carryOver })
      if (outcome.status === 'refresh-failed') {
        task.settle(ticket, {
          type: 'failed',
          error: `The roster was set up, but the season could not be refreshed: ${outcome.refreshError}`
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
    <TaskDialog open={open} onOpenChange={task.handleOpenChange}>
      <TaskDialog.Header
        title={`Set up the ${season.seasonName} roster`}
        description="Adds teams, players and settings to this season. Documents are left as they are."
      />
      <TaskDialog.Body onSubmit={(event) => void submit(event)}>
        <div ref={fieldRef} tabIndex={-1} className="grid gap-4">
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
          {previousHasRoster ? (
            <Checkbox
              label="Carry over teams and players from the previous season"
              checked={carryOver}
              onCheckedChange={setCarryOver}
            />
          ) : (
            <Text variant="secondary" size="sm">
              The roster starts empty; add teams and players from the season’s tabs.
            </Text>
          )}
        </div>
        {task.error ? (
          <Text variant="error" role="alert">
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
            {task.busy ? 'Setting up…' : 'Set up roster'}
          </Button>
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}
