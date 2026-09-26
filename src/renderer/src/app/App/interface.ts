import type { QueryClient, UseQueryResult } from '@tanstack/react-query'
import type { WorkspaceStore } from '@renderer/lib/workspace-store'

export interface Props {
  queryClient: QueryClient
  workspaceStore: WorkspaceStore
}

export interface ScanErrorProps {
  message: string | null
  onRetry: () => Promise<void>
  onChooseAnother: () => Promise<void>
}

export interface ApplicationActivityProps {
  visible: boolean
}

export interface LocationContentProps {
  root: UseQueryResult<string | null>
}
