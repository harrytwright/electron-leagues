import { Text } from '@cloudflare/kumo'
import { useRendererMetrics } from '@renderer/hooks/use-renderer-metrics'

export function DiagnosticsMetrics({ enabled }: { enabled: boolean }): React.JSX.Element | null {
  const metrics = useRendererMetrics(enabled)
  if (!metrics) return null

  return (
    <div className="flex shrink-0 items-center gap-4 text-kumo-subtle tabular-nums">
      <Text variant="secondary">{`Heap ${Math.round(metrics.usedHeapKilobytes / 1024)} MB`}</Text>
      <Text variant="secondary">{`CPU ${metrics.cpuPercent.toFixed(1)}%`}</Text>
    </div>
  )
}
