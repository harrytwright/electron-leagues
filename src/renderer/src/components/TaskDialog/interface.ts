import type { ReactNode } from 'react'

export interface TaskDialogProps {
  children: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  size?: 'lg'
}

export interface TaskDialogHeaderProps {
  title: ReactNode
  description: ReactNode
}

export interface TaskDialogBodyProps {
  children: ReactNode
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}

export interface TaskDialogActionsProps {
  children: ReactNode
}
