import type { FileEntry } from '@shared/tree'

export interface Props {
  entries: FileEntry[]
  root: string
  onRefresh: () => void | Promise<void>
  onCurrentDirChange: (path: string) => void
}
