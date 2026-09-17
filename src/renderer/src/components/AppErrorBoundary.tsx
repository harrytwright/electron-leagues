import { Button } from '@cloudflare/kumo'
import { ErrorBoundary } from 'react-error-boundary'
import { reportRenderError } from '../lib/analytics'
import { ErrorState } from './ErrorState'

export function AppErrorBoundary({
  children,
  onReload = () => window.location.reload()
}: {
  children: React.ReactNode
  onReload?: () => void
}): React.JSX.Element {
  return (
    <ErrorBoundary
      onError={(error, info) =>
        reportRenderError(
          error instanceof Error ? error : new Error(String(error)),
          info.componentStack
        )
      }
      fallbackRender={({ error }) => (
        <ErrorState>
          <ErrorState.Title>Something went wrong</ErrorState.Title>
          <ErrorState.Message>
            {error instanceof Error ? error.message : String(error)}
          </ErrorState.Message>
          <ErrorState.Actions>
            <Button variant="primary" onClick={() => onReload()}>
              Reload
            </Button>
          </ErrorState.Actions>
        </ErrorState>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}
