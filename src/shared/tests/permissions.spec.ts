import { describe, expect, test } from 'vitest'
import { isPermissionDeniedMessage, PERMISSION_DENIED_PREFIX } from '../permissions'

describe('isPermissionDeniedMessage', () => {
  test('recognises a raw permission-denied message', () => {
    expect(isPermissionDeniedMessage(`${PERMISSION_DENIED_PREFIX}/x`)).toBe(true)
  })

  test('recognises an Electron-wrapped permission-denied message', () => {
    expect(
      isPermissionDeniedMessage(
        "Error invoking remote method 'leagues:scan': Error: PERMISSION_DENIED: /x"
      )
    ).toBe(true)
  })

  test('rejects unrelated messages', () => {
    expect(isPermissionDeniedMessage('ENOENT: no such file or directory')).toBe(false)
  })
})
