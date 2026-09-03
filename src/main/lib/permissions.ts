import { readdir } from 'node:fs/promises'
import { PERMISSION_DENIED_PREFIX } from '../../shared/permissions'

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- filesystem failures enter from catch clauses as unknown values
export function isPermissionError(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err.code === 'EPERM' || err.code === 'EACCES')
}

export async function assertReadable(root: string): Promise<void> {
  try {
    await readdir(root)
  } catch (err) {
    if (isPermissionError(err)) {
      throw new Error(PERMISSION_DENIED_PREFIX + root)
    }
    throw err
  }
}
