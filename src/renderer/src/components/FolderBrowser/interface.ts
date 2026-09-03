export interface Props {
  baseDir: string
  baseLabel: string
  /** Allow dropping and picking files into whichever folder is being viewed. */
  canImport?: boolean
  onImported?: () => void | Promise<void>
  /** Copy for an empty base folder; subfolders get a neutral message. */
  emptyTitle?: string
  emptyDescription?: string
}
