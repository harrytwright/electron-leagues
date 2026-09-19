import { WorkspaceStoreContext } from '@renderer/contexts/WorkspaceStoreContext'
import type { Props } from './interface'

export function WorkspaceStoreProvider({ store, children }: Props): React.JSX.Element {
  return <WorkspaceStoreContext value={store}>{children}</WorkspaceStoreContext>
}
