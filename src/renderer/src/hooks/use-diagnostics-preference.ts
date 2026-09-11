import { useEffect, useSyncExternalStore } from 'react'
import { loadDiagnosticsEnabled, saveDiagnosticsEnabled } from '@renderer/lib/local-store'
import { useAppCommandHandler } from './use-app-commands'

function subscribe(listener: () => void): () => void {
  // Storage events exclude the writing document; this single-window app emits its own notification.
  window.addEventListener('leagues:diagnostics-changed', listener)
  return () => {
    window.removeEventListener('leagues:diagnostics-changed', listener)
  }
}

export function useDiagnosticsPreference(): boolean {
  return useSyncExternalStore(subscribe, loadDiagnosticsEnabled)
}

export function useDiagnosticsCommands(): void {
  const enabled = useDiagnosticsPreference()
  useAppCommandHandler('toggle-diagnostics', () => {
    saveDiagnosticsEnabled(!loadDiagnosticsEnabled())
  })
  useEffect(() => {
    // Main mirrors the preference rather than owning a second, competing setting.
    window.api.diagnosticsChanged(enabled)
  }, [enabled])
}
