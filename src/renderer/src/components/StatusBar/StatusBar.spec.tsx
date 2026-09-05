import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { installMockApi } from '../../tests/mock-api'
import { StatusBar } from './index'

afterEach(() => vi.useRealTimers())

it('shows the complete path and formatted renderer metrics', () => {
  installMockApi({
    getRendererMetrics: vi.fn(() => ({
      usedHeapKilobytes: 42.4 * 1024,
      cpuPercent: 1.24
    }))
  })
  const path = '/root/monday/Mixed triples/2025-26/Week 1'

  render(<StatusBar path={path} />)

  const status = screen.getByRole('contentinfo', { name: 'Application status' })
  expect(status).toHaveTextContent(path)
  expect(screen.getByTitle(path)).toHaveTextContent(path)
  expect(status).toHaveTextContent('Heap 42 MB')
  expect(status).toHaveTextContent('CPU 1.2%')
  expect(status).not.toHaveAttribute('aria-live')
})

it('refreshes renderer metrics once per second', () => {
  vi.useFakeTimers()
  const getRendererMetrics = vi
    .fn()
    .mockReturnValueOnce({ usedHeapKilobytes: 10 * 1024, cpuPercent: 0.1 })
    .mockReturnValue({ usedHeapKilobytes: 11 * 1024, cpuPercent: 0.25 })
  installMockApi({ getRendererMetrics })

  render(<StatusBar path="/root" />)
  expect(screen.getByText('Heap 10 MB')).toBeInTheDocument()

  act(() => vi.advanceTimersByTime(999))
  expect(getRendererMetrics).toHaveBeenCalledOnce()

  act(() => vi.advanceTimersByTime(1))
  expect(screen.getByText('Heap 11 MB')).toBeInTheDocument()
  expect(screen.getByText('CPU 0.3%')).toBeInTheDocument()
  expect(getRendererMetrics).toHaveBeenCalledTimes(2)
})

it('clears its metric interval on unmount', () => {
  vi.useFakeTimers()
  installMockApi()
  const clearInterval = vi.spyOn(window, 'clearInterval')

  const { unmount } = render(<StatusBar path="/root" />)
  unmount()

  expect(clearInterval).toHaveBeenCalledOnce()
  clearInterval.mockRestore()
})
