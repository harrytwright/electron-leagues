import posthog from 'posthog-js'
import 'posthog-js/dist/exception-autocapture'
import 'posthog-js/dist/recorder'

export async function initAnalytics(): Promise<void> {
  const { apiKey, distinctId } = await window.api.getAnalyticsConfig()
  if (!apiKey) return

  posthog.init(apiKey, {
    api_host: 'https://eu.i.posthog.com',
    persistence: 'localStorage',
    bootstrap: { distinctID: distinctId },
    capture_exceptions: true,
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: true
  })
}
