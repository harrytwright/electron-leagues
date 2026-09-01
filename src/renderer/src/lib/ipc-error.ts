/** Electron invoke rejections arrive as "Error invoking remote method 'x': Error: …" — strip the plumbing before showing the message to a user. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- catch clauses hand us `unknown`; this IS the boundary normaliser
export function ipcErrorMessage(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : String(caught)
  return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}
