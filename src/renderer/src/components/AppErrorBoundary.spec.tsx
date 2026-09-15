import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { AppErrorBoundary } from './AppErrorBoundary'

function BrokenChild(): never {
  throw new Error('App render failed')
}

it('shows an accessible fallback and reloads through the injected action', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const onReload = vi.fn()
  const user = userEvent.setup()
  render(
    <AppErrorBoundary onReload={onReload}>
      <BrokenChild />
    </AppErrorBoundary>
  )

  expect(screen.getByRole('alert')).toHaveTextContent('App render failed')
  expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reload' }))
  expect(onReload).toHaveBeenCalledExactlyOnceWith()
})

it('renders a healthy child normally', () => {
  render(
    <AppErrorBoundary>
      <p>App content</p>
    </AppErrorBoundary>
  )

  expect(screen.getByText('App content')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
