import { FileIcon } from '@phosphor-icons/react/dist/csr/File'
import { FilePdfIcon } from '@phosphor-icons/react/dist/csr/FilePdf'
import { FileTextIcon } from '@phosphor-icons/react/dist/csr/FileText'
import { FileXlsIcon } from '@phosphor-icons/react/dist/csr/FileXls'
import { FileZipIcon } from '@phosphor-icons/react/dist/csr/FileZip'
import { FolderIcon } from '@phosphor-icons/react/dist/csr/Folder'
import { FolderOpenIcon } from '@phosphor-icons/react/dist/csr/FolderOpen'
import { ImageIcon } from '@phosphor-icons/react/dist/csr/Image'
import { fileType } from './file-type'
import type { EntryIconProps } from './interface'

export function FileEntryIcon({ entry, expanded = false }: EntryIconProps): React.JSX.Element {
  const type = fileType(entry)
  const props = { size: 18, 'aria-hidden': true as const }
  if (entry.kind === 'folder') {
    return expanded ? (
      <FolderOpenIcon {...props} weight="duotone" className="text-kumo-warning" />
    ) : (
      <FolderIcon {...props} weight="duotone" className="text-kumo-warning" />
    )
  }
  switch (type) {
    case 'PDF document':
      return <FilePdfIcon {...props} className="text-kumo-danger" />
    case 'Spreadsheet':
      return <FileXlsIcon {...props} className="text-kumo-success" />
    case 'Word document':
    case 'Text document':
      return <FileTextIcon {...props} className="text-kumo-link" />
    case 'Archive':
      return <FileZipIcon {...props} className="text-kumo-subtle" />
    case 'Image':
      return <ImageIcon {...props} className="text-kumo-subtle" />
    default:
      return <FileIcon {...props} className="text-kumo-subtle" />
  }
}
