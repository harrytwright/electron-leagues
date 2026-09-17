import { Badge, Tooltip } from '@cloudflare/kumo'
import { CheckCircleIcon } from '@phosphor-icons/react'
import { useAppUpdateStatus } from '@renderer/hooks/use-app-update-status'

export function VersionTag(): React.JSX.Element | null {
  const status = useAppUpdateStatus()
  if (!status) return null

  const description = status.readyVersion
    ? `Current app version ${status.version}. Version ${status.readyVersion} is ready to install. Quit and reopen the app to apply the update.`
    : `Current app version ${status.version}`

  return (
    <Tooltip
      content={description}
      render={<span tabIndex={0} aria-label={description} className="shrink-0" />}
    >
      <Badge
        variant={status.readyVersion ? 'success' : 'secondary'}
        className="shrink-0 text-sm whitespace-nowrap tabular-nums"
      >
        v{status.version}
        {status.readyVersion ? (
          <span className="inline-flex items-center gap-1 text-kumo-success">
            <CheckCircleIcon aria-hidden size={14} />
            Ready to install
          </span>
        ) : null}
      </Badge>
    </Tooltip>
  )
}
