import * as Sentry from '@sentry/electron/renderer'
import posthog from 'posthog-js'
import 'posthog-js/dist/posthog-recorder'
import { configureTelemetry, reportFailure } from '@shared/telemetry'
import { createEventQueue } from './event-queue'

const events = createEventQueue()

export function reportRenderError(error: Error, componentStack: string | null | undefined): void {
  Sentry.captureException(error, { contexts: { react: { componentStack } } })
}

export async function initAnalytics(surface: 'main' | 'help' = 'main'): Promise<void> {
  // Synchronous and first: the renderer SDK inherits DSN/release/environment
  // from the main process (passing them here has no effect), so there is no
  // IPC round-trip to wait for and errors during startup are still captured.
  // Without a DSN in main, events simply go nowhere.
  Sentry.init({
    enableLogs: true,
    tracesSampleRate: 0.1,
    integrations: [Sentry.browserTracingIntegration()]
  })
  Sentry.setTag('surface', surface)
  configureTelemetry({
    trace: (name, attributes, run) =>
      Sentry.startSpan({ name, op: name.split('.')[0], attributes }, run),
    exception: (error, operation, attributes) => {
      Sentry.captureException(error, { tags: { operation }, extra: attributes })
    },
    warning: (message, attributes) => Sentry.logger.warn(message, attributes),
    event: captureEvent
  })

  try {
    const { apiKey, distinctId, context } = await window.api.getAnalyticsConfig()
    Sentry.setUser({ id: distinctId })
    Sentry.setTag('app_session_id', context.app_session_id)

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
        autocapture: true,
        disable_external_dependency_loading: true
      })
      posthog.register({ ...context, process: 'renderer', surface })
      posthog.onSessionId((sessionId) => {
        Sentry.setTag('posthog_session_id', sessionId)
        void window.api
          .setAnalyticsSession(sessionId)
          .catch((error) => reportFailure(error, 'analytics.session'))
      })
      events.ready((name, properties) => posthog.capture(name, properties))
    } else {
      events.ready(null)
    }
  } catch (error) {
    events.ready(null)
    reportFailure(error, 'analytics.initialise')
  }
}

/** Product events only; without a PostHog key this is a silent no-op like main's `capture`. */
export function captureEvent(
  event: string,
  properties: Record<string, string | number | boolean> = {}
): void {
  events.capture(event, properties)
}
