import { expect, test } from 'vitest'
import {
  currentRendererSession,
  setRendererSession,
  withRendererSession
} from '../renderer-sessions'

test('links an early request to its first registered session without following later rotations', async () => {
  const renderer = { id: 1 }
  const pending = Promise.withResolvers<void>()
  const request = withRendererSession(renderer, async () => {
    expect(currentRendererSession()).toBeUndefined()
    await pending.promise
    return currentRendererSession()
  })
  setRendererSession(renderer, 'first-session')
  setRendererSession(renderer, 'next-session')
  pending.resolve()
  await expect(request).resolves.toBe('first-session')
  expect(withRendererSession(renderer, currentRendererSession)).toBe('next-session')
})

test('keeps early requests from overlapping windows in their own first sessions', async () => {
  const main = { id: 1 }
  const help = { id: 2 }
  const pending = Promise.withResolvers<void>()
  const first = withRendererSession(main, async () => {
    await pending.promise
    return currentRendererSession()
  })
  const second = withRendererSession(help, async () => {
    await pending.promise
    return currentRendererSession()
  })
  setRendererSession(help, 'help-session')
  setRendererSession(main, 'main-session')
  pending.resolve()
  await expect(first).resolves.toBe('main-session')
  await expect(second).resolves.toBe('help-session')
  expect(currentRendererSession()).toBeUndefined()
})

test('keeps overlapping renderer operations in their own replay sessions', async () => {
  const main = { id: 1 }
  const help = { id: 2 }
  setRendererSession(main, 'main-session')
  setRendererSession(help, 'help-session')
  const pending = Promise.withResolvers<void>()
  const first = withRendererSession(main, async () => {
    await pending.promise
    return currentRendererSession()
  })
  const second = withRendererSession(help, async () => currentRendererSession())
  await expect(second).resolves.toBe('help-session')
  pending.resolve()
  await expect(first).resolves.toBe('main-session')
  expect(currentRendererSession()).toBeUndefined()
})

test('uses session rotations for new operations without changing an in-flight operation', async () => {
  const renderer = { id: 1 }
  setRendererSession(renderer, 'old-session')
  await withRendererSession(renderer, async () => {
    setRendererSession(renderer, 'new-session')
    await Promise.resolve()
    expect(currentRendererSession()).toBe('old-session')
  })
  expect(withRendererSession(renderer, currentRendererSession)).toBe('new-session')
  expect(withRendererSession({ id: 3 }, currentRendererSession)).toBeUndefined()
})
