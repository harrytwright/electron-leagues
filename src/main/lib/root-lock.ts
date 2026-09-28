import { realpath } from 'node:fs/promises'
import { toUserFacing } from './fs-errors'

const tasks = new Map<string, Promise<void>>()

/**
 * Serialise every write under one location, including aliases of the same
 * root, so repairs, season creation and members edits never interleave.
 */
export async function withRootLock<T>(root: string, run: () => Promise<T>): Promise<T> {
  const key = await realpath(root).catch((err) => {
    throw toUserFacing(err)
  })
  const previous = tasks.get(key) ?? Promise.resolve()
  const task = previous.then(run)
  // A failed operation releases the queue too; each caller still receives its own error.
  const settled = task.then(
    () => {},
    () => {}
  )
  tasks.set(key, settled)
  try {
    return await task
  } finally {
    if (tasks.get(key) === settled) tasks.delete(key)
  }
}
