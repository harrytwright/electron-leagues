import { render, type RenderResult } from '@testing-library/react'
import { ToastProvider } from '@cloudflare/kumo'

/** Render a component under the same providers App mounts at its root. */
export function renderWithProviders(ui: React.ReactElement): RenderResult {
  return render(<ToastProvider>{ui}</ToastProvider>)
}
