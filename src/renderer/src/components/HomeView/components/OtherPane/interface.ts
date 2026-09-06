import type { FileEntry } from '@shared/tree'

export interface Props {
  entries: FileEntry[]
  root: string
  onChanged: () => void | Promise<void>
}
