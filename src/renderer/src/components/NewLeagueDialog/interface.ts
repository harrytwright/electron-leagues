import type { Weekday } from '@shared/weekday'

export interface NewLeagueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (day: Weekday, folderName: string) => void
}

export type Props = NewLeagueDialogProps
