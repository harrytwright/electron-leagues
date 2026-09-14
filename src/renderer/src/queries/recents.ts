import { queryOptions } from '@tanstack/react-query'

export const RECENTS_QUERY_KEY = ['recents'] as const

export const recentsQuery = queryOptions({
  queryKey: RECENTS_QUERY_KEY,
  queryFn: () => window.api.recentRoots()
})
