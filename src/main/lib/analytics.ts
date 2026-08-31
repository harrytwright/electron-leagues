import { PostHog } from 'posthog-node'

let client: PostHog | null = null
let distinctId = 'leagues-app'

/**
 * PostHog is optional: no API key (LEAGUES_POSTHOG_KEY or the stored setting)
 * means every capture is a silent no-op.
 */
export function initAnalytics(apiKey: string | undefined, machineId: string): void {
  distinctId = machineId
  if (!apiKey) return
  client = new PostHog(apiKey, {
    host: 'https://eu.i.posthog.com',
    flushAt: 5,
    flushInterval: 10000
  })
}

export function capture(event: string, properties: Record<string, unknown> = {}): void {
  client?.capture({ distinctId, event, properties })
}

export async function shutdownAnalytics(): Promise<void> {
  await client?.shutdown()
  client = null
}
