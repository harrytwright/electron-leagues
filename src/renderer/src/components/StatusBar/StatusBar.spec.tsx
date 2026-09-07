import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { OperationFeedbackProvider } from '../OperationFeedbackProvider'
import { installMockApi } from '../../tests/mock-api'
import { StatusBar } from './index'
import { useOperationFeedback } from '@renderer/hooks/use-operation-feedback'

afterEach(() => vi.useRealTimers())

function StartOperation(): React.JSX.Element {
  const { begin, finish } = useOperationFeedback()
  return (
    <>
      <button onClick={() => begin('Importing')}>Start operation</button>
      <button onClick={() => finish(begin('Importing'), 'error', 'Import failed')}>
        Fail operation
      </button>
    </>
  )
}

function renderStatus(): ReturnType<typeof render> {
  return render(
    <OperationFeedbackProvider>
      <StatusBar path="/root/monday/Mixed triples/2025-26/Week 1" />
    </OperationFeedbackProvider>
  )
}

async function enableDiagnostics(): Promise<void> {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Status options' }))
  await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Show diagnostics' }))
}

it('keeps the complete path visible and leaves diagnostics off by default', () => {
  const api = installMockApi()
  renderStatus()
  const path = '/root/monday/Mixed triples/2025-26/Week 1'
  expect(screen.getByTitle(path)).toHaveTextContent(path)
  expect(api.getRendererMetrics).not.toHaveBeenCalled()
})

it('updates an existing live region when the first operation starts', async () => {
  installMockApi()
  render(
    <OperationFeedbackProvider>
      <StatusBar path="/root" />
      <StartOperation />
    </OperationFeedbackProvider>
  )
  const region = screen.getByRole('status')
  expect(region).toBeEmptyDOMElement()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Start operation' }))
  expect(screen.getByRole('status')).toBe(region)
  expect(region).toHaveTextContent('Importing…')
})

it('keeps errors visible while leaving their announcement to the toast', async () => {
  installMockApi()
  render(
    <OperationFeedbackProvider>
      <StatusBar path="/root" />
      <StartOperation />
    </OperationFeedbackProvider>
  )
  await userEvent.setup().click(screen.getByRole('button', { name: 'Fail operation' }))
  expect(screen.getByRole('status')).toHaveTextContent('Import failed')
  expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'off')
})

it('enables diagnostics from a checked status menu and persists the preference', async () => {
  installMockApi()
  renderStatus()
  await enableDiagnostics()
  expect(await screen.findByText('Heap 42 MB')).toBeInTheDocument()
  expect(localStorage.getItem('leagues:diagnostics:v1')).toBe('{"enabled":true}')
  await userEvent.setup().click(screen.getByRole('button', { name: 'Status options' }))
  expect(await screen.findByRole('menuitemcheckbox', { name: 'Show diagnostics' })).toHaveAttribute(
    'aria-checked',
    'true'
  )
})

it('polls only while enabled and visible, and cleans up', async () => {
  vi.useFakeTimers()
  const api = installMockApi()
  const clearInterval = vi.spyOn(window, 'clearInterval')
  const view = renderStatus()
  fireEvent.click(screen.getByRole('button', { name: 'Status options' }))
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Show diagnostics' }))
  expect(api.getRendererMetrics).toHaveBeenCalledOnce()
  act(() => vi.advanceTimersByTime(1000))
  expect(api.getRendererMetrics).toHaveBeenCalledTimes(2)
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  act(() => vi.advanceTimersByTime(2000))
  expect(api.getRendererMetrics).toHaveBeenCalledTimes(2)
  view.unmount()
  expect(clearInterval).toHaveBeenCalled()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  clearInterval.mockRestore()
})
