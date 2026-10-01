import { expect, test, vi } from 'vitest'
import { createEventQueue } from './event-queue'

test('delivers the initial help view after asynchronous configuration, then sends immediately', () => {
  const queue = createEventQueue()
  const send = vi.fn()
  queue.capture('help_opened', { topic: 'getting-started' })
  expect(send).not.toHaveBeenCalled()
  queue.ready(send)
  queue.capture('help_opened', { topic: 'members' })
  expect(send.mock.calls).toEqual([
    ['help_opened', { topic: 'getting-started' }],
    ['help_opened', { topic: 'members' }]
  ])
})

test('discards events when analytics is unconfigured or initialisation fails', () => {
  const queue = createEventQueue()
  const send = vi.fn()
  queue.capture('help_opened', { topic: 'members' })
  queue.ready(null)
  queue.capture('help_opened', { topic: 'members' })
  queue.ready(send)
  expect(send).not.toHaveBeenCalled()
})

test('bounds events retained while configuration is pending', () => {
  const queue = createEventQueue()
  const send = vi.fn()
  for (let i = 0; i < 150; i += 1) queue.capture('event', { i })
  queue.ready(send)
  expect(send).toHaveBeenCalledTimes(100)
  expect(send).toHaveBeenNthCalledWith(1, 'event', { i: 50 })
})
