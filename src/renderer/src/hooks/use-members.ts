import { skipToken, useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { MembersSnapshot } from '@shared/members'
import { membersQuery } from '@renderer/queries/members'
import { rootQuery } from '@renderer/queries/root'

/** The members snapshot for the current location; disabled until a root is known. */
export function useMembers(): UseQueryResult<MembersSnapshot> {
  const root = useQuery(rootQuery)
  const rootPath = root.data ?? null
  const query = membersQuery(rootPath ?? '')
  return useQuery({ ...query, queryFn: rootPath === null ? skipToken : query.queryFn })
}
