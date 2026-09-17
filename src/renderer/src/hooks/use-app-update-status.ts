import { useEffect } from 'react'
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AppUpdateStatus } from '@shared/app-update'

const appUpdateQuery = queryOptions({
  queryKey: ['app-update'],
  queryFn: () => window.api.getAppUpdateStatus(),
  refetchOnMount: 'always'
})

export function useAppUpdateStatus(): AppUpdateStatus | undefined {
  const client = useQueryClient()
  const { data } = useQuery(appUpdateQuery)

  useEffect(
    () =>
      window.api.onAppUpdateChanged((status) => {
        void client.cancelQueries(appUpdateQuery).then(() => {
          client.setQueryData(appUpdateQuery.queryKey, status)
        })
      }),
    [client]
  )

  return data
}
