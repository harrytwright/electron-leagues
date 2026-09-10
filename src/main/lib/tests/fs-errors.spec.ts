import { describe, expect, test } from 'vitest'
import { isMissing, isPermissionDenied, toUserFacing, UserFacingError } from '../fs-errors'

function fsError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: boom`), { code })
}

describe('fs error classification', () => {
  test('recognises missing and permission errors by code', () => {
    expect(isMissing(fsError('ENOENT'))).toBe(true)
    expect(isMissing(fsError('ENOTDIR'))).toBe(true)
    expect(isMissing(fsError('EACCES'))).toBe(false)
    expect(isPermissionDenied(fsError('EACCES'))).toBe(true)
    expect(isPermissionDenied(fsError('EPERM'))).toBe(true)
    expect(isMissing(new Error('plain'))).toBe(false)
    expect(isMissing('not an error')).toBe(false)
  })
})

describe('toUserFacing', () => {
  test('translates actionable filesystem failures', () => {
    expect(toUserFacing(fsError('ENOENT'))).toBeInstanceOf(UserFacingError)
    expect(toUserFacing(fsError('ENOENT')).message).toBe('That folder no longer exists')
    expect(toUserFacing(fsError('EPERM')).message).toMatch(/permission denied/)
    expect(toUserFacing(fsError('EACCES')).message).toMatch(/read or changed/)
    expect(toUserFacing(fsError('ENOSPC'))).toEqual(
      new UserFacingError('There isn’t enough free space to complete that operation')
    )
  })

  test('passes other errors through unchanged', () => {
    const err = new Error('disk on fire')
    expect(toUserFacing(err)).toBe(err)
    const already = new UserFacingError('nope')
    expect(toUserFacing(already)).toBe(already)
    expect(toUserFacing('string').message).toBe('string')
  })
})
