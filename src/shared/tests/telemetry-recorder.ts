import { vi, type Mock } from 'vitest'
import { configureTelemetry, type Telemetry, type TelemetryAttributes } from '../telemetry'

interface TelemetryRecording {
  exception: Mock<Telemetry['exception']>
  warning: Mock<Telemetry['warning']>
  event: Mock<Telemetry['event']>
  spans: Array<{ name: string; attributes: TelemetryAttributes }>
}

export function recordTelemetry(): TelemetryRecording {
  const exception = vi.fn<Telemetry['exception']>()
  const warning = vi.fn<Telemetry['warning']>()
  const event = vi.fn<Telemetry['event']>()
  const spans: Array<{ name: string; attributes: TelemetryAttributes }> = []
  configureTelemetry({
    exception,
    warning,
    event,
    trace: async (name, attributes, run) => {
      const span = { name, attributes: { ...attributes } }
      spans.push(span)
      return run({
        setAttribute: (key, value) => {
          span.attributes[key] = value
        }
      })
    }
  })
  return { exception, warning, event, spans }
}
