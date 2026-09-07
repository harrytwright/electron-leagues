import { ToastProvider } from '@cloudflare/kumo'
import { OperationFeedbackProvider } from '../components/OperationFeedbackProvider'

export function TestProviders({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ToastProvider>
      <OperationFeedbackProvider>{children}</OperationFeedbackProvider>
    </ToastProvider>
  )
}
