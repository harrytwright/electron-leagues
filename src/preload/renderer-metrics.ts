export interface RendererMetrics {
  usedHeapKilobytes: number
  cpuPercent: number
}

export function getRendererMetrics(): RendererMetrics {
  return {
    usedHeapKilobytes: process.getHeapStatistics().usedHeapSize / 1024,
    cpuPercent: process.getCPUUsage().percentCPUUsage
  }
}
