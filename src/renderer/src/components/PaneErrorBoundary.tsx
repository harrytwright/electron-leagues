import { Button } from '@cloudflare/kumo'
import { ErrorBoundary } from 'react-error-boundary'
import { reportRenderError } from '../lib/analytics'
import { ErrorState } from './ErrorState'

export function PaneErrorBoundary({
  children,
  resetKeys
}: {
  children: React.ReactNode
  resetKeys: string[]
}): React.JSX.Element {
  return (
    <ErrorBoundary
      resetKeys={resetKeys}
      onError={(error, info) =>
        reportRenderError(
          error instanceof Error ? error : new Error(String(error)),
          info.componentStack
        )
      }
      fallbackRender={({ error, resetErrorBoundary }) => (
        <ErrorState>
          <ErrorState.Title as="h2">Something went wrong</ErrorState.Title>
          <ErrorState.Message>
            {error instanceof Error ? error.message : String(error)}
          </ErrorState.Message>
          <ErrorState.Actions>
            <Button onClick={resetErrorBoundary}>Try again</Button>
          </ErrorState.Actions>
        </ErrorState>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}
