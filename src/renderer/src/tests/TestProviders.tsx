import { ToastProvider } from '@cloudflare/kumo'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { OperationFeedbackProvider } from '../components/OperationFeedbackProvider'
import { LocationOperationProvider } from '../components/LocationOperationProvider'
import { QueryRefreshProvider } from '../components/QueryRefreshProvider'

export function TestProviders({
  children,
  locationKey,
  queryClient
}: {
  children: React.ReactNode
  locationKey?: string
  queryClient: QueryClient
}): React.JSX.Element {
  return (
    <ToastProvider>
      <QueryClientProvider client={queryClient}>
        <QueryRefreshProvider>
          <OperationFeedbackProvider locationKey={locationKey}>
            <LocationOperationProvider>{children}</LocationOperationProvider>
          </OperationFeedbackProvider>
        </QueryRefreshProvider>
      </QueryClientProvider>
    </ToastProvider>
  )
}
