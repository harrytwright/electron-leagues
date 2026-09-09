import { useState } from 'react'
import { DropdownMenu, Text } from '@cloudflare/kumo'
import { GaugeIcon } from '@phosphor-icons/react'
import { loadDiagnosticsEnabled, saveDiagnosticsEnabled } from '@renderer/lib/local-store'
import { pathTail } from '@renderer/lib/path-basename'
import { useOperationFeedback } from '@renderer/hooks/use-operation-feedback'
import { IconButton } from '../IconButton'
import { DiagnosticsMetrics } from './components/DiagnosticsMetrics'

import type { Props } from './interface'

export function StatusBar({ path }: Props): React.JSX.Element {
  const [diagnostics, setDiagnostics] = useState(loadDiagnosticsEnabled)
  const { activity } = useOperationFeedback()

  const toggleDiagnostics = (): void => {
    const next = !diagnostics
    saveDiagnosticsEnabled(next)
    setDiagnostics(next)
  }

  return (
    <footer
      aria-label="Application status"
      className="flex min-h-7 w-full shrink-0 items-center gap-4 border-t border-kumo-line bg-kumo-base px-3"
    >
      <div className="min-w-0 flex-1">
        <Text truncate title={path}>
          {pathTail(path)}
        </Text>
      </div>
      <div role="status" aria-live="polite" className="max-w-64 min-w-0 truncate">
        {activity?.state === 'pending' ? <Text variant="secondary">{activity.label}…</Text> : null}
      </div>
      <DiagnosticsMetrics enabled={import.meta.env.DEV && diagnostics} />
      {import.meta.env.DEV ? (
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
      ) : null}
    </footer>
  )
}
