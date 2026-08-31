import * as Sentry from '@sentry/electron/main'
import { app } from 'electron'
import { PostHog } from 'posthog-node'

let client: PostHog | null = null
let distinctId = 'leagues-app'

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
      environment: app.isPackaged ? 'production' : 'development'
    })
    Sentry.setUser({ id: machineId })
  }

  if (apiKey) {
    client = new PostHog(apiKey, {
      host: 'https://eu.i.posthog.com',
      flushAt: 5,
      flushInterval: 10000
    })
  }
}

export function capture(
  event: string,
  properties: Record<string, string | number | boolean> = {}
): void {
  client?.capture({ distinctId, event, properties })
}

export async function shutdownAnalytics(): Promise<void> {
  await Promise.allSettled([client?.shutdown(2000), Sentry.flush(2000)])
  client = null
}
