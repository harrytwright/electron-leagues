import { queryOptions } from '@tanstack/react-query'

export const ROOT_QUERY_KEY = ['root'] as const

export const rootQuery = queryOptions({
  queryKey: ROOT_QUERY_KEY,
  queryFn: () => window.api.getRoot()
})
