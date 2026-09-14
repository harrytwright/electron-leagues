const WINDOWS_DRIVE_RELATIVE = /^[A-Za-z]:/

export function isSingleSegment(name: string): boolean {
  return (
    name.length > 0 &&
    name !== '.' &&
    name !== '..' &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !WINDOWS_DRIVE_RELATIVE.test(name)
  )
}
