import type { TelemetryAttributes } from '@shared/telemetry'

type SendEvent = (name: string, properties: TelemetryAttributes) => void

interface EventQueue {
  capture: SendEvent
  ready: (send: SendEvent | null) => void
}

/** Retain early events until the IPC configuration arrives; bound memory if it never does. */
export function createEventQueue(): EventQueue {
  let state: 'pending' | 'ready' | 'disabled' = 'pending'
  let sender: SendEvent | null = null
  const pending: Array<{ name: string; properties: TelemetryAttributes }> = []
  return {
    capture(name, properties) {
      if (state === 'ready') sender?.(name, properties)
      else if (state === 'pending') {
        if (pending.length === 100) pending.shift()
        pending.push({ name, properties: { ...properties } })
      }
    },
    ready(send) {
      sender = send
      state = send ? 'ready' : 'disabled'
      for (const event of pending.splice(0)) send?.(event.name, event.properties)
    }
  }
}
