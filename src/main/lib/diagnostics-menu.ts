import type { WebContents } from 'electron'

export function updateDiagnosticsMenu(
  sender: WebContents,
  current: WebContents | null,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Incoming IPC values are untrusted until checked.
  enabled: unknown,
  currentItem: () => { checked: boolean } | undefined
): void {
  if (sender !== current || (enabled !== true && enabled !== false)) return
  // The renderer reports on mount and change; replaying cached reports creates a competing owner.
  const item = currentItem()
  if (item) item.checked = enabled
}
