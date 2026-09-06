import { Empty } from '@cloudflare/kumo'
import { FolderOpenIcon } from '@phosphor-icons/react/dist/csr/FolderOpen'
import type { Props } from './interface'

export function BrowserEmpty({ title, description }: Props): React.JSX.Element {
  return (
    <Empty
      size="sm"
      className="rounded-none border-0 bg-transparent"
      icon={<FolderOpenIcon size={24} />}
      title={title}
      description={description}
    />
  )
}
