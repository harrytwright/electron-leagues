import { describe, expect, test } from 'vitest'
import { invokeDefinitions, invokeFailureMessage, type InvokeName } from '../ipc'

type IpcTestValue =
  string | number | boolean | null | IpcTestValue[] | { [key: string]: IpcTestValue }

function parseMessage(name: InvokeName, args: IpcTestValue[]): string | null {
  const parsed = invokeDefinitions[name].args.safeParse(args)
  return parsed.success ? null : invokeFailureMessage(name, parsed.error.issues)
}

describe('invoke definitions', () => {
  test.each([
    ['chooseRoot', ['select']],
    ['setRoot', ['/leagues']],
    ['listDir', ['/leagues/monday/Pairs']],
    ['trashFolder', ['/leagues/monday/Pairs']],
    ['createLeague', ['monday', 'Pairs League']],
    ['renameLeague', ['monday', 'Pairs League', 'Pairs & Trios']],
    [
      'createSeason',
      [
        {
          day: 'monday',
          leagueFolder: 'Pairs League',
          seasonName: '2025-26',
          source: 'templates',
          archiveOldest: true
        }
      ]
    ],
    [
      'syncSeasonTemplates',
      [{ day: 'monday', leagueFolder: 'Pairs League', seasonName: '2025-26' }]
    ],
    ['zipArchive', ['Pairs League', ['2024-25', '2025-26']]],
    ['openFile', ['/leagues/Rules.docx']],
    ['revealFile', ['/leagues/Rules.docx']],
    ['importFiles', ['/leagues/monday/Pairs', ['/tmp/a.csv']]]
  ] satisfies Array<[InvokeName, IpcTestValue[]]>)('parses valid %s arguments', (name, args) => {
    expect(invokeDefinitions[name].args.safeParse(args).success).toBe(true)
  })

  test.each([
    ['getAnalyticsConfig', [null], 'Invalid analytics request'],
    ['getRoot', [null], 'Invalid location request'],
    ['chooseRoot', [], 'Invalid location request'],
    ['forgetRoot', [null], 'Invalid location request'],
    ['repairLocation', [null], 'Invalid location repair request'],
    ['setRoot', [{ path: '/leagues' }], 'Invalid location request'],
    ['recentRoots', [null], 'Invalid recent locations request'],
    ['scan', [null], 'Invalid leagues scan request'],
    ['listDir', [], 'Invalid file path'],
    ['trashFolder', [42], 'Invalid file path'],
    ['createLeague', ['monday'], 'Invalid league request'],
    ['renameLeague', ['monday', 'Pairs'], 'Invalid league rename request'],
    ['createSeason', [{}], 'Invalid season request'],
    ['syncSeasonTemplates', [{}], 'Invalid season sync request'],
    ['zipArchive', ['Pairs', [42]], 'Invalid archive request'],
    ['openFile', [{}], 'Invalid file path'],
    ['revealFile', [], 'Invalid file path'],
    ['pickFiles', [null], 'Invalid file picker request'],
    ['importFiles', ['/leagues', 'a.csv'], 'Invalid file import request']
  ] satisfies Array<[InvokeName, IpcTestValue[], string]>)(
    'uses the declared failure message for an invalid %s shape',
    (name, args, expected) => {
      expect(parseMessage(name, args)).toBe(expected)
    }
  )

  test.each([
    ['createLeague', ['funday', 'Pairs'], 'Invalid league day'],
    ['renameLeague', ['monday', '../Pairs', 'Trios'], 'Invalid league folder'],
    [
      'createSeason',
      [
        {
          day: 'monday',
          leagueFolder: 'Pairs',
          seasonName: '2025-26',
          source: 'unknown',
          archiveOldest: false
        }
      ],
      'Unknown season workflow'
    ],
    [
      'createSeason',
      [
        {
          day: 'monday',
          leagueFolder: '../Pairs',
          seasonName: '2025-26',
          source: 'empty',
          archiveOldest: false
        }
      ],
      'Invalid league folder'
    ],
    [
      'createSeason',
      [
        {
          day: 'monday',
          leagueFolder: 'Pairs',
          seasonName: '2025-q1',
          source: 'empty',
          archiveOldest: false
        }
      ],
      'Invalid season name'
    ],
    [
      'syncSeasonTemplates',
      [{ day: 'funday', leagueFolder: 'Pairs', seasonName: '2025-26' }],
      'Invalid league day'
    ],
    [
      'syncSeasonTemplates',
      [{ day: 'monday', leagueFolder: 'Pairs', seasonName: '2025-q1' }],
      'Invalid season name'
    ],
    ['zipArchive', ['C:Pairs', ['2025-26']], 'Invalid league folder'],
    ['zipArchive', ['Pairs', ['2025-q1']], 'Invalid season name']
  ] satisfies Array<[InvokeName, IpcTestValue[], string]>)(
    'preserves the domain failure for %s',
    (name, args, expected) => {
      expect(parseMessage(name, args)).toBe(expected)
    }
  )
})
