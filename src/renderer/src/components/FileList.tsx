import { Button, Text, useKumoToastManager } from '@cloudflare/kumo'
import { File as FileIcon, Folder, Plus } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import type { FileEntry } from '@shared/tree'
import { ipcErrorMessage } from '../lib/ipc-error'

interface Props {
  files: FileEntry[]
  emptyLabel?: string
  /** When set, dropping files onto the list copies them into this folder. */
  dropInto?: string
  onImported?: () => void
}

function FileList({ files, emptyLabel, dropInto, onImported }: Props): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  // dragenter/dragleave fire for every child crossed; only depth 0 truly leaves.
  const dragDepth = useRef(0)
  const { add } = useKumoToastManager()

  const importPaths = async (paths: string[]): Promise<void> => {
    const usable = paths.filter(Boolean)
    if (!dropInto || usable.length === 0 || importing) return
    setImporting(true)
    try {
      // Main reports what it actually copied — count that, not the request.
      const copied = await window.api.importFiles(dropInto, usable)
      add({
        title:
          copied.length === usable.length
            ? `Imported ${copied.length} file${copied.length === 1 ? '' : 's'}`
            : `Imported ${copied.length} of ${usable.length} files`,
        variant: 'success'
      })
      onImported?.()
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    } finally {
      setImporting(false)
    }
  }

  const pickFiles = async (): Promise<void> => {
    if (importing) return
    try {
      const paths = await window.api.pickFiles()
      await importPaths(paths)
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    }
  }

  const onDrop = async (event: React.DragEvent): Promise<void> => {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (!dropInto) return
    const paths = Array.from(event.dataTransfer.files).map((f) => window.api.pathForFile(f))
    await importPaths(paths)
  }

  return (
    <div
      className="overflow-hidden rounded-lg bg-kumo-base ring ring-kumo-line data-[dragging]:bg-kumo-tint data-[dragging]:outline-2 data-[dragging]:outline-kumo-focus data-[dragging]:outline-dashed"
      data-dragging={dragging || undefined}
      onDragEnter={(e) => {
        if (!dropInto) return
        e.preventDefault()
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragOver={(e) => {
        if (dropInto) e.preventDefault()
      }}
      onDragLeave={() => {
        if (!dropInto) return
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragging(false)
      }}
      onDrop={(e) => void onDrop(e)}
    >
      {dropInto && (
        <div className="flex justify-end border-b border-kumo-line px-2 py-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={importing}
            icon={<Plus aria-hidden size={14} />}
            onClick={() => void pickFiles()}
          >
            {importing ? 'Importing…' : 'Add files…'}
          </Button>
        </div>
      )}
      <ul>
        {files.length === 0 && (
          <li className="px-4 py-3">
            <Text as="span" variant="secondary">
              {emptyLabel ?? 'No documents yet'}
            </Text>
          </li>
        )}
        {files.map((file) => (
          <li className="flex items-center gap-2 px-4 py-2" key={file.path}>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left hover:text-kumo-interact focus-visible:outline-2 focus-visible:outline-kumo-focus"
              title={file.path}
              onClick={() =>
                file.kind === 'file'
                  ? void window.api.openFile(file.path)
                  : void window.api.revealFile(file.path)
              }
              onContextMenu={() => void window.api.revealFile(file.path)}
            >
              <span aria-hidden="true" className="flex h-lh items-center">
                {file.kind === 'folder' ? <Folder size={14} /> : <FileIcon size={14} />}
              </span>
              <span className="truncate">{file.name}</span>
            </button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Show ${file.name} in folder`}
              onClick={() => void window.api.revealFile(file.path)}
            >
              Show in folder
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default FileList
