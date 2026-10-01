export type TelemetryAttributes = Record<string, string | number | boolean>

export interface TelemetrySpan {
  setAttribute(name: string, value: string | number | boolean): void
}

export interface Telemetry {
  trace<T>(
    name: string,
    attributes: TelemetryAttributes,
    run: (span: TelemetrySpan) => Promise<T>
  ): Promise<T>
  exception(error: Error, operation: string, attributes: TelemetryAttributes): void
  warning(message: string, attributes: TelemetryAttributes): void
  event(name: string, attributes: TelemetryAttributes): void
}

let telemetry: Telemetry | null = null
let reportedErrors = new WeakSet<Error>()
const warnings = new Map<string, number>()
const silentSpan: TelemetrySpan = { setAttribute: () => {} }

export function configureTelemetry(next: Telemetry | null): void {
  telemetry = next
  reportedErrors = new WeakSet()
  warnings.clear()
}

export function traceOperation<T>(
  name: string,
  attributes: TelemetryAttributes,
  run: (span: TelemetrySpan) => Promise<T>
): Promise<T> {
  return telemetry ? telemetry.trace(name, attributes, run) : run(silentSpan)
}

export function reportFailure(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- errors enter telemetry at this boundary
  error: unknown,
  operation: string,
  attributes: TelemetryAttributes = {}
): void {
  if (!telemetry) return
  const original = error instanceof Error ? error : new Error(String(error))
  if (reportedErrors.has(original)) return
  reportedErrors.add(original)
  // Keep the originating frames, without filesystem paths or member data in the error message.
  const safe = new Error(`${operation} failed`)
  safe.name = original.name
  if (original.stack) {
    const frames = original.stack.split('\n').filter((line) => /^\s+at /.test(line))
    safe.stack = `${safe.name}: ${safe.message}\n${frames.join('\n')}`
  }
  telemetry.exception(safe, operation, attributes)
}

/** Keys may identify local files, but are never passed to the telemetry service. */
export function warnOnce(key: string, message: string, attributes: TelemetryAttributes = {}): void {
  if (!telemetry) return
  const now = Date.now()
  const last = warnings.get(key)
  if (last !== undefined && now - last < 5 * 60_000) return
  warnings.delete(key)
  warnings.set(key, now)
  if (warnings.size > 200) {
    const oldest = warnings.keys().next().value
    if (oldest !== undefined) warnings.delete(oldest)
  }
  telemetry.warning(message, attributes)
}

export function recordEvent(name: string, attributes: TelemetryAttributes = {}): void {
  telemetry?.event(name, attributes)
}
