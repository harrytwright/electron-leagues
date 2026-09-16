import { basename } from 'node:path'
import { toUserFacing, UserFacingError } from './fs-errors'
import type { TrashPlan } from './paths'

export async function executeTrashPlan(
  plan: TrashPlan,
  trashItem: (path: string) => Promise<void>
): Promise<void> {
  for (const [index, path] of plan.paths.entries()) {
    try {
      await trashItem(path)
    } catch (err) {
      const detail = toUserFacing(err).message
      const name = basename(plan.paths[0])
      const message =
        index === 0
          ? `Couldn’t move “${name}” to the trash: ${detail}`
          : `“${name}” was moved to the trash but its archived seasons could not be: ${detail}`
      throw new UserFacingError(message)
    }
  }
}
