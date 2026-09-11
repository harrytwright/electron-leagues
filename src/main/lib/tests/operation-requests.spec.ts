import { describe, expect, test } from 'vitest'
import { UserFacingError } from '../fs-errors'
import {
  parseArchiveZipRequest,
  parseImportFilesRequest,
  parseLeagueCreateRequest,
  parseRootSetRequest
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
    expect(parseLeagueCreateRequest({ day: 'monday', name: 'Pairs League' })).toEqual({
      day: 'monday',
      name: 'Pairs League'
    })
  })

  test.each([
    ['archive request', parseArchiveZipRequest, null],
    ['archive season list', parseArchiveZipRequest, { leagueFolder: 'Pairs', seasons: [42] }],
    ['file import request', parseImportFilesRequest, { dest: '/leagues', sources: 'a.csv' }],
    ['location request', parseRootSetRequest, { path: '/leagues' }],
    ['league request', parseLeagueCreateRequest, { day: 'monday' }],
    ['league weekday', parseLeagueCreateRequest, { day: 'funday', name: 'Pairs' }]
  ])('rejects an invalid %s', (_label, parse, input) => {
    expect(() => parse(input)).toThrow(UserFacingError)
  })
})
