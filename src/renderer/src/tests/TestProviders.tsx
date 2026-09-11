import { ToastProvider } from '@cloudflare/kumo'
import { OperationFeedbackProvider } from '../components/OperationFeedbackProvider'
import { LocationOperationProvider } from '../components/LocationOperationProvider'

export function TestProviders({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ToastProvider>
      <OperationFeedbackProvider>
        <LocationOperationProvider>{children}</LocationOperationProvider>
      </OperationFeedbackProvider>
    </ToastProvider>
  )
}
