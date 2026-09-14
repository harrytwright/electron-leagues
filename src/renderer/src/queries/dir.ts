import { queryOptions } from '@tanstack/react-query'
import type { DirEntry } from '@shared/tree'

export const DIR_QUERY_PREFIX = ['dir'] as const

export function dirQueryKey(path: string): readonly ['dir', string] {
  return ['dir', path] as const
}

export function dirListingQuery(
  path: string
): ReturnType<typeof queryOptions<DirEntry[], Error, DirEntry[], ReturnType<typeof dirQueryKey>>> {
  return queryOptions({
    queryKey: dirQueryKey(path),
    queryFn: () => window.api.listDir(path)
  })
}
