import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { buildMemberMergePreview, type MemberGroupMergeRequest } from '../../../shared/member-merge'
import {
  membersFileSchema,
  type Member,
  type MembersFile,
  type SeasonFile
} from '../../../shared/members'
import {
  commitPreparedMemberMerge,
  mergeMemberGroup,
  repairRosterPlayers,
  repairRosters,
  type MemberMergeFileIo,
  type PreparedMemberMergeFile
} from '../member-group-merge'
import { buildMembersSnapshot, fileRevision, STALE_MESSAGE } from '../members'
import { scanLeaguesRoot } from '../scanner'

let root: string

function member(id: number, overrides: Partial<Member> = {}): Member {
  return {
    id,
    firstName: `Member${id}`,
    lastName: 'Bowler',
    mbdIds: [],
    aliases: [],
    marketing: true,
    ...overrides
  }
}

function season(overrides: Partial<SeasonFile> = {}): SeasonFile {
  return { schemaVersion: 1, format: 3, teams: [], players: [], ...overrides }
}

type JsonFixture = MembersFile | SeasonFile | { schemaVersion: 1; format: string }

async function writeJson(path: string, value: JsonFixture): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function writeMaster(members: Member[]): Promise<void> {
  await writeJson(join(root, 'members.json'), { schemaVersion: 1, nextId: 20, members })
}

async function mergeRequest(sourceIds: number[], mainId: number): Promise<MemberGroupMergeRequest> {
  const snapshot = await buildMembersSnapshot(root, await scanLeaguesRoot(root))
  const sources = sourceIds.map((id) => snapshot.members.find((candidate) => candidate.id === id)!)
  return {
    sourceIds,
    mainId,
    result: buildMemberMergePreview(sources, mainId, snapshot.seasons, snapshot.members).result,
    expectedRevision: snapshot.revision
  }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'leagues-member-group-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('mergeMemberGroup', () => {
  test('merges three sources with roster precedence and leaves archives untouched', async () => {
    await writeMaster([
      member(1, { firstName: 'Main', mbdIds: ['main'] }),
      member(2, { firstName: 'Second', mbdIds: ['second'] }),
      member(3, { firstName: 'Third' }),
      member(4, { firstName: 'Old second', mergedInto: 2 }),
      member(6, { firstName: 'Old main', mergedInto: 1 }),
      member(9, { firstName: 'Unrelated' })
    ])
    const firstPath = join(root, 'monday/Pairs/2026-27/meta.json')
    const secondPath = join(root, 'tuesday/Trio/2026-27/meta.json')
    const archivePath = join(root, '_archives/Pairs/2024-25/meta.json')
    const unrelatedPath = join(root, 'wednesday/Singles/2026-27/meta.json')
    await writeJson(
      firstPath,
      season({
        players: [
          { memberId: 3, teamId: 'third' },
          { memberId: 9, teamId: null },
          { memberId: 4, teamId: 'absorbed-second' },
          { memberId: 6, teamId: 'absorbed-main' },
          { memberId: 1, teamId: 'main', position: 2 },
          { memberId: 2, teamId: 'second' }
        ]
      })
    )
    await writeJson(
      secondPath,
      season({
        players: [
          { memberId: 3, teamId: 'third' },
          { memberId: 9, teamId: null },
          { memberId: 2, teamId: 'second', position: 1 }
        ]
      })
    )
    await writeJson(archivePath, season({ players: [{ memberId: 2, teamId: null }] }))
    await mkdir(join(unrelatedPath, '..'), { recursive: true })
    const unrelatedBefore =
      '{"schemaVersion":1,"format":3,"teams":[],"players":[{"memberId":9,"teamId":null}]}\n'
    await writeFile(unrelatedPath, unrelatedBefore)
    const archiveBefore = await readFile(archivePath, 'utf8')
    const request = await mergeRequest([2, 1, 3], 1)

    const survivor = await mergeMemberGroup(root, request)

    expect(survivor).toMatchObject({ id: 1, firstName: 'Main', mbdIds: ['second', 'main'] })
    const master = membersFileSchema.parse(
      JSON.parse(await readFile(join(root, 'members.json'), 'utf8'))
    )
    expect(master.members).toEqual([
      expect.objectContaining({ id: 1, firstName: 'Main' }),
      expect.objectContaining({ id: 2, firstName: 'Second', mergedInto: 1 }),
      expect.objectContaining({ id: 3, firstName: 'Third', mergedInto: 1 }),
      expect.objectContaining({ id: 4, firstName: 'Old second', mergedInto: 2 }),
      expect.objectContaining({ id: 6, firstName: 'Old main', mergedInto: 1 }),
      expect.objectContaining({ id: 9, firstName: 'Unrelated' })
    ])
    expect(JSON.parse(await readFile(firstPath, 'utf8')).players).toEqual([
      { memberId: 9, teamId: null },
      { memberId: 1, teamId: 'main', position: 2 }
    ])
    expect(JSON.parse(await readFile(secondPath, 'utf8')).players).toEqual([
      { memberId: 9, teamId: null },
      { memberId: 1, teamId: 'second', position: 1 }
    ])
    expect(await readFile(archivePath, 'utf8')).toBe(archiveBefore)
    expect(await readFile(unrelatedPath, 'utf8')).toBe(unrelatedBefore)
  })

  test('carries a LeagueSecretary id onto the kept entry and skips a roster listing main alone', async () => {
    await writeMaster([member(1), member(2), member(6, { mergedInto: 1 })])
    const mergedPath = join(root, 'monday/Pairs/2026-27/meta.json')
    const mainOnlyPath = join(root, 'tuesday/Trio/2026-27/meta.json')
    await writeJson(
      mergedPath,
      season({
        players: [
          { memberId: 1, teamId: 'main' },
          { memberId: 2, teamId: 'second', leagueSecretaryId: 'ls-2' }
        ]
      })
    )
    await writeJson(mainOnlyPath, season({ players: [{ memberId: 6, teamId: null }] }))
    const mainOnlyBefore = await readFile(mainOnlyPath, 'utf8')

    await mergeMemberGroup(root, await mergeRequest([1, 2], 1))

    expect(JSON.parse(await readFile(mergedPath, 'utf8')).players).toEqual([
      { memberId: 1, teamId: 'main', leagueSecretaryId: 'ls-2' }
    ])
    expect(await readFile(mainOnlyPath, 'utf8')).toBe(mainOnlyBefore)
  })

  test('refuses to move a roster entry written under a duplicated number', async () => {
    await writeMaster([
      member(1),
      member(2),
      member(7, { firstName: 'Absorbed', mergedInto: 2 }),
      member(7, { firstName: 'Other holder' })
    ])
    const rosterPath = join(root, 'monday/Pairs/2026-27/meta.json')
    await writeJson(rosterPath, season({ players: [{ memberId: 7, teamId: null }] }))
    const before = await readFile(rosterPath, 'utf8')

    await expect(mergeMemberGroup(root, await mergeRequest([1, 2], 1))).rejects.toThrow(
      'Member number 7 is duplicated and listed in Pairs/2026-27'
    )
    expect(await readFile(rosterPath, 'utf8')).toBe(before)
  })

  test('rejects stale, missing, duplicate, deleted and already-merged participants', async () => {
    const base = [member(1), member(2)]
    await writeMaster(base)
    const valid = await mergeRequest([1, 2], 1)
    await expect(mergeMemberGroup(root, { ...valid, expectedRevision: 'stale' })).rejects.toThrow(
      STALE_MESSAGE
    )

    await writeMaster([member(1), member(1), member(2)])
    const duplicateRevision = await fileRevision(join(root, 'members.json'))
    await expect(
      mergeMemberGroup(root, { ...valid, expectedRevision: duplicateRevision })
    ).rejects.toThrow('duplicated')

    for (const changed of [
      [member(1), member(2, { deleted: true })],
      [member(1), member(2, { mergedInto: 1 })],
      [member(1)]
    ]) {
      await writeMaster(changed)
      const revision = await fileRevision(join(root, 'members.json'))
      await expect(
        mergeMemberGroup(root, { ...valid, expectedRevision: revision })
      ).rejects.toThrow(/not eligible|not in the list/)
    }
  })

  test('refuses a survivor whose guardian link is invalid, junior, duplicated or a merged source', async () => {
    await writeMaster([
      member(1),
      member(2),
      member(3, { firstName: 'Junior', dob: '2015-01-01' }),
      member(4, { firstName: 'Gone', deleted: true }),
      member(5, { firstName: 'Holder one' }),
      member(5, { firstName: 'Holder two' }),
      member(6, { firstName: 'Unrelated Adult' })
    ])
    const invalidLinks = [3, 4, 5, 99, 2]
    for (const guardianMemberId of invalidLinks) {
      const request = await mergeRequest([1, 2], 1)
      request.result.guardianMemberId = guardianMemberId
      await expect(mergeMemberGroup(root, request)).rejects.toThrow(
        /adult|another member|duplicated/
      )
    }

    // A link to a live, unrelated adult goes through and lands on the survivor.
    const validRequest = await mergeRequest([1, 2], 1)
    validRequest.result.guardianMemberId = 6
    const survivor = await mergeMemberGroup(root, validRequest)
    expect(survivor.guardianMemberId).toBe(6)
  })

  test('keeps the link main already carried even when that guardian is deleted', async () => {
    await writeMaster([
      member(1, { dob: '2015-01-01', guardianMemberId: 4 }),
      member(2),
      member(4, { firstName: 'Gone', deleted: true })
    ])
    const request = await mergeRequest([1, 2], 1)
    expect(request.result.guardianMemberId).toBe(4)
    const survivor = await mergeMemberGroup(root, request)
    expect(survivor.guardianMemberId).toBe(4)
  })

  test('clears main’s stored guardian link when the reviewed result chooses none', async () => {
    await writeMaster([
      member(1, { dob: '2015-01-01', guardianMemberId: 3 }),
      member(2, { dob: '2015-01-01' }),
      member(3, { firstName: 'Guardian' })
    ])
    const request = await mergeRequest([1, 2], 1)
    expect(request.result.guardianMemberId).toBe(3)
    request.result.guardianMemberId = undefined

    const survivor = await mergeMemberGroup(root, request)

    expect(survivor.guardianMemberId).toBeUndefined()
    const master = membersFileSchema.parse(
      JSON.parse(await readFile(join(root, 'members.json'), 'utf8'))
    )
    expect(master.members.find((candidate) => candidate.id === 1)?.guardianMemberId).toBeUndefined()
  })

  test('rejects an invalid live roster before modifying the master', async () => {
    await writeMaster([member(1), member(2)])
    await writeJson(join(root, 'monday/Pairs/2026-27/meta.json'), {
      schemaVersion: 1,
      format: 'three'
    })
    const before = await readFile(join(root, 'members.json'), 'utf8')
    const request = await mergeRequest([1, 2], 1)
    await expect(mergeMemberGroup(root, request)).rejects.toThrow('unexpected shape')
    expect(await readFile(join(root, 'members.json'), 'utf8')).toBe(before)
  })

  test('touches a main-only roster when the reviewed survivor name changes', async () => {
    await writeMaster([member(1, { firstName: 'Old' }), member(2)])
    const rosterPath = join(root, 'monday/Pairs/2026-27/meta.json')
    const unrelatedPath = join(root, 'tuesday/Trio/2026-27/meta.json')
    await writeJson(rosterPath, season({ players: [{ memberId: 1, teamId: null }] }))
    await writeJson(unrelatedPath, season({ players: [{ memberId: 9, teamId: null }] }))
    const oldTime = new Date('2020-01-01T00:00:00Z')
    await utimes(rosterPath, oldTime, oldTime)
    await utimes(unrelatedPath, oldTime, oldTime)
    const rosterBefore = await readFile(rosterPath, 'utf8')
    const request = await mergeRequest([1, 2], 1)
    request.result.firstName = 'New'

    await mergeMemberGroup(root, request)

    expect(await readFile(rosterPath, 'utf8')).toBe(rosterBefore)
    expect((await stat(rosterPath)).mtimeMs).toBeGreaterThan(oldTime.getTime())
    expect((await stat(unrelatedPath)).mtimeMs).toBe(oldTime.getTime())
  })

  test('writes the master list before any roster', async () => {
    await writeMaster([member(1), member(2)])
    const rosterPath = join(root, 'monday/Pairs/2026-27/meta.json')
    await writeJson(rosterPath, season({ players: [{ memberId: 2, teamId: null }] }))
    const writes: string[] = []
    const io: MemberMergeFileIo = {
      read: (path) => readFile(path, 'utf8'),
      guard: async () => {},
      write: async (path, contents) => {
        writes.push(path)
        await writeFile(path, contents)
      }
    }

    await mergeMemberGroup(root, await mergeRequest([1, 2], 1), new Date(), io)

    expect(writes).toEqual([join(root, 'members.json'), rosterPath])
  })

  test('restores files after a mid-write failure', async () => {
    await writeMaster([member(1), member(2)])
    const first = join(root, 'monday/Pairs/2026-27/meta.json')
    const second = join(root, 'tuesday/Trio/2026-27/meta.json')
    await writeJson(first, season({ players: [{ memberId: 2, teamId: null }] }))
    await writeJson(second, season({ players: [{ memberId: 2, teamId: null }] }))
    const before = await Promise.all(
      [first, second, join(root, 'members.json')].map((path) => readFile(path, 'utf8'))
    )
    let forwardWrites = 0
    const io: MemberMergeFileIo = {
      read: (path) => readFile(path, 'utf8'),
      guard: async () => {},
      write: async (path, contents) => {
        forwardWrites += 1
        if (forwardWrites === 2) {
          await writeFile(path, 'partial')
          throw new Error('simulated write failure')
        }
        await writeFile(path, contents)
      }
    }
    await expect(
      mergeMemberGroup(root, await mergeRequest([1, 2], 1), new Date(), io)
    ).rejects.toThrow('Original files were restored')
    expect(
      await Promise.all(
        [first, second, join(root, 'members.json')].map((path) => readFile(path, 'utf8'))
      )
    ).toEqual(before)
  })
})

describe('repairRosterPlayers', () => {
  const members = [member(1), member(2), member(6, { mergedInto: 1 }), member(7, { mergedInto: 1 })]

  test('points absorbed numbers at the survivor and keeps one entry, the direct one first', () => {
    expect(
      repairRosterPlayers(
        [
          { memberId: 6, teamId: 'old', leagueSecretaryId: 'ls-6' },
          { memberId: 2, teamId: 'two' },
          { memberId: 1, teamId: 'direct' },
          { memberId: 7, teamId: 'older' }
        ],
        members
      )
    ).toEqual([
      { memberId: 2, teamId: 'two' },
      { memberId: 1, teamId: 'direct', leagueSecretaryId: 'ls-6' }
    ])
    expect(repairRosterPlayers([{ memberId: 7, teamId: null, position: 3 }], members)).toEqual([
      { memberId: 1, teamId: null, position: 3 }
    ])
  })

  test('leaves unlinked and already correct entries alone', () => {
    const players = [
      { memberId: 1, teamId: 'a' },
      { memberId: 9, teamId: null }
    ]
    expect(repairRosterPlayers(players, members)).toEqual(players)
  })

  test('keeps main’s own entry when present, else the earliest, one entry per member', () => {
    // Repair has no record of a stopped merge's selection order, so this need not be the
    // entry that merge's own preview would have kept (see the JSDoc above the function).
    const withDirect = [
      { memberId: 7, teamId: 'oldest' },
      { memberId: 6, teamId: 'old' },
      { memberId: 1, teamId: 'direct' }
    ]
    expect(repairRosterPlayers(withDirect, members)).toEqual([{ memberId: 1, teamId: 'direct' }])

    const withoutDirect = [
      { memberId: 7, teamId: 'oldest' },
      { memberId: 6, teamId: 'old' }
    ]
    expect(repairRosterPlayers(withoutDirect, members)).toEqual([{ memberId: 1, teamId: 'oldest' }])
  })

  test('leaves two entries that share the exact same stored number untouched', () => {
    // A raw duplicate is not the "absorbed number" case repair fixes: detection never
    // flags it, so collapsing it would quietly delete a second bowler's row.
    const direct = [
      { memberId: 2, teamId: 'a' },
      { memberId: 2, teamId: 'b' }
    ]
    expect(repairRosterPlayers(direct, members)).toEqual(direct)
    const absorbed = [
      { memberId: 6, teamId: 'a' },
      { memberId: 6, teamId: 'b' }
    ]
    expect(repairRosterPlayers(absorbed, members)).toEqual(absorbed)
  })

  test('leaves an absorbed entry alone rather than rewriting it into a third raw copy', () => {
    const raw5s = [member(1), member(5), member(7, { mergedInto: 5 })]
    const players = [
      { memberId: 5, teamId: 'a' },
      { memberId: 5, teamId: 'b' },
      { memberId: 7, teamId: 'c' }
    ]
    expect(repairRosterPlayers(players, raw5s)).toEqual(players)
  })
})

describe('repairRosters', () => {
  test('rewrites only the live rosters that list an absorbed number', async () => {
    await writeMaster([member(1), member(2), member(6, { mergedInto: 1 })])
    const stalePath = join(root, 'monday/Pairs/2026-27/meta.json')
    const cleanPath = join(root, 'tuesday/Trio/2026-27/meta.json')
    const archivePath = join(root, '_archives/Pairs/2024-25/meta.json')
    await writeJson(
      stalePath,
      season({
        teams: [
          { id: 'direct', teamNo: 1, name: 'Direct' },
          { id: 'two', teamNo: 2, name: 'Two' }
        ],
        players: [
          { memberId: 6, teamId: 'direct' },
          { memberId: 1, teamId: 'direct' },
          { memberId: 2, teamId: 'two' }
        ]
      })
    )
    await writeJson(cleanPath, season({ players: [{ memberId: 2, teamId: null }] }))
    await writeJson(archivePath, season({ players: [{ memberId: 6, teamId: null }] }))
    const cleanBefore = await readFile(cleanPath, 'utf8')
    const archiveBefore = await readFile(archivePath, 'utf8')
    const revision = await fileRevision(join(root, 'members.json'))

    await expect(repairRosters(root, 'stale')).rejects.toThrow(STALE_MESSAGE)
    expect(await repairRosters(root, revision)).toBe(1)

    expect(JSON.parse(await readFile(stalePath, 'utf8')).players).toEqual([
      { memberId: 1, teamId: 'direct' },
      { memberId: 2, teamId: 'two' }
    ])
    expect(await readFile(cleanPath, 'utf8')).toBe(cleanBefore)
    expect(await readFile(archivePath, 'utf8')).toBe(archiveBefore)
    const snapshot = await buildMembersSnapshot(root, await scanLeaguesRoot(root))
    expect(snapshot.problems).toEqual([])
  })

  test('does not refuse a roster over an unrelated duplicated number', async () => {
    await writeMaster([
      member(1),
      member(2),
      member(6, { mergedInto: 1 }),
      member(7, { firstName: 'Holder one' }),
      member(7, { firstName: 'Holder two' })
    ])
    const rosterPath = join(root, 'monday/Pairs/2026-27/meta.json')
    await writeJson(
      rosterPath,
      season({
        players: [
          { memberId: 6, teamId: null },
          { memberId: 7, teamId: null }
        ]
      })
    )
    const revision = await fileRevision(join(root, 'members.json'))

    // Repair only rewrites the `6` entry; the duplicated `7` is not one it would touch.
    await expect(repairRosters(root, revision)).resolves.toBe(1)
    expect(JSON.parse(await readFile(rosterPath, 'utf8')).players).toEqual([
      { memberId: 1, teamId: null },
      { memberId: 7, teamId: null }
    ])
  })

  test('refuses to rewrite a roster whose repair would touch a duplicated number', async () => {
    await writeMaster([
      member(1),
      member(6, { mergedInto: 1 }),
      member(6, { firstName: 'Second holder' })
    ])
    const rosterPath = join(root, 'monday/Pairs/2026-27/meta.json')
    await writeJson(rosterPath, season({ players: [{ memberId: 6, teamId: null }] }))
    const before = await readFile(rosterPath, 'utf8')
    const revision = await fileRevision(join(root, 'members.json'))

    await expect(repairRosters(root, revision)).rejects.toThrow(
      'Member number 6 is duplicated and listed in Pairs/2026-27'
    )
    expect(await readFile(rosterPath, 'utf8')).toBe(before)
  })
})

describe('commitPreparedMemberMerge', () => {
  test('restores earlier writes without rolling back a target whose guard failed', async () => {
    const files: PreparedMemberMergeFile[] = [
      { path: '/one/meta.json', original: 'one', next: 'next-one' },
      { path: '/two/meta.json', original: 'two', next: 'next-two' }
    ]
    const contents = new Map(files.map((file) => [file.path, file.original]))
    let guardCalls = 0
    const writes: string[] = []
    const io: MemberMergeFileIo = {
      read: async (path) => contents.get(path)!,
      guard: async (path) => {
        guardCalls += 1
        if (guardCalls >= 4 && path === '/two/meta.json') throw new Error('guard failed')
      },
      write: async (path, value) => {
        writes.push(path)
        contents.set(path, value)
      }
    }

    await expect(commitPreparedMemberMerge(files, io)).rejects.toThrow(
      'Could not save /two/meta.json: guard failed. Original files were restored.'
    )
    expect(contents).toEqual(
      new Map([
        ['/one/meta.json', 'one'],
        ['/two/meta.json', 'two']
      ])
    )
    expect(writes).toEqual(['/one/meta.json', '/one/meta.json'])
  })

  test('reports every path whose rollback fails', async () => {
    const files: PreparedMemberMergeFile[] = [
      { path: '/one/meta.json', original: 'one', next: 'next-one' },
      { path: '/two/meta.json', original: 'two', next: 'next-two' }
    ]
    const contents = new Map(files.map((file) => [file.path, file.original]))
    let writes = 0
    const io: MemberMergeFileIo = {
      read: async (path) => contents.get(path)!,
      guard: async () => {},
      write: async (path, value) => {
        writes += 1
        if (writes === 2) throw new Error('forward failed')
        if (path === '/two/meta.json' && value === 'two') throw new Error('rollback failed')
        contents.set(path, value)
      }
    }
    await expect(commitPreparedMemberMerge(files, io)).rejects.toThrow(
      'Could not restore: /two/meta.json (rollback failed)'
    )
    expect(contents.get('/one/meta.json')).toBe('one')
  })
})
