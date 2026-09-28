import { useEffect, useRef } from 'react'
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { DIR_QUERY_PREFIX } from '@renderer/queries/dir'
import { ROOT_QUERY_KEY } from '@renderer/queries/root'
import { treeQueryKey } from '@renderer/queries/tree'
import type { OperationScope } from '@renderer/contexts/OperationFeedbackContext'
import { useOperationFeedback } from './use-operation-feedback'
import { useQueryRefresh } from './use-query-refresh'

export type WriteOutcome<TResult> =
  | { status: 'refreshed'; result: TResult }
  | { status: 'refresh-failed'; result: TResult; refreshError: string }
  | { status: 'deferred'; result: TResult }

export interface WriteOperationOptions<TVariables, TResult> {
  label: (variables: TVariables) => string
  scope?: OperationScope
  write: (variables: TVariables) => Promise<TResult>
  refreshQueryKey?: (root: string) => QueryKey
}

export interface WriteOperation<TVariables, TResult> {
  pending: boolean
  run: (variables: TVariables) => Promise<WriteOutcome<TResult>>
}

export function useWriteOperation<TVariables, TResult>(
  options: WriteOperationOptions<TVariables, TResult>
): WriteOperation<TVariables, TResult> {
  const queryClient = useQueryClient()
  const coordinator = useQueryRefresh()
  const feedback = useOperationFeedback()
  const optionsRef = useRef(options)

  useEffect(() => {
    optionsRef.current = options
  }, [options])

  const mutation = useMutation<WriteOutcome<TResult>, Error, TVariables, { activity: number }>({
    mutationFn: async (variables) => {
      const root = queryClient.getQueryData<string | null>(ROOT_QUERY_KEY)
      const result = await optionsRef.current.write(variables)
      const refreshQueryKey =
        root === null || root === undefined ? undefined : optionsRef.current.refreshQueryKey?.(root)

      if (queryClient.getQueryData(ROOT_QUERY_KEY) !== root) {
        if (root !== null && root !== undefined) {
          await queryClient.invalidateQueries({ queryKey: treeQueryKey(root), refetchType: 'none' })
        }
        if (refreshQueryKey) {
          await queryClient.invalidateQueries({ queryKey: refreshQueryKey, refetchType: 'none' })
        }
        await queryClient.invalidateQueries({ queryKey: DIR_QUERY_PREFIX, refetchType: 'none' })
        return { status: 'deferred', result }
      }

      try {
        await coordinator.refresh({
          queryKey: refreshQueryKey,
          throwOnError: true
        })
        return { status: 'refreshed', result }
      } catch (caught) {
        const refreshError = ipcErrorMessage(caught)
        return { status: 'refresh-failed', result, refreshError }
      }
    },
    onMutate: (variables) => ({
      activity: feedback.begin(
        optionsRef.current.label(variables),
        optionsRef.current.scope ?? 'location'
      )
    }),
    onSettled: (_data, _error, _variables, context) => {
      if (context) feedback.finish(context.activity)
    }
  })

  return { pending: mutation.isPending, run: mutation.mutateAsync }
}
