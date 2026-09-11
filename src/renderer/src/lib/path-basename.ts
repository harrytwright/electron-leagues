/** Last segment of a path from either OS, without pulling node:path into the renderer. */
export function pathBasename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

/** A compact path tail that preserves the path's native-looking separator. */
export function pathTail(path: string, maximumSegments = 3): string {
  const segments = path.split(/[\\/]/).filter(Boolean)
  if (segments.length <= maximumSegments) return path
  const separator = path.includes('\\') ? '\\' : '/'
  const drive = /^[A-Za-z]:[\\/]/.test(path) ? `${segments[0]}${separator}` : ''
  // A UNC server/share is the root identity, not disposable middle directories.
  const prefix = path.startsWith('\\\\')
    ? `\\\\${segments.slice(0, 2).join(separator)}${separator}`
    : drive
  const tail = prefix ? segments.slice(drive ? 1 : 2) : segments
  if (tail.length <= maximumSegments) return path
  return `${prefix}…${separator}${tail.slice(-maximumSegments).join(separator)}`
}
