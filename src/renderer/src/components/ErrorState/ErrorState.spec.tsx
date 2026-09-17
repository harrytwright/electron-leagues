import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ErrorState } from './index'

function WrappedActions(): React.JSX.Element {
  return (
    <ErrorState.Actions>
      <button type="button">Try again</button>
    </ErrorState.Actions>
  )
}

test('renders its title and message inside the alert with actions outside it', () => {
  render(
    <ErrorState>
      <ErrorState.Title>Couldn’t load</ErrorState.Title>
      <ErrorState.Message>Something failed</ErrorState.Message>
      <ErrorState.Actions>
        <button type="button">Try again</button>
      </ErrorState.Actions>
    </ErrorState>
  )

  const alert = screen.getByRole('alert')
  expect(
    within(alert).getByRole('heading', { level: 1, name: 'Couldn’t load' })
  ).toBeInTheDocument()
  expect(within(alert).getByText('Something failed')).toBeInTheDocument()
  expect(within(alert).queryByRole('button')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
})

test('supports overriding the title heading level', () => {
  render(
    <ErrorState>
      <ErrorState.Title as="h2">Pane failed</ErrorState.Title>
      <ErrorState.Message>Try again</ErrorState.Message>
      <ErrorState.Actions>
        <button type="button">Retry</button>
      </ErrorState.Actions>
    </ErrorState>
  )

  expect(screen.getByRole('heading', { level: 2, name: 'Pane failed' })).toBeInTheDocument()
})

test.each([
  {
    name: 'a DOM element',
    child: (
      <div>
        <ErrorState.Actions>
          <button type="button">Try again</button>
        </ErrorState.Actions>
      </div>
    )
  },
  {
    name: 'a fragment',
    child: (
      <>
        <ErrorState.Actions>
          <button type="button">Try again</button>
        </ErrorState.Actions>
      </>
    )
  },
  { name: 'another component', child: <WrappedActions /> }
])('rejects actions wrapped in $name during development', ({ child }) => {
  expect(() => render(<ErrorState>{child}</ErrorState>)).toThrow(
    'ErrorState expects ErrorState.Title, ErrorState.Message or ErrorState.Actions as direct element children'
  )
})

test('allows plain strings and numbers in the alert', () => {
  render(<ErrorState>{['Failed attempts: ', 3]}</ErrorState>)

  expect(screen.getByRole('alert')).toHaveTextContent('Failed attempts: 3')
})
