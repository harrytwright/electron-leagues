import * as Sentry from '@sentry/electron/renderer'
import posthog from 'posthog-js'
import 'posthog-js/dist/recorder'

export async function initAnalytics(): Promise<void> {
  // Synchronous and first: the renderer SDK inherits DSN/release/environment
  // from the main process (passing them here has no effect), so there is no
  // IPC round-trip to wait for and errors during startup are still captured.
  // Without a DSN in main, events simply go nowhere.
  Sentry.init({})

  const { apiKey, distinctId } = await window.api.getAnalyticsConfig()
  Sentry.setUser({ id: distinctId })

  if (apiKey) {
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
  }
}
