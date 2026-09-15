import { z } from 'zod'

/**
 * The diagnostics preference in localStorage. Every access is guarded: storage can be
 * unavailable or hold a stale shape, and neither should ever break the app.
 */

const diagnosticsPreferenceSchema = z.object({ enabled: z.boolean() })
const DIAGNOSTICS_KEY = 'leagues:diagnostics:v1'

export function loadDiagnosticsEnabled(): boolean {
  try {
    const raw = localStorage.getItem(DIAGNOSTICS_KEY)
    if (raw === null) return false
    const parsed = diagnosticsPreferenceSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data.enabled : false
  } catch {
    return false
  }
}

export function saveDiagnosticsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify({ enabled }))
  } catch {
    // Storage full or disabled — losing UI memory is acceptable.
  }
  window.dispatchEvent(new Event('leagues:diagnostics-changed'))
}
