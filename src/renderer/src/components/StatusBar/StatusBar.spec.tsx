import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../tests/render-helpers'
import { emitAppCommand, emitAppUpdateChanged, installMockApi } from '../../tests/mock-api'
import { StatusBar } from './index'
import { useOperationFeedback } from '@renderer/hooks/use-operation-feedback'
import { useAppCommands } from '@renderer/hooks/use-app-commands'
import { useDiagnosticsCommands } from '@renderer/hooks/use-diagnostics-preference'

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

function StartOperation(): React.JSX.Element {
  const { begin, finish } = useOperationFeedback()
  return (
    <>
      <button onClick={() => begin('Importing')}>Start operation</button>
      <button onClick={() => finish(begin('Importing'))}>Fail operation</button>
    </>
  )
}

function DiagnosticsCommands(): null {
  useAppCommands()
  useDiagnosticsCommands()
  return null
}

function renderStatus(): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(
    <>
      <DiagnosticsCommands />
      <StatusBar path="/root/monday/Mixed triples/2025-26/Week 1" />
    </>
  )
}

async function enableDiagnostics(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Status options' }))
  const menu = await screen.findByRole('menu')
  await user.click(within(menu).getByRole('menuitemcheckbox', { name: 'Show diagnostics' }))
}

it('shows the installed version with diagnostics disabled and beside them when enabled', async () => {
  renderStatus()
  const version = await screen.findByLabelText('Current app version 0.2.3')
  expect(version).toHaveTextContent('v0.2.3')
  expect(screen.queryByText('Ready to install')).not.toBeInTheDocument()

  await enableDiagnostics(userEvent.setup())
  const metrics = await screen.findByText('Heap 42 MB')
  expect(version.compareDocumentPosition(metrics) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('shows a downloaded update without replacing the installed version', async () => {
  renderStatus()
  await screen.findByText('v0.2.3')

  act(() => emitAppUpdateChanged({ version: '0.2.3', readyVersion: '0.2.4' }))

  expect(await screen.findByText('Ready to install')).toBeVisible()
  expect(screen.getByText('v0.2.3')).toBeVisible()
  const tag = screen.getByLabelText(/Version 0.2.4 is ready to install/)
  await userEvent.setup().hover(tag)
  expect(await screen.findByText(/Quit and reopen the app to apply the update\./)).toBeVisible()
})

it('does not let an older snapshot overwrite a downloaded update', async () => {
  const snapshot =
    Promise.withResolvers<Awaited<ReturnType<typeof window.api.getAppUpdateStatus>>>()
  const api = installMockApi({ getAppUpdateStatus: vi.fn(() => snapshot.promise) })
  renderStatus()
  expect(api.getAppUpdateStatus).toHaveBeenCalledOnce()

  act(() => emitAppUpdateChanged({ version: '0.2.3', readyVersion: '0.2.4' }))
  expect(await screen.findByText('Ready to install')).toBeVisible()
  await act(async () => snapshot.resolve({ version: '0.2.3', readyVersion: null }))
  expect(screen.getByText('Ready to install')).toBeVisible()
})

it('restores a ready update from the main process after remounting', async () => {
  const api = installMockApi()
  const view = renderStatus()
  await screen.findByText('v0.2.3')
  view.unmount()
  vi.mocked(api.getAppUpdateStatus).mockResolvedValue({ version: '0.2.3', readyVersion: '0.2.4' })

  renderStatus()

  expect(await screen.findByText('Ready to install')).toBeVisible()
})

it('shows the last three POSIX segments while retaining the complete path title', () => {
  const api = installMockApi()
  renderStatus()
  const path = '/root/monday/Mixed triples/2025-26/Week 1'
  const pathText = screen.getByTitle(path)
  expect(pathText).toHaveTextContent('…/Mixed triples/2025-26/Week 1')
  expect(pathText).toHaveClass('overflow-hidden', 'whitespace-nowrap', 'text-ellipsis')
  expect(pathText).toHaveStyle({ direction: 'rtl', unicodeBidi: 'plaintext' })
  expect(api.getRendererMetrics).not.toHaveBeenCalled()
})

it('uses Windows separators and leaves short paths intact', () => {
  installMockApi()
  const view = renderWithProviders(<StatusBar path={'C:\\Leagues\\monday\\Pairs\\2025-26'} />)
  expect(screen.getByTitle('C:\\Leagues\\monday\\Pairs\\2025-26')).toHaveTextContent(
    'C:\\…\\monday\\Pairs\\2025-26'
  )

  view.rerender(<StatusBar path="/root/monday" />)
  expect(screen.getByTitle('/root/monday')).toHaveTextContent('/root/monday')
})

it('shows pending activity without creating a second live region', async () => {
  installMockApi()
  renderWithProviders(
    <>
      <StatusBar path="/root" />
      <StartOperation />
    </>
  )
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Start operation' }))
  expect(screen.getByText('Importing…')).toBeVisible()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('does not render completion results in the status bar', async () => {
  installMockApi()
  renderWithProviders(
    <>
      <StatusBar path="/root" />
      <StartOperation />
    </>
  )
  await userEvent.setup().click(screen.getByRole('button', { name: 'Fail operation' }))
  expect(screen.queryByText('Importing…')).not.toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('enables diagnostics from a checked status menu and persists the preference', async () => {
  installMockApi()
  const user = userEvent.setup()
  renderStatus()
  await enableDiagnostics(user)
  expect(await screen.findByText('Heap 42 MB')).toBeInTheDocument()
  expect(localStorage.getItem('leagues:diagnostics:v1')).toBe('{"enabled":true}')
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  await user.click(screen.getByRole('button', { name: 'Status options' }))
  const menu = await screen.findByRole('menu')
  expect(within(menu).getByRole('menuitemcheckbox', { name: 'Show diagnostics' })).toHaveAttribute(
    'aria-checked',
    'true'
  )
})

it('offers opt-in diagnostics in production and restores the saved preference', async () => {
  vi.stubEnv('DEV', false)
  localStorage.setItem('leagues:diagnostics:v1', '{"enabled":true}')
  const api = installMockApi()
  renderStatus()

  expect(screen.getByRole('button', { name: 'Status options' })).toBeVisible()
  expect(await screen.findByText('Heap 42 MB')).toBeVisible()
  expect(api.getRendererMetrics).toHaveBeenCalled()
  expect(api.diagnosticsChanged).toHaveBeenLastCalledWith(true)
})

it('polls only while enabled and visible, and cleans up', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const api = installMockApi()
  const clearInterval = vi.spyOn(window, 'clearInterval')
  const view = renderStatus()
  fireEvent.click(screen.getByRole('button', { name: 'Status options' }))
  let menu = await screen.findByRole('menu')
  fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Show diagnostics' }))
  fireEvent.keyDown(menu, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  expect(api.getRendererMetrics).toHaveBeenCalled()
  const initialPolls = vi.mocked(api.getRendererMetrics).mock.calls.length
  act(() => vi.advanceTimersByTime(1000))
  expect(api.getRendererMetrics).toHaveBeenCalledTimes(initialPolls + 1)
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  act(() => vi.advanceTimersByTime(2000))
  expect(api.getRendererMetrics).toHaveBeenCalledTimes(initialPolls + 1)
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(api.getRendererMetrics).toHaveBeenCalledTimes(initialPolls + 2)
  fireEvent.click(screen.getByRole('button', { name: 'Status options' }))
  menu = await screen.findByRole('menu')
  fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Show diagnostics' }))
  act(() => vi.advanceTimersByTime(2000))
  expect(api.getRendererMetrics).toHaveBeenCalledTimes(initialPolls + 2)
  view.unmount()
  expect(clearInterval).toHaveBeenCalled()
})

it('shares diagnostics preference between app commands and the status checkbox', async () => {
  const api = installMockApi()
  const user = userEvent.setup()
  renderStatus()
  expect(api.diagnosticsChanged).toHaveBeenLastCalledWith(false)
  act(() => emitAppCommand({ command: 'toggle-diagnostics', repeat: false, composing: false }))
  expect(await screen.findByText('Heap 42 MB')).toBeVisible()
  expect(api.diagnosticsChanged).toHaveBeenLastCalledWith(true)
  await user.click(screen.getByRole('button', { name: 'Status options' }))
  const menu = await screen.findByRole('menu')
  const checkbox = within(menu).getByRole('menuitemcheckbox', { name: 'Show diagnostics' })
  expect(checkbox).toHaveAttribute('aria-checked', 'true')
  await user.click(checkbox)
  expect(screen.queryByText('Heap 42 MB')).not.toBeInTheDocument()
  expect(api.diagnosticsChanged).toHaveBeenLastCalledWith(false)
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  act(() => emitAppCommand({ command: 'toggle-diagnostics', repeat: false, composing: false }))
  expect(await screen.findByText('Heap 42 MB')).toBeVisible()
  act(() => emitAppCommand({ command: 'toggle-diagnostics', repeat: false, composing: false }))
  expect(screen.queryByText('Heap 42 MB')).not.toBeInTheDocument()
  expect(localStorage.getItem('leagues:diagnostics:v1')).toBe('{"enabled":false}')
})
