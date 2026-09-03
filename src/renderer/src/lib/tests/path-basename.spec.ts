import { expect, test } from 'vitest'
import { pathBasename } from '../path-basename'

test('takes the last segment from either separator, ignoring a trailing one', () => {
  expect(pathBasename('/Users/me/LeagueDocs')).toBe('LeagueDocs')
  expect(pathBasename('/Users/me/LeagueDocs/')).toBe('LeagueDocs')
  expect(pathBasename('C:\\Users\\me\\LeagueDocs')).toBe('LeagueDocs')
  expect(pathBasename('C:\\Users\\me\\LeagueDocs\\')).toBe('LeagueDocs')
  expect(pathBasename('/')).toBe('/')
})
