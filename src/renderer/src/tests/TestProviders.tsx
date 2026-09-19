import { ToastProvider } from '@cloudflare/kumo'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { OperationFeedbackProvider } from '@renderer/providers/OperationFeedbackProvider'
import { LocationOperationProvider } from '@renderer/providers/LocationOperationProvider'
import { QueryRefreshProvider } from '@renderer/providers/QueryRefreshProvider'
import { WorkspaceStoreProvider } from '@renderer/providers/WorkspaceStoreProvider'
import type { WorkspaceStore } from '../lib/workspace-store'

export function TestProviders({
  children,
  locationKey,
  queryClient,
  workspaceStore
}: {
  children: React.ReactNode
  locationKey?: string
  queryClient: QueryClient
  workspaceStore: WorkspaceStore
}): React.JSX.Element {
  return (
    <ToastProvider>
      <QueryClientProvider client={queryClient}>
        <QueryRefreshProvider>
          <WorkspaceStoreProvider store={workspaceStore}>
            <OperationFeedbackProvider locationKey={locationKey}>
              <LocationOperationProvider>{children}</LocationOperationProvider>
            </OperationFeedbackProvider>
          </WorkspaceStoreProvider>
        </QueryRefreshProvider>
      </QueryClientProvider>
    </ToastProvider>
  )
}
