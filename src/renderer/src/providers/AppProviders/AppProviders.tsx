import { lazy, Suspense } from 'react'
import { ToastProvider } from '@cloudflare/kumo'
import { QueryClientProvider } from '@tanstack/react-query'
import { QueryRefreshProvider } from '@renderer/providers/QueryRefreshProvider'
import type { Props } from './interface'

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-query-devtools').then((module) => ({
        default: module.ReactQueryDevtools
      }))
    )
  : null

export function AppProviders({ queryClient, children }: Props): React.JSX.Element {
  return (
    <ToastProvider>
      <QueryClientProvider client={queryClient}>
        <QueryRefreshProvider>{children}</QueryRefreshProvider>
        {ReactQueryDevtools ? (
          <Suspense fallback={null}>
            <ReactQueryDevtools initialIsOpen={false} />
          </Suspense>
        ) : null}
      </QueryClientProvider>
    </ToastProvider>
  )
}
