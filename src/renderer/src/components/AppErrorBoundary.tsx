import { Button, Text } from '@cloudflare/kumo'
import { ErrorBoundary } from 'react-error-boundary'
import { reportRenderError } from '../lib/analytics'

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
        <div
          role="alert"
          className="flex h-full items-center justify-center bg-kumo-base px-6 py-5"
        >
          <div className="grid max-w-md justify-items-center gap-4 text-center">
            <div className="grid gap-1.5">
              <Text as="h1" variant="heading">
                Something went wrong
              </Text>
              <Text variant="secondary">
                {error instanceof Error ? error.message : String(error)}
              </Text>
            </div>
            <Button variant="primary" onClick={() => onReload()}>
              Reload
            </Button>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}
