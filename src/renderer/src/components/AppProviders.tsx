import { lazy, Suspense } from 'react'
import { ToastProvider } from '@cloudflare/kumo'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-query-devtools').then((module) => ({
        default: module.ReactQueryDevtools
      }))
    )
  : null

export function AppProviders({
  queryClient,
  children
}: {
  queryClient: QueryClient
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <ToastProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        {ReactQueryDevtools ? (
          <Suspense fallback={null}>
            <ReactQueryDevtools initialIsOpen={false} />
          </Suspense>
        ) : null}
      </QueryClientProvider>
    </ToastProvider>
  )
}
