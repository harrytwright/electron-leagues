import { expect, test } from 'vitest'
import { joinPathLike, pathBasename, pathTail } from '../path-basename'

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

test('joins a name onto a folder with the separator the folder already uses', () => {
  expect(joinPathLike('/root/monday/Pairs/2025-26', 'Sign-In Sheet.pdf')).toBe(
    '/root/monday/Pairs/2025-26/Sign-In Sheet.pdf'
  )
  expect(joinPathLike('/root/monday/Pairs/2025-26/', 'Sign-In Sheet.pdf')).toBe(
    '/root/monday/Pairs/2025-26/Sign-In Sheet.pdf'
  )
  expect(joinPathLike('C:\\Leagues\\monday\\Pairs\\2025-26', 'Sign-In Sheet.pdf')).toBe(
    'C:\\Leagues\\monday\\Pairs\\2025-26\\Sign-In Sheet.pdf'
  )
})
