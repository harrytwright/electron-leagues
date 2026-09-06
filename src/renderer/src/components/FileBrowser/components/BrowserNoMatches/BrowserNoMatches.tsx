import { Button, Empty } from '@cloudflare/kumo'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import type { Props } from './interface'

export function BrowserNoMatches({ title, description, onClear }: Props): React.JSX.Element {
  return (
    <Empty
      size="sm"
      className="rounded-none border-0 bg-transparent"
      icon={<MagnifyingGlassIcon size={24} />}
      title={title}
      description={description}
      contents={
        <Button size="sm" onClick={onClear}>
          Clear filter
        </Button>
      }
    />
  )
}
