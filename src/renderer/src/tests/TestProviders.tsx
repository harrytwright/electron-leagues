import { ToastProvider } from '@cloudflare/kumo'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { OperationFeedbackProvider } from '../components/OperationFeedbackProvider'
import { LocationOperationProvider } from '../components/LocationOperationProvider'

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
        <OperationFeedbackProvider locationKey={locationKey}>
          <LocationOperationProvider>{children}</LocationOperationProvider>
        </OperationFeedbackProvider>
      </QueryClientProvider>
    </ToastProvider>
  )
}
