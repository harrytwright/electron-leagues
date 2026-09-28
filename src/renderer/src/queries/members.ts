import { queryOptions } from '@tanstack/react-query'
import type { MembersSnapshot } from '@shared/members'

export const MEMBERS_QUERY_PREFIX = ['members'] as const

export function membersQueryKey(root: string): readonly ['members', string] {
  return ['members', root] as const
}

/** The master list and every season file, read fresh; refreshed with the tree by the watcher. */
export function membersQuery(
  root: string
): ReturnType<
  typeof queryOptions<MembersSnapshot, Error, MembersSnapshot, ReturnType<typeof membersQueryKey>>
> {
  return queryOptions({
    queryKey: membersQueryKey(root),
    queryFn: async () => {
      const snapshot = await window.api.membersSnapshot()
      if (snapshot === null) throw new Error('The leagues folder changed while it was being read')
      return snapshot
    }
  })
}
