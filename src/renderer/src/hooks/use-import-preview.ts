import { skipToken, useQuery } from '@tanstack/react-query'
import type { ImportMapping, MappingPreview } from '@shared/imports'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { useKeyedState } from './use-keyed-state'

export type ImportPreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'failed'; error: string }
  | { status: 'ready'; preview: MappingPreview; mapping: ImportMapping }

export interface ImportPreview {
  state: ImportPreviewState
  setMapping: (mapping: ImportMapping) => void
}

/** Columns, sample and mapping for the export at `path`; edits to the mapping last while the path does. */
export function useImportPreview(path: string | null): ImportPreview {
  const query = useQuery({
    queryKey: ['import-preview', path],
    queryFn: path === null ? skipToken : () => window.api.previewImport(path),
    staleTime: Infinity,
    gcTime: 0,
    retry: false
  })
  const [edited, setEdited] = useKeyedState<string | null, ImportMapping | null>(path, null)

  let state: ImportPreviewState
  if (path === null) state = { status: 'idle' }
  else if (query.data) {
    state = { status: 'ready', preview: query.data, mapping: edited ?? query.data.mapping }
  } else if (query.isError) state = { status: 'failed', error: ipcErrorMessage(query.error) }
  else state = { status: 'loading' }

  return { state, setMapping: setEdited }
}
