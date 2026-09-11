export interface Props {
  baseDir: string
  label: string
  present: boolean
  onChanged: () => void | Promise<void>
  /** Separate so ordinary refresh cannot inherit post-write rejection semantics. */
  onRefresh: () => void | Promise<void>
  onCurrentDirChange: (path: string) => void
}
