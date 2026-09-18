import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  emptyMembersFile,
  membersFileSchema,
  type MemberInput,
  type SeasonFile
} from '../../../shared/members'
import {
  buildMembersSnapshot,
  deleteMember,
  enableMembers,
  markCardsIssued,
  membersEnabled,
  mergeMembers,
  renumberDuplicates,
  saveMember,
  saveSeason,
  STALE_MESSAGE,
  writeSeasonFile
} from '../members'
import { scanLeaguesRoot } from '../scanner'

let root: string
let outside: string

async function makeTree(base: string, paths: Record<string, string | null>): Promise<void> {
  for (const [rel, content] of Object.entries(paths)) {
    const abs = join(base, rel)
    if (content === null) {
      await mkdir(abs, { recursive: true })
    } else {
      await mkdir(join(abs, '..'), { recursive: true })
      await writeFile(abs, content)
    }
  }
}

function seasonFile(overrides: Partial<SeasonFile> = {}): SeasonFile {
  return { schemaVersion: 1, format: 3, teams: [], players: [], ...overrides }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'leagues-members-'))
  outside = await mkdtemp(join(tmpdir(), 'leagues-members-outside-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe('enableMembers', () => {
  test('creates the master list once and leaves an existing one alone', async () => {
    expect(await membersEnabled(root)).toBe(false)
    expect(await enableMembers(root)).toBe(true)
    expect(await membersEnabled(root)).toBe(true)
    expect(JSON.parse(await readFile(join(root, 'members.json'), 'utf8'))).toEqual(
      emptyMembersFile()
    )

    await writeFile(join(root, 'members.json'), '{"kept": true}')
    expect(await enableMembers(root)).toBe(false)
    expect(await readFile(join(root, 'members.json'), 'utf8')).toBe('{"kept": true}')
  })

  test('refuses to write through a symlinked master list', async () => {
    await writeFile(join(outside, 'private.json'), 'private')
    await symlink(join(outside, 'private.json'), join(root, 'members.json'))

    expect(await membersEnabled(root)).toBe(false)
    await expect(enableMembers(root)).rejects.toThrow('members.json can’t be a symbolic link')
    expect(await readFile(join(outside, 'private.json'), 'utf8')).toBe('private')
  })
})

describe('buildMembersSnapshot', () => {
  test('is disabled without a master list, whatever the seasons hold', async () => {
    await makeTree(root, { 'monday/Pairs/2025-26/Rules.docx': 'x' })
    await writeSeasonFile(join(root, 'monday/Pairs/2025-26'), seasonFile())

    const snapshot = await buildMembersSnapshot(root, await scanLeaguesRoot(root))
    expect(snapshot).toEqual({
      enabled: false,
      revision: '',
      nextId: 1,
      members: [],
      seasons: [],
      problems: []
    })
  })

  test('reads live and archived season files and skips seasons without one', async () => {
    await enableMembers(root)
    await makeTree(root, {
      'monday/Pairs/2024-25/Rules.docx': 'x',
      'monday/Pairs/2025-26/Rules.docx': 'x',
      '_archives/Pairs/2023-24/Rules.docx': 'x',
      'monday/Pairs/meta.json': JSON.stringify({ name: 'Monday Pairs' })
    })
    await writeSeasonFile(
      join(root, 'monday/Pairs/2025-26'),
      seasonFile({ players: [{ memberId: 1, teamId: null }] })
    )
    await writeSeasonFile(join(root, '_archives/Pairs/2023-24'), seasonFile({ format: 2 }))

    const snapshot = await buildMembersSnapshot(root, await scanLeaguesRoot(root))
    expect(snapshot.enabled).toBe(true)
    expect(
      snapshot.seasons.map((season) => [
        season.season,
        season.archived,
        season.leagueName,
        season.file.format
      ])
    ).toEqual([
      ['2025-26', false, 'Monday Pairs', 3],
      ['2023-24', true, 'Monday Pairs', 2]
    ])
    expect(snapshot.problems).toEqual([
      { kind: 'unlinked-player', path: join(root, 'monday/Pairs/2025-26'), memberId: 1 }
    ])
  })

  test('reports an unreadable file by name instead of failing the snapshot', async () => {
    await makeTree(root, {
      'members.json': '{ not json',
      'monday/Pairs/2025-26/meta.json': JSON.stringify({ schemaVersion: 1, format: 'three' }),
      'monday/Pairs/2024-25/meta.json': JSON.stringify({
        schemaVersion: 1,
        format: 3,
        teams: [],
        players: [{ memberId: 1, teamId: null }]
      })
    })

    const snapshot = await buildMembersSnapshot(root, await scanLeaguesRoot(root))
    expect(snapshot.enabled).toBe(true)
    expect(snapshot.members).toEqual([])
    expect(snapshot.seasons.map((season) => season.season)).toEqual(['2024-25'])
    // Roster rows are not reported as unlinked while the master list itself cannot be read.
    expect(snapshot.problems).toEqual([
      expect.objectContaining({
        kind: 'invalid-file',
        path: join(root, 'members.json'),
        message: expect.stringContaining('members.json is not valid JSON')
      }),
      expect.objectContaining({
        kind: 'invalid-file',
        path: join(root, 'monday/Pairs/2025-26'),
        message: expect.stringContaining('meta.json has an unexpected shape at format')
      })
    ])
  })
})

async function snapshotOf(): Promise<Awaited<ReturnType<typeof buildMembersSnapshot>>> {
  return buildMembersSnapshot(root, await scanLeaguesRoot(root))
}

function input(overrides: Partial<MemberInput> = {}): MemberInput {
  return {
    firstName: 'Ann',
    lastName: 'Lee',
    dob: '1990-01-01',
    email: 'ann@example.org',
    mbdIds: [],
    aliases: [],
    marketing: true,
    ...overrides
  }
}

describe('saveMember', () => {
  test('mints the next number, applies the age rules and refuses a stale revision', async () => {
    await enableMembers(root)
    const first = await snapshotOf()
    const today = new Date(2026, 8, 18)

    const ann = await saveMember(root, input(), first.revision, today)
    expect(ann.id).toBe(1)
    const stale = saveMember(root, input({ firstName: 'Late' }), first.revision, today)
    await expect(stale).rejects.toThrow(/changed on disk/)

    const second = await snapshotOf()
    const kid = await saveMember(
      root,
      input({ firstName: 'Kid', dob: '2015-06-01', phone: '0770', guardianContact: 'Dad' }),
      second.revision,
      today
    )
    expect(kid).toEqual({
      id: 2,
      firstName: 'Kid',
      lastName: 'Lee',
      dob: '2015-06-01',
      guardianContact: 'Dad',
      mbdIds: [],
      aliases: [],
      marketing: true
    })

    const third = await snapshotOf()
    const adult = await saveMember(
      root,
      input({
        id: 2,
        firstName: 'Kid',
        dob: '1999-06-01',
        guardianContact: 'Dad',
        email: undefined
      }),
      third.revision,
      today
    )
    // The guardian contact stays past 18: it may be the only contact on file.
    expect(adult).toEqual({
      id: 2,
      firstName: 'Kid',
      lastName: 'Lee',
      dob: '1999-06-01',
      guardianContact: 'Dad',
      mbdIds: [],
      aliases: [],
      marketing: true
    })
    expect((await snapshotOf()).nextId).toBe(3)
  })

  test('serialises overlapping saves so the second sees the first and is refused as stale', async () => {
    await enableMembers(root)
    const snapshot = await snapshotOf()
    const [first, second] = await Promise.allSettled([
      saveMember(root, input({ firstName: 'First' }), snapshot.revision),
      saveMember(root, input({ firstName: 'Second' }), snapshot.revision)
    ])
    expect(first.status).toBe('fulfilled')
    expect(second.status).toBe('rejected')
    expect((await snapshotOf()).members.map((member) => member.firstName)).toEqual(['First'])
  })

  test('never mints a number already in use when nextId has fallen behind', async () => {
    await enableMembers(root)
    await writeFile(
      join(root, 'members.json'),
      JSON.stringify({ schemaVersion: 1, nextId: 2, members: [{ ...input(), id: 7 }] })
    )
    const snapshot = await snapshotOf()
    const minted = await saveMember(root, input({ firstName: 'Next' }), snapshot.revision)
    expect(minted.id).toBe(8)
    expect((await snapshotOf()).nextId).toBe(9)
  })

  test('refuses to edit a merged, deleted or unknown member', async () => {
    await enableMembers(root)
    let snapshot = await snapshotOf()
    await saveMember(root, input(), snapshot.revision)
    snapshot = await snapshotOf()
    await saveMember(root, input({ firstName: 'Bea' }), snapshot.revision)
    snapshot = await snapshotOf()
    await mergeMembers(root, 2, 1, snapshot.revision)
    snapshot = await snapshotOf()
    await expect(saveMember(root, input({ id: 2 }), snapshot.revision)).rejects.toThrow(
      'Member 2 is not in the list any more'
    )
    await expect(saveMember(root, input({ id: 9 }), snapshot.revision)).rejects.toThrow(
      'Member 9 is not in the list any more'
    )
  })
})

describe('mergeMembers', () => {
  test('unions ids and aliases, fills blanks, and moves live rosters only', async () => {
    await enableMembers(root)
    await makeTree(root, {
      'monday/Pairs/2025-26/Rules.docx': 'x',
      '_archives/Pairs/2023-24/Rules.docx': 'x'
    })
    let snapshot = await snapshotOf()
    await saveMember(
      root,
      input({ firstName: 'Ann', mbdIds: ['10'], phone: undefined }),
      snapshot.revision
    )
    snapshot = await snapshotOf()
    await saveMember(
      root,
      input({
        firstName: 'Annie',
        mbdIds: ['11'],
        aliases: ['A Lee'],
        phone: '0770',
        email: undefined
      }),
      snapshot.revision
    )
    await writeSeasonFile(
      join(root, 'monday/Pairs/2025-26'),
      seasonFile({
        teams: [{ id: 'team_a', teamNo: 1, name: 'A' }],
        players: [
          { memberId: 1, teamId: 'team_a' },
          { memberId: 2, teamId: null }
        ]
      })
    )
    await writeSeasonFile(
      join(root, '_archives/Pairs/2023-24'),
      seasonFile({
        players: [{ memberId: 2, teamId: null }]
      })
    )

    snapshot = await snapshotOf()
    await mergeMembers(root, 2, 1, snapshot.revision)

    snapshot = await snapshotOf()
    expect(snapshot.members).toEqual([
      expect.objectContaining({
        id: 1,
        firstName: 'Ann',
        mbdIds: ['10', '11'],
        aliases: ['A Lee', 'Annie Lee'],
        email: 'ann@example.org',
        phone: '0770'
      }),
      expect.objectContaining({ id: 2, mergedInto: 1 })
    ])
    const live = snapshot.seasons.find((season) => !season.archived)
    const archived = snapshot.seasons.find((season) => season.archived)
    // Ann was already on the live roster, so the merged row is dropped rather than doubled.
    expect(live?.file.players).toEqual([{ memberId: 1, teamId: 'team_a' }])
    expect(archived?.file.players).toEqual([{ memberId: 2, teamId: null }])
    expect(snapshot.problems).toEqual([])
  })
})

describe('deleteMember', () => {
  test('hard-deletes an unreferenced member and soft-deletes a referenced one', async () => {
    await enableMembers(root)
    await makeTree(root, { '_archives/Pairs/2023-24/Rules.docx': 'x', 'monday/Pairs': null })
    let snapshot = await snapshotOf()
    await saveMember(root, input({ firstName: 'Loose' }), snapshot.revision)
    snapshot = await snapshotOf()
    await saveMember(root, input({ firstName: 'Rostered' }), snapshot.revision)
    await writeSeasonFile(
      join(root, '_archives/Pairs/2023-24'),
      seasonFile({
        players: [{ memberId: 2, teamId: null }]
      })
    )

    snapshot = await snapshotOf()
    expect(await deleteMember(root, 1, snapshot.revision)).toBe('hard')
    snapshot = await snapshotOf()
    expect(await deleteMember(root, 2, snapshot.revision)).toBe('soft')
    snapshot = await snapshotOf()
    expect(snapshot.members).toEqual([expect.objectContaining({ id: 2, deleted: true })])
    expect(snapshot.nextId).toBe(3)
  })

  test('a merge survivor referenced only through the merged number is still soft-deleted', async () => {
    await enableMembers(root)
    await makeTree(root, { '_archives/Pairs/2023-24/Rules.docx': 'x', 'monday/Pairs': null })
    let snapshot = await snapshotOf()
    await saveMember(root, input({ firstName: 'Survivor' }), snapshot.revision)
    snapshot = await snapshotOf()
    await saveMember(root, input({ firstName: 'Merged' }), snapshot.revision)
    await writeSeasonFile(
      join(root, '_archives/Pairs/2023-24'),
      seasonFile({ players: [{ memberId: 2, teamId: null }] })
    )
    snapshot = await snapshotOf()
    await mergeMembers(root, 2, 1, snapshot.revision)

    snapshot = await snapshotOf()
    expect(await deleteMember(root, 1, snapshot.revision)).toBe('soft')
    snapshot = await snapshotOf()
    expect(snapshot.members).toEqual([
      expect.objectContaining({ id: 1, deleted: true }),
      expect.objectContaining({ id: 2, mergedInto: 1 })
    ])
    expect(snapshot.problems).toEqual([])
  })
})

describe('renumberDuplicates', () => {
  test('gives every holder but the chosen one a fresh number', async () => {
    await enableMembers(root)
    await writeFile(
      join(root, 'members.json'),
      JSON.stringify({
        schemaVersion: 1,
        nextId: 5,
        members: [
          { ...input({ firstName: 'First' }), id: 3 },
          { ...input({ firstName: 'Second' }), id: 3 },
          { ...input({ firstName: 'Third' }), id: 3 }
        ]
      })
    )
    let snapshot = await snapshotOf()
    expect(snapshot.problems).toEqual([{ kind: 'duplicate-number', id: 3, count: 3 }])

    expect(await renumberDuplicates(root, 3, 1, snapshot.revision)).toEqual([5, 6])
    snapshot = await snapshotOf()
    expect(snapshot.members.map((member) => [member.firstName, member.id])).toEqual([
      ['First', 5],
      ['Second', 3],
      ['Third', 6]
    ])
    expect(snapshot.nextId).toBe(7)
    await expect(renumberDuplicates(root, 3, 0, snapshot.revision)).rejects.toThrow(
      'Member number 3 is not duplicated'
    )
  })
})

describe('saveSeason', () => {
  const ref = { day: 'monday' as const, leagueFolder: 'Pairs', seasonName: '2025-26' }

  test('replaces a live season file after validating teams and players', async () => {
    await enableMembers(root)
    await makeTree(root, { 'monday/Pairs/2025-26/Rules.docx': 'x' })
    await writeSeasonFile(join(root, 'monday/Pairs/2025-26'), seasonFile())
    let snapshot = await snapshotOf()
    const revision = snapshot.seasons[0].revision

    await expect(
      saveSeason(root, ref, seasonFile({ players: [{ memberId: 1, teamId: 'ghost' }] }), revision)
    ).rejects.toThrow('Player 1 is in a team that does not exist')
    await expect(
      saveSeason(
        root,
        ref,
        seasonFile({
          teams: [
            { id: 'a', teamNo: 1, name: 'A' },
            { id: 'b', teamNo: 1, name: 'B' }
          ]
        }),
        revision
      )
    ).rejects.toThrow('Two teams cannot share a team number')
    await expect(
      saveSeason(
        root,
        ref,
        seasonFile({
          teams: [
            { id: 'a', teamNo: 1, name: 'A' },
            { id: 'a', teamNo: 2, name: 'Also A' }
          ]
        }),
        revision
      )
    ).rejects.toThrow('Team ids must be unique')
    await expect(
      saveSeason(
        root,
        ref,
        seasonFile({
          players: [
            { memberId: 1, teamId: null },
            { memberId: 1, teamId: null }
          ]
        }),
        revision
      )
    ).rejects.toThrow('A member can only be on a roster once')

    const next = seasonFile({
      format: 2,
      weeks: 30,
      teams: [{ id: 'team_a', teamNo: 1, name: 'A' }],
      players: [{ memberId: 1, teamId: 'team_a', position: 1 }]
    })
    await saveSeason(root, ref, next, revision)
    snapshot = await snapshotOf()
    expect(snapshot.seasons[0].file).toEqual(next)
    await expect(saveSeason(root, ref, next, revision)).rejects.toThrow(/changed on disk/)
  })

  test('refuses seasons without a file and archived seasons', async () => {
    await enableMembers(root)
    await makeTree(root, {
      'monday/Pairs/2025-26/Rules.docx': 'x',
      '_archives/Pairs/2023-24/Rules.docx': 'x'
    })
    await expect(saveSeason(root, ref, seasonFile(), '')).rejects.toThrow(
      'This season has no roster file'
    )
    await expect(
      saveSeason(root, { ...ref, seasonName: '2023-24' }, seasonFile(), '')
    ).rejects.toThrow()
  })
})

describe('markCardsIssued', () => {
  test('stamps the chosen live members with the day and refuses a stale list', async () => {
    await enableMembers(root)
    const master = join(root, 'members.json')
    await writeFile(
      master,
      JSON.stringify({
        schemaVersion: 1,
        nextId: 3,
        members: [
          { id: 1, firstName: 'Ann', lastName: 'Lee', mbdIds: [], aliases: [], marketing: true },
          { id: 2, firstName: 'Bob', lastName: 'Kay', mbdIds: [], aliases: [], marketing: true }
        ]
      })
    )
    const snapshot = await buildMembersSnapshot(root, await scanLeaguesRoot(root))

    await markCardsIssued(root, [2], snapshot.revision, new Date('2026-09-18T20:00:00Z'))
    const members = membersFileSchema.parse(JSON.parse(await readFile(master, 'utf8'))).members
    expect(members.map((member) => member.cardIssued)).toEqual([undefined, '2026-09-18'])

    await expect(markCardsIssued(root, [1], snapshot.revision)).rejects.toThrow(STALE_MESSAGE)
    const fresh = await buildMembersSnapshot(root, await scanLeaguesRoot(root))
    await expect(markCardsIssued(root, [9], fresh.revision)).rejects.toThrow('not in the list')
  })
})
