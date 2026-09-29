import * as Sentry from '@sentry/electron/renderer'
import type { PostHog } from 'posthog-js'

type ProductEvent = { event: string; properties: Record<string, string | number | boolean> }

type ProductAnalytics = Pick<PostHog, 'init' | 'capture'>

let productAnalytics: ProductAnalytics | null = null
// Non-null only while PostHog is loading; events captured meanwhile replay after init.
let pendingEvents: ProductEvent[] | null = null

export function reportRenderError(error: Error, componentStack: string | null | undefined): void {
  Sentry.captureException(error, { contexts: { react: { componentStack } } })
}

/** Split out so the large SDK and session recorder stay off the first-paint bundle. */
async function importPostHog(): Promise<ProductAnalytics> {
  const [{ default: posthog }] = await Promise.all([
    import('posthog-js'),
    import('posthog-js/dist/recorder')
  ])
  return posthog
}

export async function initAnalytics(
  loadPostHog: () => Promise<ProductAnalytics> = importPostHog
): Promise<void> {
  // Synchronous and first: the renderer SDK inherits DSN/release/environment
  // from the main process (passing them here has no effect), so there is no
  // IPC round-trip to wait for and errors during startup are still captured.
  // Without a DSN in main, events simply go nowhere.
  Sentry.init({})

  // Opened before the config round-trip so early events survive it; closed below if PostHog
  // will never load, so the queue cannot grow unbounded.
  pendingEvents = []
  try {
    const { apiKey, distinctId } = await window.api.getAnalyticsConfig()
    Sentry.setUser({ id: distinctId })
    if (!apiKey) return

    const posthog = await loadPostHog()
    // Error tracking is Sentry's job — capture_exceptions stays off so
    // errors aren't double-reported. PostHog keeps product analytics
    // and session replay.
    posthog.init(apiKey, {
      api_host: 'https://eu.i.posthog.com',
      persistence: 'localStorage',
      bootstrap: { distinctID: distinctId },
      capture_exceptions: false,
      capture_pageview: false,
      capture_pageleave: false,
      autocapture: true
    })
    productAnalytics = posthog
    for (const { event, properties } of pendingEvents) posthog.capture(event, properties)
  } catch (error) {
    Sentry.captureException(error)
  } finally {
    pendingEvents = null
  }
}

/** Product events only; without a PostHog key this is a silent no-op like main's `capture`. */
export function captureEvent(
  event: string,
  properties: Record<string, string | number | boolean> = {}
): void {
  if (productAnalytics) productAnalytics.capture(event, properties)
  else pendingEvents?.push({ event, properties })
}
