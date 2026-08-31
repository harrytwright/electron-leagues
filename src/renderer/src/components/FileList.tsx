import { useState } from 'react'
import type { FileEntry } from '@shared/tree'

interface Props {
  files: FileEntry[]
  emptyLabel?: string
  /** When set, dropping files onto the list copies them into this folder. */
  dropInto?: string
  onImported?: () => void
}

function FileList({ files, emptyLabel, dropInto, onImported }: Props): React.JSX.Element {
  const [dragging, setDragging] = useState(false)

  const onDrop = async (event: React.DragEvent): Promise<void> => {
    event.preventDefault()
    setDragging(false)
    if (!dropInto) return
    const paths = Array.from(event.dataTransfer.files).map((f) => window.api.pathForFile(f))
    if (paths.length > 0) {
      await window.api.importFiles(dropInto, paths)
      onImported?.()
    }
  }

  return (
    <ul
      className={`file-list ${dropInto ? 'drop-target' : ''} ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        if (dropInto) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => void onDrop(e)}
    >
      {files.length === 0 && (
        <li>
          <span className="empty">{emptyLabel ?? 'No documents yet'}</span>
        </li>
      )}
      {files.map((file) => (
        <li key={file.path}>
          <span
            className="name"
            title={file.path}
            onClick={() =>
              file.kind === 'file'
                ? void window.api.openFile(file.path)
                : void window.api.revealFile(file.path)
            }
            onContextMenu={() => void window.api.revealFile(file.path)}
          >
            {file.kind === 'folder' ? '📁 ' : ''}
            {file.name}
          </span>
          <button
            className="link"
            title="Show in folder"
            onClick={() => void window.api.revealFile(file.path)}
          >
            Show in folder
          </button>
        </li>
      ))}
    </ul>
  )
}

export default FileList
