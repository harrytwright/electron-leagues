import type { RefreshResult } from '@renderer/hooks/use-location-operation'

export interface Props {
  root: string
  isHome: boolean
  onHome: () => void
  onLocationChanged: () => Promise<RefreshResult>
}
