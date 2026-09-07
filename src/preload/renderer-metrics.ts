export interface RendererMetrics {
  usedHeapKilobytes: number
  cpuPercent: number
}

export function getRendererMetrics(): RendererMetrics {
  return {
    usedHeapKilobytes: process.getHeapStatistics().usedHeapSize,
    cpuPercent: process.getCPUUsage().percentCPUUsage
  }
}
