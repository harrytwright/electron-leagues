import { Button } from '@cloudflare/kumo'
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus'
import type { Props } from './interface'

export function ImportFilesButton({ importer, disabled, title }: Props): React.JSX.Element {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="text-base"
      disabled={disabled || importer.importing}
      title={title}
      icon={<PlusIcon aria-hidden size={14} />}
      onClick={() => void importer.pickFiles()}
    >
      {importer.importing ? 'Importing…' : 'Add files…'}
    </Button>
  )
}
