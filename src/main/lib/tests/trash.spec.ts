import { describe, expect, test, vi } from 'vitest'
import { UserFacingError } from '../fs-errors'
import type { TrashPlan } from '../paths'
import { executeTrashPlan } from '../trash'

describe('executeTrashPlan', () => {
  const plan: TrashPlan = {
    kind: 'league',
    paths: ['/leagues/monday/Monday Mixed', '/leagues/_archives/Monday Mixed']
  }

  test('trashes every target in plan order', async () => {
    const trashItem = vi.fn<(path: string) => Promise<void>>().mockResolvedValue(undefined)

    await executeTrashPlan(plan, trashItem)

    expect(trashItem).toHaveBeenNthCalledWith(1, plan.paths[0])
    expect(trashItem).toHaveBeenNthCalledWith(2, plan.paths[1])
    expect(trashItem).toHaveBeenCalledTimes(2)
  })

  test('wraps a first-target failure and stops the plan', async () => {
    const trashItem = vi
      .fn<(path: string) => Promise<void>>()
      .mockRejectedValue(new Error('EBUSY: resource busy'))

    const failure = await executeTrashPlan(plan, trashItem).catch((e: Error) => e)

    expect(failure).toBeInstanceOf(UserFacingError)
    expect(failure).toHaveProperty(
      'message',
      'Couldn’t move “Monday Mixed” to the trash: EBUSY: resource busy'
    )
    expect(trashItem).toHaveBeenCalledTimes(1)
  })

  test('explains when the archive fails after the league was trashed', async () => {
    const trashItem = vi
      .fn<(path: string) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Archive busy'))

    const failure = await executeTrashPlan(plan, trashItem).catch((e: Error) => e)

    expect(failure).toBeInstanceOf(UserFacingError)
    expect(failure).toHaveProperty(
      'message',
      '“Monday Mixed” was moved to the trash but its archived seasons could not be: Archive busy'
    )
    expect(trashItem).toHaveBeenCalledTimes(2)
  })

  test('uses the standard permission message as the failure detail', async () => {
    const permissionError = Object.assign(new Error('EACCES'), { code: 'EACCES' })
    const trashItem = vi.fn<(path: string) => Promise<void>>().mockRejectedValue(permissionError)

    const failure = await executeTrashPlan(plan, trashItem).catch((e: Error) => e)

    expect(failure).toBeInstanceOf(UserFacingError)
    expect(failure).toHaveProperty(
      'message',
      'Couldn’t move “Monday Mixed” to the trash: That folder can’t be read or changed (permission denied)'
    )
  })
})
