import { Button, Text } from '@cloudflare/kumo'
import { ErrorBoundary } from 'react-error-boundary'
import { reportRenderError } from '../lib/analytics'

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
        <div
          role="alert"
          className="flex h-full flex-col items-center justify-center gap-4 bg-kumo-base px-6 py-5 text-center"
        >
          <div className="grid max-w-md gap-1.5">
            <Text as="h2" variant="heading">
              Something went wrong
            </Text>
            <Text variant="secondary">
              {error instanceof Error ? error.message : String(error)}
            </Text>
          </div>
          <Button onClick={resetErrorBoundary}>Try again</Button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}
