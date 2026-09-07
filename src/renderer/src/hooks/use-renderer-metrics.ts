import { useEffect, useState } from 'react'

type RendererMetrics = ReturnType<typeof window.api.getRendererMetrics>

export function useRendererMetrics(enabled: boolean): RendererMetrics | null {
  const [metrics, setMetrics] = useState<RendererMetrics | null>(null)

  useEffect(() => {
    if (!enabled) {
      return
    }

    const sample = (): void => {
      if (document.visibilityState === 'visible') setMetrics(window.api.getRendererMetrics())
    }
    const updatePolling = (): (() => void) | undefined => {
      if (document.visibilityState !== 'visible') return undefined
      sample()
      const interval = window.setInterval(sample, 1000)
      return () => window.clearInterval(interval)
    }

    let stopPolling = updatePolling()
    const onVisibilityChange = (): void => {
      stopPolling?.()
      stopPolling = updatePolling()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stopPolling?.()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [enabled])

  return enabled ? metrics : null
}
