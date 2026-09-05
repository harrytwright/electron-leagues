import type { FileEntry } from '@shared/tree'

export function fileType(entry: FileEntry): string {
  if (entry.kind === 'folder') return 'Folder'
  const extension = entry.name.includes('.') ? entry.name.split('.').at(-1)?.toLowerCase() : ''
  switch (extension) {
    case 'pdf':
      return 'PDF document'
    case 'doc':
    case 'docx':
    case 'odt':
      return 'Word document'
    case 'xls':
    case 'xlsx':
    case 'csv':
    case 'ods':
      return 'Spreadsheet'
    case 'zip':
    case '7z':
      return 'Archive'
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
      return 'Image'
    case 'txt':
    case 'md':
      return 'Text document'
    default:
      return extension ? `${extension.toUpperCase()} file` : 'File'
  }
}
