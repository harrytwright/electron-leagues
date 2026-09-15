import type { BackAction } from '../../interface'

export interface Props {
  message: string
  onRetry: () => void
  onBack?: BackAction
}
