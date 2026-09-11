import type { WebContents } from 'electron'

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Incoming IPC values are untrusted until checked.
type DiagnosticsListener = (event: { sender: WebContents }, enabled: unknown) => void

export interface DiagnosticsIpc {
  on: (channel: 'diagnostics:changed', listener: DiagnosticsListener) => void
}

type CurrentItem = () => { checked: boolean } | undefined

const reports = new WeakMap<WebContents, boolean>()

function applyReport(enabled: boolean, currentItem: CurrentItem): void {
  const item = currentItem()
  if (item) item.checked = enabled
}

export function registerDiagnosticsIpc(
  ipc: DiagnosticsIpc,
  current: () => WebContents | null,
  currentItem: CurrentItem
): void {
  ipc.on('diagnostics:changed', (event, enabled) => {
    if (event.sender !== current() || (enabled !== true && enabled !== false)) return
    reports.set(event.sender, enabled)
    applyReport(enabled, currentItem)
  })
}

export function watchDiagnosticsLoads(
  contents: WebContents,
  current: () => WebContents | null,
  currentItem: CurrentItem
): void {
  contents.on('did-finish-load', () => {
    if (contents !== current()) return
    // Replay the renderer's report after every load; this cache is not a second persisted owner.
    const enabled = reports.get(contents)
    if (enabled !== undefined) applyReport(enabled, currentItem)
  })
}
