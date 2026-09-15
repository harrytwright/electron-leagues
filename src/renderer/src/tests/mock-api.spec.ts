import { expect, test } from 'vitest'
import { invokeDefinitions } from '../../../shared/ipc'
import { installMockApi } from './mock-api'

test('provides a mock function for every invoke method', () => {
  const api = installMockApi()
  for (const name of Object.keys(invokeDefinitions)) {
    // SAFETY: Object.keys can only return keys present on invokeDefinitions.
    expect(api[name as keyof typeof invokeDefinitions]).toEqual(expect.any(Function))
  }
})
