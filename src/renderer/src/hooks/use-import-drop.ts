import type { DragEvent } from 'react'
import { useKumoToastManager } from '@cloudflare/kumo'
import { isImportFileName } from '@shared/imports'

export interface ImportDropHandlers {
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}

/** Accepts one dropped bowler export and hands over its path; anything else is explained. */
export function useImportDrop(onFile: (path: string) => void): ImportDropHandlers {
  const { add } = useKumoToastManager()
  return {
    onDragOver: (event) => {
      if (!Array.from(event.dataTransfer.types).includes('Files')) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'link'
    },
    onDrop: (event) => {
      if (!Array.from(event.dataTransfer.types).includes('Files')) return
      event.preventDefault()
      const files = Array.from(event.dataTransfer.files)
      if (files.length !== 1 || !isImportFileName(files[0].name)) {
        add({ title: 'Drop one bowler export: an .xlsx from the MBD, or a .csv, .tsv or .txt' })
        return
      }
      onFile(window.api.pathForFile(files[0]))
    }
  }
}
