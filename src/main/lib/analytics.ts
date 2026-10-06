import * as Sentry from '@sentry/electron/main'
import { app } from 'electron'
import { PostHog } from 'posthog-node'
import { randomUUID } from 'node:crypto'
import { configureTelemetry, type TelemetryAttributes } from '../../shared/telemetry'
import { UserFacingError } from './fs-errors'
import { currentRendererSession } from './renderer-sessions'

let client: PostHog | null = null
let distinctId = 'leagues-app'
const appSessionId = randomUUID()

export function analyticsContext(): TelemetryAttributes {
  return {
    app_version: app.getVersion(),
    environment: app.isPackaged ? 'production' : 'development',
    platform: process.platform,
    app_session_id: appSessionId
  }
}

/**
 * Both services are optional: no Sentry DSN / PostHog API key (env var,
 * build-time MAIN_VITE_ value, or the stored setting) means a silent no-op.
 * Sentry must come first so its process-level error hooks and the IPC
 * bridge the renderer SDK relies on exist before anything else runs.
 */
export function initAnalytics(
  apiKey: string | undefined,
  sentryDSN: string | undefined,
  machineId: string
): void {
  distinctId = machineId

  if (sentryDSN) {
    Sentry.init({
      dsn: sentryDSN,
      release: __LEAGUES_RELEASE__,
      environment: app.isPackaged ? 'production' : 'development',
      enableLogs: true,
      tracesSampleRate: 0.1,
      integrations: [Sentry.startupTracingIntegration()]
    })
    Sentry.setUser({ id: machineId })
    Sentry.setTag('app_session_id', appSessionId)
  }

  if (apiKey) {
    client = new PostHog(apiKey, {
      host: 'https://eu.i.posthog.com',
      flushAt: 5,
      flushInterval: 10000
    })
  }

  configureTelemetry({
    trace: (name, attributes, run) =>
      Sentry.startSpan({ name, op: name.split('.')[0], attributes }, async (span) => {
        try {
          const result = await run(span)
          span.setAttribute('outcome', 'success')
          return result
        } catch (error) {
          span.setAttribute('outcome', error instanceof UserFacingError ? 'refused' : 'failed')
          throw error
        }
      }),
    exception: (error, operation, attributes) => {
      Sentry.captureException(error, {
        tags: { operation, ipc_channel: attributes.ipc_channel, error_code: attributes.code },
        extra: attributes
      })
    },
    warning: (message, attributes) => Sentry.logger.warn(message, attributes),
    event: capture
  })
}

export function capture(
  event: string,
  properties: Record<string, string | number | boolean> = {}
): void {
  const context: TelemetryAttributes = { ...analyticsContext(), process: 'main', ...properties }
  const sessionId = currentRendererSession()
  if (sessionId) context.$session_id = sessionId
  client?.capture({
    distinctId,
    event,
    properties: context
  })
}

export async function shutdownAnalytics(): Promise<void> {
  await Promise.allSettled([client?.shutdown(2000), Sentry.flush(2000)])
  client = null
}
