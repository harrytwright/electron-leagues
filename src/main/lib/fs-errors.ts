/** An expected failure the user can act on: shown as a message, never reported as a bug. */
export class UserFacingError extends Error {}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- catch clauses hand us `unknown`; this IS the boundary normaliser
function errorCode(err: unknown): string | undefined {
  // SAFETY: Node's fs errors are plain Errors carrying a `code` string; reading
  // an absent property just yields undefined.
  return err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- see errorCode
export function isMissing(err: unknown): boolean {
  const code = errorCode(err)
  return code === 'ENOENT' || code === 'ENOTDIR'
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- see errorCode
export function isPermissionDenied(err: unknown): boolean {
  const code = errorCode(err)
  return code === 'EACCES' || code === 'EPERM'
}

/** Translate the filesystem failures a user can do something about; pass anything else through. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- see errorCode
export function toUserFacing(err: unknown): Error {
  if (err instanceof UserFacingError) return err
  if (isMissing(err)) return new UserFacingError('That folder no longer exists')
  if (isPermissionDenied(err)) {
    return new UserFacingError('That folder can’t be read or changed (permission denied)')
  }
  if (errorCode(err) === 'ENOSPC') {
    return new UserFacingError('There isn’t enough free space to complete that operation')
  }
  return err instanceof Error ? err : new Error(String(err))
}
