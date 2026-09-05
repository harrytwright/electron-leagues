import { useEffect, useState } from 'react'
import { Text } from '@cloudflare/kumo'

import type { Props } from './interface'

export function StatusBar({ path }: Props): React.JSX.Element {
  const [metrics, setMetrics] = useState(() => window.api.getRendererMetrics())

  useEffect(() => {
    const interval = window.setInterval(() => {
      setMetrics(window.api.getRendererMetrics())
    }, 1000)

    return () => window.clearInterval(interval)
  }, [])

  return (
    <footer
      aria-label="Application status"
      className="flex h-5 w-full shrink-0 items-center gap-4 border-t border-kumo-line bg-kumo-base px-3 text-base"
    >
      <div className="min-w-0 flex-1">
        <Text size="xs" truncate title={path}>
          {path}
        </Text>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-kumo-subtle tabular-nums">
        <Text
          size="xs"
          variant="secondary"
        >{`Heap ${Math.round(metrics.usedHeapKilobytes / 1024)} MB`}</Text>
        <Text size="xs" variant="secondary">{`CPU ${metrics.cpuPercent.toFixed(1)}%`}</Text>
      </div>
    </footer>
  )
}
