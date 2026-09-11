import type { RefreshResult } from '@renderer/hooks/use-location-operation'

export interface Props {
  root: string
  /** The location changed; the caller rescans. */
  onChanged: () => Promise<RefreshResult>
}
