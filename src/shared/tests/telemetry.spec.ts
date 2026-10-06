import { afterEach, expect, test, vi } from 'vitest'
import { configureTelemetry, reportFailure, traceOperation, warnOnce } from '../telemetry'
import { recordTelemetry } from './telemetry-recorder'

afterEach(() => {
  configureTelemetry(null)
  vi.useRealTimers()
})

test('reports a caught failure once, retaining frames without multiline private messages', () => {
  const telemetry = recordTelemetry()
  const failure = new TypeError('Could not read /Users/private/member.json\nPrivate Member')
  reportFailure(failure, 'members.merge', { rollback_failures: 1 })
  reportFailure(failure, 'ipc.invoke')
  expect(telemetry.exception).toHaveBeenCalledOnce()
  const [error, operation, attributes] = telemetry.exception.mock.calls[0]
  expect(error.name).toBe('TypeError')
  expect(error.stack).toContain('telemetry.spec.ts')
  expect(error.stack).not.toContain('/Users/private')
  expect(error.stack).not.toContain('Private Member')
  expect(operation).toBe('members.merge')
  expect(attributes).toEqual({ rollback_failures: 1 })
})

test('deduplicates warnings locally and permits a later recurrence', () => {
  vi.useFakeTimers()
  const telemetry = recordTelemetry()
  warnOnce('/private/root', 'Members data needs attention', { count: 2 })
  warnOnce('/private/root', 'Members data needs attention', { count: 2 })
  expect(telemetry.warning).toHaveBeenCalledExactlyOnceWith('Members data needs attention', {
    count: 2
  })
  vi.advanceTimersByTime(5 * 60_000)
  warnOnce('/private/root', 'Members data needs attention', { count: 2 })
  expect(telemetry.warning).toHaveBeenCalledTimes(2)
})

test('tracing without configuration preserves return values and failures', async () => {
  const failure = new Error('original')
  await expect(traceOperation('filesystem.scan', {}, async () => 42)).resolves.toBe(42)
  await expect(
    traceOperation('filesystem.scan', {}, async () => {
      throw failure
    })
  ).rejects.toBe(failure)
})
