export interface DeleteTarget {
  kind: 'league' | 'season'
  /** Display name the user must type to confirm. */
  name: string
  path: string
  /** A league's `_archives` folder goes with it; say so when there is one. */
  hasArchives?: boolean
}

export interface Props {
  target: DeleteTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: (target: DeleteTarget) => void | Promise<void>
}
