import type { CrumbNavigation } from '@renderer/contexts/CrumbNavigationContext'

export interface Props {
  /** The base folder first, then each step drilled into; the last is current. */
  names: readonly string[]
  /** Called with how many steps below the base to keep. */
  onNavigate: CrumbNavigation
}
