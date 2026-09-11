import { DropdownMenu, Text } from '@cloudflare/kumo'
import { GaugeIcon } from '@phosphor-icons/react'
import { saveDiagnosticsEnabled } from '@renderer/lib/local-store'
import { useDiagnosticsPreference } from '@renderer/hooks/use-diagnostics-preference'
import { pathTail } from '@renderer/lib/path-basename'
import { useOperationFeedback } from '@renderer/hooks/use-operation-feedback'
import { IconButton } from '../IconButton'
import { DiagnosticsMetrics } from './components/DiagnosticsMetrics'

import type { Props } from './interface'

export function StatusBar({ path }: Props): React.JSX.Element {
  // Diagnostics are opt-in in every build: production performance is the feature's purpose.
  const diagnostics = useDiagnosticsPreference()
  const { activity } = useOperationFeedback()

  const toggleDiagnostics = (): void => {
    const next = !diagnostics
    saveDiagnosticsEnabled(next)
  }

  return (
    <footer
      aria-label="Application status"
      className="flex min-h-7 w-full shrink-0 items-center gap-4 border-t border-kumo-line bg-kumo-base px-3"
    >
      <div className="min-w-0 flex-1">
        {/* pathTail already bounds the text; tail truncation would hide the current folder. */}
        <Text title={path}>{pathTail(path)}</Text>
      </div>
      {/* App owns the persistent live region; this visual copy must not announce twice. */}
      <div className="max-w-64 min-w-0 truncate" data-operation-activity>
        {activity ? <Text variant="secondary">{activity.label}…</Text> : null}
      </div>
      <DiagnosticsMetrics enabled={diagnostics} />
      <DropdownMenu>
        <DropdownMenu.Trigger
          render={
            <IconButton
              variant="ghost"
              size="sm"
              icon={<GaugeIcon aria-hidden />}
              aria-label="Status options"
            />
          }
        />
        <DropdownMenu.Content align="end">
          <DropdownMenu.CheckboxItem checked={diagnostics} onCheckedChange={toggleDiagnostics}>
            Show diagnostics
          </DropdownMenu.CheckboxItem>
        </DropdownMenu.Content>
      </DropdownMenu>
    </footer>
  )
}
