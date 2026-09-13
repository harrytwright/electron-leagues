import { act, waitFor } from '@testing-library/react'
import { onlineManager, useMutation, useQuery } from '@tanstack/react-query'
import { afterEach, expect, it } from 'vitest'
import { renderHookWithProviders } from '../tests/render-helpers'

afterEach(() => {
  onlineManager.setOnline(true)
})

it('completes a local query while offline', async () => {
  onlineManager.setOnline(false)
  const { result } = renderHookWithProviders(() =>
    useQuery({ queryKey: ['offline-read'], queryFn: () => Promise.resolve('local data') })
  )

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toBe('local data')
})

it('completes a local mutation while offline', async () => {
  onlineManager.setOnline(false)
  const { result } = renderHookWithProviders(() =>
    useMutation({ mutationFn: () => Promise.resolve('saved locally') })
  )

  act(() => result.current.mutate())

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toBe('saved locally')
})
