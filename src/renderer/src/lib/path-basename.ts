/** Last segment of a path from either OS, without pulling node:path into the renderer. */
export function pathBasename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

/** A compact path tail that preserves the path's native-looking separator. */
export function pathTail(path: string, maximumSegments = 3): string {
  const segments = path.split(/[\\/]/).filter(Boolean)
  if (segments.length <= maximumSegments) return path
  const separator = path.includes('\\') ? '\\' : '/'
  return `…${separator}${segments.slice(-maximumSegments).join(separator)}`
}
