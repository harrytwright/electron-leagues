import { queryOptions } from '@tanstack/react-query'
import type { LeaguesTree } from '@shared/tree'

export const TREE_QUERY_PREFIX = ['tree'] as const

export function treeQueryKey(root: string): readonly ['tree', string] {
  return ['tree', root] as const
}

export function treeQuery(
  root: string
): ReturnType<
  typeof queryOptions<LeaguesTree, Error, LeaguesTree, ReturnType<typeof treeQueryKey>>
> {
  return queryOptions({
    queryKey: treeQueryKey(root),
    queryFn: async () => {
      const tree = await window.api.scan()
      if (tree === null || tree.root !== root) {
        throw new Error('The leagues folder changed while it was being read')
      }
      return tree
    }
  })
}
