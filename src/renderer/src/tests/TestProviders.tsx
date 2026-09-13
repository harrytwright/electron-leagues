import { ToastProvider } from '@cloudflare/kumo'
import { OperationFeedbackProvider } from '../components/OperationFeedbackProvider'
import { LocationOperationProvider } from '../components/LocationOperationProvider'

export function TestProviders({
  children,
  locationKey
}: {
  children: React.ReactNode
  locationKey?: string
}): React.JSX.Element {
  return (
    <ToastProvider>
      <OperationFeedbackProvider locationKey={locationKey}>
        <LocationOperationProvider>{children}</LocationOperationProvider>
      </OperationFeedbackProvider>
    </ToastProvider>
  )
}
