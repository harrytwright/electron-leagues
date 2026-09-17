import { describe, expect, test } from 'vitest'
import { isPermissionDeniedMessage, PERMISSION_DENIED_MESSAGE } from '../fs-messages'

describe('permission denied messages', () => {
  test('matches the raw user-facing message', () => {
    expect(isPermissionDeniedMessage(PERMISSION_DENIED_MESSAGE)).toBe(true)
  })

  test('matches an Electron-wrapped invoke rejection', () => {
    expect(
      isPermissionDeniedMessage(
        `Error invoking remote method 'leagues:scan': Error: ${PERMISSION_DENIED_MESSAGE}`
      )
    ).toBe(true)
  })

  test('rejects unrelated messages', () => {
    expect(isPermissionDeniedMessage('That folder no longer exists')).toBe(false)
  })
})
