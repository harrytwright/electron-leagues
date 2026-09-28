import { useRef, useState } from 'react'
import { Button, Checkbox, Dialog, Text, useKumoToastManager } from '@cloudflare/kumo'
import { useDialogTask } from '@renderer/hooks/use-dialog-task'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { plural } from '@renderer/lib/plural'
import { TaskDialog } from '../TaskDialog'

export interface ExportCsvDialogProps {
  /** Member numbers in the order shown; the file follows the table. */
  ids: readonly number[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Writes the members shown to a CSV the desk opens in a spreadsheet. */
export function ExportCsvDialog({
  ids,
  open,
  onOpenChange
}: ExportCsvDialogProps): React.JSX.Element {
  const [marketingOnly, setMarketingOnly] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  const fieldRef = useRef<HTMLDivElement>(null)
  const task = useDialogTask({ open, onOpenChange, fieldRef })
  const { add } = useKumoToastManager()

  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setMarketingOnly(false)
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (task.busy) return
    const ticket = task.begin()
    try {
      const saved = await window.api.exportMembersCsv([...ids], { marketingOnly })
      task.settle(ticket, { type: 'completed' })
      if (!task.isCurrent(ticket)) return
      if (saved) {
        add({
          title: `Exported ${plural(saved.count, 'member')} to ${saved.path}`,
          variant: 'success'
        })
      }
      onOpenChange(false)
    } catch (caught) {
      task.settle(ticket, { type: 'failed', error: ipcErrorMessage(caught) })
    }
  }

  return (
    <TaskDialog open={open} onOpenChange={task.handleOpenChange}>
      <TaskDialog.Header
        title="Export members to CSV"
        description={`The ${plural(ids.length, 'member')} on the list, in the order shown; hidden records are left out. Members under 18 are listed with their guardian’s contact, never their own.`}
      />
      <TaskDialog.Body onSubmit={(event) => void submit(event)}>
        <div ref={fieldRef} tabIndex={-1}>
          <Checkbox
            label="Only members who accept marketing"
            checked={marketingOnly}
            onCheckedChange={(checked) => {
              setMarketingOnly(checked === true)
              if (task.error) task.edited()
            }}
          />
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
          <Button type="submit" variant="primary" disabled={task.busy || ids.length === 0}>
            {task.busy ? 'Exporting…' : 'Choose where to save…'}
          </Button>
        </TaskDialog.Actions>
      </TaskDialog.Body>
    </TaskDialog>
  )
}
