import { ToastProvider } from '@cloudflare/kumo'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { OperationFeedbackProvider } from '../components/OperationFeedbackProvider'
import { LocationOperationProvider } from '../components/LocationOperationProvider'
import { QueryRefreshProvider } from '../components/QueryRefreshProvider'
import { WorkspaceStoreProvider } from '../components/WorkspaceStoreProvider'
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
