import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getRendererMetrics } from './renderer-metrics'

const originalHeapStatistics = Object.getOwnPropertyDescriptor(process, 'getHeapStatistics')
const originalCPUUsage = Object.getOwnPropertyDescriptor(process, 'getCPUUsage')

function restoreProcessProperty(
  name: 'getHeapStatistics' | 'getCPUUsage',
  descriptor?: PropertyDescriptor
): void {
  if (descriptor) {
    Object.defineProperty(process, name, descriptor)
  } else {
    Reflect.deleteProperty(process, name)
  }
}

beforeEach(() => {
  Object.defineProperties(process, {
    getHeapStatistics: {
      configurable: true,
      value: vi.fn(() => ({ usedHeapSize: 43008 }))
    },
    getCPUUsage: {
      configurable: true,
      value: vi.fn(() => ({ percentCPUUsage: 2.75 }))
    }
  })
})

afterEach(() => {
  restoreProcessProperty('getHeapStatistics', originalHeapStatistics)
  restoreProcessProperty('getCPUUsage', originalCPUUsage)
})

it('samples renderer heap in kilobytes and CPU usage synchronously', () => {
  expect(getRendererMetrics()).toEqual({ usedHeapKilobytes: 43008, cpuPercent: 2.75 })
  expect(process.getHeapStatistics).toHaveBeenCalledOnce()
  expect(process.getCPUUsage).toHaveBeenCalledOnce()
})
