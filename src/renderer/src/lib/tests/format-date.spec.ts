import { expect, test } from 'vitest'
import { formatModified } from '../format-date'

test('formats modification times as short en-GB dates', () => {
  expect(formatModified(Date.UTC(2026, 0, 15, 12))).toBe('15 Jan 2026')
})
