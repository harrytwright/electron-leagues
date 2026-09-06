import type { FileImporter } from '@renderer/hooks/use-import-files'

export interface Props {
  importer: FileImporter
  disabled?: boolean
  title?: string
}
