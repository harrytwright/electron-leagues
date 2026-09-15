import type { BackAction } from '../../interface'

export interface Props {
  level?: number
  error: string | null | undefined
  loading: boolean
  /** The active filter text; a non-empty value turns an empty result into "no matches". */
  filter: string
  onRetry: () => void
  onBack?: BackAction
  onClearFilter: () => void
  noMatches: { title: string; description?: string }
  empty: { title: string; description?: string }
}
