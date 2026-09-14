import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { PERMISSION_DENIED_PREFIX } from '../../../shared/permissions'
import { assertReadable } from '../permissions'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'leagues-permissions-'))
})

afterEach(async () => {
  await chmod(root, 0o700).catch(() => {})
  await rm(root, { recursive: true, force: true })
})

describe('assertReadable', () => {
  test('resolves for a readable directory', async () => {
    await expect(assertReadable(root)).resolves.toBeUndefined()
  })

  test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'throws a prefixed error for an unreadable directory',
    async () => {
      await chmod(root, 0o000)
      await expect(assertReadable(root)).rejects.toThrow(PERMISSION_DENIED_PREFIX + root)
    }
  )

  test('rethrows ENOENT unchanged for a missing path', async () => {
    const missing = join(root, 'missing')
    let thrown: unknown

    try {
      await assertReadable(missing)
    } catch (err) {
      thrown = err
    }

    expect(thrown).toMatchObject({ code: 'ENOENT' })
  })
})
