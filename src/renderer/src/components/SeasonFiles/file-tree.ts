import type { DirEntry } from '@shared/tree'
import { fileType } from '../FileBrowser/file-type'
import type { Branch, FileRow, Sort } from './interface'

const names = new Intl.Collator('en-GB', { numeric: true, sensitivity: 'base' })

/** Sort siblings independently; a folder always stays with its descendants. */
export function fileRows(
  entries: DirEntry[],
  branches: Map<string, Branch>,
  expanded: Set<string>,
  sort: Sort,
  query: string,
  ancestors: DirEntry[] = []
): FileRow[] {
  const sorted = [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    const order =
      sort.column === 'mtime'
        ? a.mtime - b.mtime
        : names.compare(
            sort.column === 'type' ? fileType(a) : a.name,
            sort.column === 'type' ? fileType(b) : b.name
          )
    return (order || names.compare(a.name, b.name)) * (sort.direction === 'ascending' ? 1 : -1)
  })

  return sorted.flatMap((entry, index) => {
    const matches = !query || entry.name.toLocaleLowerCase().includes(query)
    const children = branches.get(entry.path)?.entries ?? []
    const descendants =
      entry.kind === 'folder' && (expanded.has(entry.path) || query)
        ? fileRows(children, branches, expanded, sort, matches ? '' : query, [...ancestors, entry])
        : []
    if (!matches && descendants.length === 0) return []
    return [
      {
        entry,
        ancestors,
        expanded: expanded.has(entry.path) || descendants.length > 0,
        position: index + 1,
        siblings: sorted.length
      },
      ...descendants
    ]
  })
}
