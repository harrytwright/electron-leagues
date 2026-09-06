import { useRef, useState } from 'react'
import { Input } from '@cloudflare/kumo'
import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise'
import { FolderOpenIcon } from '@phosphor-icons/react/dist/csr/FolderOpen'
import { LockSimpleIcon } from '@phosphor-icons/react/dist/csr/LockSimple'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { TreeStructureIcon } from '@phosphor-icons/react/dist/csr/TreeStructure'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import { IconButton } from '../../../IconButton'
import type { Props } from './interface'

/** Shared desktop pane: fixed controls and status, with a scrolling file area. */
export function FileBrowserFrame({
  name,
  heading,
  readOnly,
  query,
  filterLabel,
  onQueryChange,
  onRefresh,
  onDropFiles,
  actions,
  summary,
  selection,
  children
}: Props): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const canDrop = !readOnly && onDropFiles !== undefined

  return (
    <section
      aria-label={`${name} files`}
      data-file-drop-target
      className="relative flex min-h-0 flex-1 flex-col bg-kumo-base text-base"
      onDragEnter={(event) => {
        if (!canDrop || !Array.from(event.dataTransfer.types).includes('Files')) return
        event.preventDefault()
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragOver={(event) => {
        if (canDrop && Array.from(event.dataTransfer.types).includes('Files')) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        dragDepth.current = 0
        setDragging(false)
        if (canDrop)
          void onDropFiles(
            Array.from(event.dataTransfer.files).map((file) => window.api.pathForFile(file))
          )
      }}
    >
      <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-kumo-line px-4 py-2">
        <div className="flex items-center gap-2 text-kumo-subtle">
          <TreeStructureIcon aria-hidden size={16} />
          <span className="font-medium text-kumo-default">{heading}</span>
          {readOnly ? (
            <span className="flex items-center gap-1.5">
              <LockSimpleIcon aria-hidden size={14} />
              Read-only
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative w-56">
            <MagnifyingGlassIcon
              aria-hidden
              size={16}
              className="pointer-events-none absolute top-1/2 left-2 z-1 -translate-y-1/2 text-kumo-subtle"
            />
            <Input
              aria-label={filterLabel}
              placeholder={`${filterLabel}…`}
              value={query}
              onValueChange={onQueryChange}
              className="h-7 rounded-md pr-7 pl-7 text-base"
            />
            {query ? (
              <IconButton
                aria-label="Clear filter"
                variant="ghost"
                size="xs"
                className="absolute top-1/2 right-1 -translate-y-1/2"
                icon={<XIcon aria-hidden size={12} />}
                onClick={() => onQueryChange('')}
              />
            ) : null}
          </div>
          {actions}
          <IconButton
            aria-label="Refresh files"
            variant="ghost"
            size="sm"
            icon={<ArrowClockwiseIcon aria-hidden size={16} />}
            onClick={onRefresh}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 scroll-pt-10 overflow-auto">{children}</div>
      <div
        aria-live="polite"
        className="flex min-h-9 shrink-0 items-center justify-between gap-4 border-t border-kumo-line px-4 py-2 text-kumo-subtle"
      >
        <span>{summary}</span>
        <span className="truncate">{selection ?? 'Double-click to open'}</span>
      </div>
      {dragging ? (
        <div className="pointer-events-none absolute inset-1 z-20 flex items-center justify-center rounded-md bg-kumo-base/90 outline-2 -outline-offset-2 outline-kumo-focus outline-dashed">
          <span className="flex items-center gap-2 font-medium">
            <FolderOpenIcon aria-hidden size={20} />
            Add files to {name}
          </span>
        </div>
      ) : null}
    </section>
  )
}
