/** Last segment of a path from either OS, without pulling node:path into the renderer. */
export function pathBasename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}
