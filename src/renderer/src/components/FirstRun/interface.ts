import type { RefreshResult } from '@renderer/hooks/use-location-operation'

export type Mode = 'select' | 'init'

export interface Props {
  onChosen: () => Promise<RefreshResult>
}
