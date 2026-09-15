import { expect, test } from 'vitest'
import { pathBasename, pathTail } from '../path-basename'

test('takes the last segment from either separator, ignoring a trailing one', () => {
  expect(pathBasename('/Users/me/LeagueDocs')).toBe('LeagueDocs')
  expect(pathBasename('/Users/me/LeagueDocs/')).toBe('LeagueDocs')
  expect(pathBasename('C:\\Users\\me\\LeagueDocs')).toBe('LeagueDocs')
  expect(pathBasename('C:\\Users\\me\\LeagueDocs\\')).toBe('LeagueDocs')
  expect(pathBasename('/')).toBe('/')
})

test('shows the last three segments using the path separator already in use', () => {
  expect(pathTail('/root/monday/Mixed triples/2025-26/Week 1')).toBe(
    '…/Mixed triples/2025-26/Week 1'
  )
  expect(pathTail('C:\\Leagues\\monday\\Pairs\\2025-26')).toBe('C:\\…\\monday\\Pairs\\2025-26')
  expect(pathTail('\\\\server\\share\\Leagues\\monday\\Pairs\\2025-26')).toBe(
    '\\\\server\\share\\…\\monday\\Pairs\\2025-26'
  )
})

test('leaves short and root paths intact', () => {
  expect(pathTail('/root/monday')).toBe('/root/monday')
  expect(pathTail('C:\\Leagues\\Pairs')).toBe('C:\\Leagues\\Pairs')
  expect(pathTail('/')).toBe('/')
})
