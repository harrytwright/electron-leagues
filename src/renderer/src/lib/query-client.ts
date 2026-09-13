import { QueryClient } from '@tanstack/react-query'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Chromium reports navigator.onLine = false with no network interface up.
        // This app reads a local disk and must work offline; never pause on that.
        networkMode: 'always',
        // IPC errors are real filesystem errors, not transient network ones.
        retry: false,
        // The file watcher tells us when data is stale; do not guess from focus.
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false
      },
      mutations: { networkMode: 'always', retry: false }
    }
  })
}
