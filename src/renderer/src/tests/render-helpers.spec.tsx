import { screen } from '@testing-library/react'
import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { expect, it } from 'vitest'
import { createQueryClient } from '../lib/query-client'
import { renderHookWithProviders, renderWithProviders } from './render-helpers'

function ClientProbe({ clients }: { clients: QueryClient[] }): React.JSX.Element {
  const client = useQueryClient()
  return <button onClick={() => clients.push(client)}>Read client</button>
}

it('retains its default client across rerenders and uses an injected client', () => {
  const clients: QueryClient[] = []
  const view = renderWithProviders(<ClientProbe clients={clients} />)
  screen.getByRole('button', { name: 'Read client' }).click()
  view.rerender(<ClientProbe clients={clients} />)
  screen.getByRole('button', { name: 'Read client' }).click()
  expect(clients[0]).toBeInstanceOf(QueryClient)
  expect(clients[1]).toBe(clients[0])
  view.unmount()

  const queryClient = createQueryClient()
  const injected = renderWithProviders(<ClientProbe clients={clients} />, { queryClient })
  screen.getByRole('button', { name: 'Read client' }).click()
  injected.rerender(<ClientProbe clients={clients} />)
  screen.getByRole('button', { name: 'Read client' }).click()
  expect(clients[2]).toBe(queryClient)
  expect(clients[3]).toBe(queryClient)
})

it('retains hook clients across rerenders and accepts an injected client', () => {
  const hook = renderHookWithProviders(() => useQueryClient())
  const client = hook.result.current
  hook.rerender()
  expect(hook.result.current).toBe(client)

  const queryClient = createQueryClient()
  const injected = renderHookWithProviders(() => useQueryClient(), { queryClient })
  injected.rerender()
  expect(injected.result.current).toBe(queryClient)
  expect(queryClient).not.toBe(client)
})
