import { Text } from '@cloudflare/kumo'
import { useAppUpdateStatus } from '@renderer/hooks/use-app-update-status'
import { useDelayedFlag } from '@renderer/hooks/use-delayed-flag'

/** Fast downloads finish before this, so showing progress sooner would only flicker. */
export const DOWNLOAD_PROGRESS_DELAY_MS = 1000

export function VersionTag(): React.JSX.Element | null {
  const status = useAppUpdateStatus()
  const downloading = status?.update.kind === 'downloading' ? status.update : null
  const showDownload = useDelayedFlag(downloading !== null, DOWNLOAD_PROGRESS_DELAY_MS)
  if (!status) return null

  return (
    // The App owns the live region, so this group is labelled but never announces changes.
    <span
      role="group"
      aria-label={`Current app version ${status.version}`}
      className="flex shrink-0 items-center gap-4 whitespace-nowrap tabular-nums"
    >
      {downloading && showDownload ? (
        <Text variant="secondary">
          Downloading v{downloading.version}…
          {downloading.percent === null ? '' : ` ${downloading.percent}%`}
        </Text>
      ) : null}
      <Text variant="secondary">v{status.version}</Text>
    </span>
  )
}
