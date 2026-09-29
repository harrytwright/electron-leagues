import type { PostHog } from 'posthog-js'
import { describe, expect, test, vi, type Mock } from 'vitest'
import { installMockApi } from '../../tests/mock-api'

type Analytics = typeof import('../analytics')

type FakePostHog = {
  posthog: Pick<PostHog, 'init' | 'capture'>
  init: Mock
  capture: Mock
}

function fakePostHog(): FakePostHog {
  const init = vi.fn()
  const capture = vi.fn()
  return { posthog: { init, capture }, init, capture }
}

async function freshAnalytics(apiKey: string | null): Promise<Analytics> {
  vi.resetModules()
  installMockApi({
    getAnalyticsConfig: vi.fn().mockResolvedValue({ apiKey, distinctId: 'device-1' })
  })
  return import('../analytics')
}

describe('captureEvent', () => {
  test('delivers an event captured before PostHog finished loading', async () => {
    const { posthog, init, capture } = fakePostHog()
    const analytics = await freshAnalytics('phc_key')
    const ready = analytics.initAnalytics(() => Promise.resolve(posthog))
    analytics.captureEvent('help_opened', { source: 'menu' })
    expect(capture).not.toHaveBeenCalled()

    await ready

    expect(init).toHaveBeenCalledOnce()
    expect(capture).toHaveBeenCalledExactlyOnceWith('help_opened', { source: 'menu' })
  })

  test('captures straight through once PostHog is ready', async () => {
    const { posthog, capture } = fakePostHog()
    const analytics = await freshAnalytics('phc_key')
    await analytics.initAnalytics(() => Promise.resolve(posthog))
    analytics.captureEvent('help_opened')
    expect(capture).toHaveBeenCalledExactlyOnceWith('help_opened', {})
  })

  test('retains nothing without an API key', async () => {
    const loadPostHog = vi.fn()
    const analytics = await freshAnalytics(null)
    const ready = analytics.initAnalytics(loadPostHog)
    analytics.captureEvent('help_opened')
    await ready
    analytics.captureEvent('help_opened')

    expect(loadPostHog).not.toHaveBeenCalled()
  })

  test('survives a failed chunk import, stops queueing', async () => {
    const { capture } = fakePostHog()
    const analytics = await freshAnalytics('phc_key')
    const failure = new Error('chunk failed to load')
    const ready = analytics.initAnalytics(() => Promise.reject(failure))
    analytics.captureEvent('help_opened')

    await expect(ready).resolves.toBeUndefined()
    expect(() => analytics.captureEvent('help_opened')).not.toThrow()
    expect(capture).not.toHaveBeenCalled()
  })
})
