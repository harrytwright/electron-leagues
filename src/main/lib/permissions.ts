import { readdir } from 'node:fs/promises'
import { PERMISSION_DENIED_PREFIX } from '../../shared/permissions'
import { isPermissionDenied } from './fs-errors'

export async function assertReadable(root: string): Promise<void> {
  try {
    await readdir(root)
  } catch (err) {
    if (isPermissionDenied(err)) {
      throw new Error(PERMISSION_DENIED_PREFIX + root)
    }
    throw err
  }
}
