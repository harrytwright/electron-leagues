import { Dialog } from '@cloudflare/kumo'
import type {
  TaskDialogActionsProps,
  TaskDialogBodyProps,
  TaskDialogHeaderProps,
  TaskDialogProps
} from './interface'

function TaskDialogRoot({
  children,
  open,
  onOpenChange,
  size
}: TaskDialogProps): React.JSX.Element {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size={size} className="app-modal w-full max-w-lg p-5">
        {children}
      </Dialog>
    </Dialog.Root>
  )
}

function TaskDialogHeader({ title, description }: TaskDialogHeaderProps): React.JSX.Element {
  return (
    <div className="mb-4 grid gap-1.5">
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description className="text-kumo-subtle">{description}</Dialog.Description>
    </div>
  )
}

function TaskDialogBody({ children, onSubmit }: TaskDialogBodyProps): React.JSX.Element {
  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      {children}
    </form>
  )
}

function TaskDialogActions({ children }: TaskDialogActionsProps): React.JSX.Element {
  return (
    <div className="-mx-5 mt-1 flex justify-end gap-2 border-t border-kumo-line px-5 pt-4">
      {children}
    </div>
  )
}

export const TaskDialog = Object.assign(TaskDialogRoot, {
  Header: TaskDialogHeader,
  Body: TaskDialogBody,
  Actions: TaskDialogActions
})
