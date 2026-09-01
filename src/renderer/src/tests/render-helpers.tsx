import { render, type RenderResult } from '@testing-library/react'
import { ToastProvider } from '@cloudflare/kumo'

/**
 * Render a component under the same providers App mounts at its root.
 * Uses RTL's wrapper option so view.rerender() keeps the providers in place
 * instead of remounting the component under test.
 */
export function renderWithProviders(ui: React.ReactElement): RenderResult {
  return render(ui, { wrapper: ToastProvider })
}
