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
