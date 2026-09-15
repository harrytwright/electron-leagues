import { Button, Empty } from '@cloudflare/kumo'
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle'
import type { Props } from './interface'

export function BrowserError({ message, onRetry, onBack }: Props): React.JSX.Element {
  return (
    <Empty
      size="sm"
      className="rounded-none border-0 bg-transparent"
      icon={<WarningCircleIcon size={24} />}
      title="Couldn’t read this folder"
      description={message}
      contents={
        <div className="flex gap-2">
          {onBack ? (
            <Button size="sm" onClick={onBack.action}>
              {onBack.label}
            </Button>
          ) : null}
          <Button size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      }
    />
  )
}
