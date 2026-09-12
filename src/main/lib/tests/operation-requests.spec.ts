import { describe, expect, test } from 'vitest'
import { UserFacingError } from '../fs-errors'
import {
  parseArchiveZipRequest,
  parseImportFilesRequest,
  parseLeagueCreateRequest,
  parsePathRequest,
  parseRootSetRequest,
  parseSeasonSyncRequest
} from '../operation-requests'

describe('operation IPC requests', () => {
  test('parses valid archive, import, location and league requests', () => {
    expect(
      parseArchiveZipRequest({ leagueFolder: 'Pairs League', seasons: ['2024-25', '2025-26'] })
    ).toEqual({ leagueFolder: 'Pairs League', seasons: ['2024-25', '2025-26'] })
    expect(
      parseImportFilesRequest({ dest: '/leagues/monday/Pairs', sources: ['/tmp/a.csv'] })
    ).toEqual({ dest: '/leagues/monday/Pairs', sources: ['/tmp/a.csv'] })
    expect(parseRootSetRequest('/leagues')).toBe('/leagues')
    expect(parsePathRequest('/leagues/Rules.docx')).toBe('/leagues/Rules.docx')
    expect(parseLeagueCreateRequest({ day: 'monday', name: 'Pairs League' })).toEqual({
      day: 'monday',
      name: 'Pairs League'
    })
    expect(
      parseSeasonSyncRequest({
        day: 'monday',
        leagueFolder: 'Pairs League',
        seasonName: '2025-26'
      })
    ).toEqual({ day: 'monday', leagueFolder: 'Pairs League', seasonName: '2025-26' })
  })

  test.each([
    ['archive request', parseArchiveZipRequest, null],
    ['archive season list', parseArchiveZipRequest, { leagueFolder: 'Pairs', seasons: [42] }],
    ['file import request', parseImportFilesRequest, { dest: '/leagues', sources: 'a.csv' }],
    ['relative import destination', parseImportFilesRequest, { dest: 'leagues', sources: [] }],
    ['empty import destination', parseImportFilesRequest, { dest: '', sources: [] }],
    ['location request', parseRootSetRequest, { path: '/leagues' }],
    ['relative location', parseRootSetRequest, 'leagues'],
    ['empty location', parseRootSetRequest, ''],
    ['relative file path', parsePathRequest, 'Rules.docx'],
    ['empty file path', parsePathRequest, ''],
    ['league request', parseLeagueCreateRequest, { day: 'monday' }],
    ['league weekday', parseLeagueCreateRequest, { day: 'funday', name: 'Pairs' }],
    [
      'season sync weekday',
      parseSeasonSyncRequest,
      { day: 'funday', leagueFolder: 'Pairs', seasonName: '2025-26' }
    ],
    [
      'season sync league',
      parseSeasonSyncRequest,
      { day: 'monday', leagueFolder: '../Pairs', seasonName: '2025-26' }
    ],
    [
      'season sync canonical name',
      parseSeasonSyncRequest,
      { day: 'monday', leagueFolder: 'Pairs', seasonName: '2025-q1' }
    ]
  ])('rejects an invalid %s', (_label, parse, input) => {
    expect(() => parse(input)).toThrow(UserFacingError)
  })
})
