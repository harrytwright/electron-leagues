import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { OperationFeedbackProvider } from '../OperationFeedbackProvider'
import { installMockApi } from '../../tests/mock-api'
import { StatusBar } from './index'
import { useOperationFeedback } from '@renderer/hooks/use-operation-feedback'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

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
  const menu = await screen.findByRole('menu')
  await user.click(within(menu).getByRole('menuitemcheckbox', { name: 'Show diagnostics' }))
}

it('shows the last three POSIX segments while retaining the complete path title', () => {
  const api = installMockApi()
  renderStatus()
  const path = '/root/monday/Mixed triples/2025-26/Week 1'
  expect(screen.getByTitle(path)).toHaveTextContent('…/Mixed triples/2025-26/Week 1')
  expect(api.getRendererMetrics).not.toHaveBeenCalled()
})

it('uses Windows separators and leaves short paths intact', () => {
  installMockApi()
  const view = render(
    <OperationFeedbackProvider>
      <StatusBar path={'C:\\Leagues\\monday\\Pairs\\2025-26'} />
    </OperationFeedbackProvider>
  )
  expect(screen.getByTitle('C:\\Leagues\\monday\\Pairs\\2025-26')).toHaveTextContent(
    '…\\monday\\Pairs\\2025-26'
  )

  view.rerender(
    <OperationFeedbackProvider>
      <StatusBar path="/root/monday" />
    </OperationFeedbackProvider>
  )
  expect(screen.getByTitle('/root/monday')).toHaveTextContent('/root/monday')
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
  expect(region.tagName).toBe('DIV')
  expect(region).toBeEmptyDOMElement()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Start operation' }))
  expect(screen.getByRole('status')).toBe(region)
  expect(region).toHaveTextContent('Importing…')
})

it('clears completed operations from the persistent live region', async () => {
  installMockApi()
  render(
    <OperationFeedbackProvider>
      <StatusBar path="/root" />
      <StartOperation />
    </OperationFeedbackProvider>
  )
  await userEvent.setup().click(screen.getByRole('button', { name: 'Fail operation' }))
  expect(screen.getByRole('status')).toBeEmptyDOMElement()
  expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
})

it('enables diagnostics from a checked status menu and persists the preference', async () => {
  installMockApi()
  renderStatus()
  await enableDiagnostics()
  expect(await screen.findByText('Heap 42 MB')).toBeInTheDocument()
  expect(localStorage.getItem('leagues:diagnostics:v1')).toBe('{"enabled":true}')
  await userEvent.setup().click(screen.getByRole('button', { name: 'Status options' }))
  const menu = await screen.findByRole('menu')
  expect(within(menu).getByRole('menuitemcheckbox', { name: 'Show diagnostics' })).toHaveAttribute(
    'aria-checked',
    'true'
  )
})

it('hides diagnostics and does not poll in production even when the preference is stored', () => {
  vi.stubEnv('DEV', false)
  localStorage.setItem('leagues:diagnostics:v1', '{"enabled":true}')
  const api = installMockApi()
  renderStatus()

  expect(screen.queryByRole('button', { name: 'Status options' })).not.toBeInTheDocument()
  expect(screen.queryByText('Heap 42 MB')).not.toBeInTheDocument()
  expect(api.getRendererMetrics).not.toHaveBeenCalled()
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
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(api.getRendererMetrics).toHaveBeenCalledTimes(3)
  fireEvent.click(screen.getByRole('button', { name: 'Status options' }))
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Show diagnostics' }))
  act(() => vi.advanceTimersByTime(2000))
  expect(api.getRendererMetrics).toHaveBeenCalledTimes(3)
  view.unmount()
  expect(clearInterval).toHaveBeenCalled()
  clearInterval.mockRestore()
})
