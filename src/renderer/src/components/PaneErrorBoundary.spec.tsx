import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { PaneErrorBoundary } from './PaneErrorBoundary'

function Pane({ read }: { read: () => string }): React.JSX.Element {
  return <p>{read()}</p>
}

it('isolates a pane failure and retries its child', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const read = vi.fn((): string => {
    throw new Error('Pane render failed')
  })
  const user = userEvent.setup()
  render(
    <>
      <nav>Sidebar</nav>
      <PaneErrorBoundary resetKeys={['home']}>
        <Pane read={read} />
      </PaneErrorBoundary>
    </>
  )

  expect(screen.getByRole('alert')).toHaveTextContent('Pane render failed')
  expect(screen.getByRole('navigation')).toHaveTextContent('Sidebar')
  read.mockImplementation(() => 'Recovered pane')
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(screen.getByText('Recovered pane')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('retries its child when the selection reset key changes', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const read = vi.fn((): string => {
    throw new Error('Pane render failed')
  })
  const view = render(
    <PaneErrorBoundary resetKeys={['home']}>
      <Pane read={read} />
    </PaneErrorBoundary>
  )
  expect(screen.getByRole('alert')).toHaveTextContent('Pane render failed')

  read.mockImplementation(() => 'League pane')
  view.rerender(
    <PaneErrorBoundary resetKeys={['league']}>
      <Pane read={read} />
    </PaneErrorBoundary>
  )
  expect(screen.getByText('League pane')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
