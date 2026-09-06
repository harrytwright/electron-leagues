import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { healMeta, parseLeagueMetaInput, type LeagueMetaInput } from '../../shared/meta'
import { compareSeasonNames, parseSeasonName, type SeasonName } from '../../shared/season'
import type { DirEntry, FileEntry, LeagueNode, LeaguesTree, SeasonNode } from '../../shared/tree'
import { isWeekday, WEEKDAYS, type Weekday } from '../../shared/weekday'
import { isMissing } from './fs-errors'

export type { DirEntry, FileEntry, LeagueNode, LeaguesTree, SeasonNode }

const META_FILE = 'meta.json'

function visible(name: string): boolean {
  return !name.startsWith('.')
}

/** Folder-first natural ordering with a case-sensitive tie-break independent of input order. */
export function compareDirectoryEntries(
  a: Pick<FileEntry, 'name' | 'kind'>,
  b: Pick<FileEntry, 'name' | 'kind'>
): number {
  if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
  return (
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) ||
    a.name.localeCompare(b.name)
  )
}

/**
 * Single-level listing for the on-demand file browser. Unlike `listEntries`
 * this throws when the directory is gone, so the renderer can tell "empty"
 * from "no longer exists". Entries that vanish mid-listing (or dangling
 * symlinks) are skipped; any other stat failure propagates.
 */
export async function listDirEntries(dir: string): Promise<DirEntry[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const listed = await Promise.all(
    entries
      .filter((e) => visible(e.name))
      .map(async (e): Promise<DirEntry | null> => {
        const path = join(dir, e.name)
        try {
          const info = await stat(path)
          return {
            name: e.name,
            path,
            kind: info.isDirectory() ? 'folder' : 'file',
            mtime: info.mtimeMs
          }
        } catch (err) {
          if (isMissing(err)) return null
          throw err
        }
      })
  )
  return listed.filter((e): e is DirEntry => e !== null).sort(compareDirectoryEntries)
}

async function listEntries(dir: string): Promise<FileEntry[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => visible(e.name))
      .map((e) => ({
        name: e.name,
        path: join(dir, e.name),
        kind: e.isDirectory() ? ('folder' as const) : ('file' as const)
      }))
  } catch {
    return []
  }
}

function sortSeasonNames(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const pa = parseSeasonName(a)
    const pb = parseSeasonName(b)
    if (pa && pb) return compareSeasonNames(pa, pb)
    return a.localeCompare(b)
  })
}

interface ExistingMeta {
  raw: string | null
  input: LeagueMetaInput | null
}

async function readExistingMeta(path: string): Promise<ExistingMeta> {
  try {
    const raw = await readFile(path, 'utf8')
    return { raw, input: parseLeagueMetaInput(JSON.parse(raw)) }
  } catch {
    return { raw: null, input: null }
  }
}

async function scanLeague(
  day: Weekday,
  leagueDir: FileEntry,
  root: string,
  heal: boolean
): Promise<LeagueNode> {
  const entries = await listEntries(leagueDir.path)

  const seasonFolders: { entry: FileEntry; season: SeasonName }[] = []
  const otherEntries: FileEntry[] = []
  for (const entry of entries) {
    if (entry.name === META_FILE) continue
    const season = entry.kind === 'folder' ? parseSeasonName(entry.name) : null
    if (season) {
      seasonFolders.push({ entry, season })
    } else {
      otherEntries.push(entry)
    }
  }
  seasonFolders.sort((a, b) => compareSeasonNames(a.season, b.season))

  const archivePath = join(root, '_archives', leagueDir.name)
  const archiveEntries = await listEntries(archivePath)
  const archivedSeasons = sortSeasonNames(
    archiveEntries.filter((e) => e.kind === 'folder').map((e) => e.name)
  )

  const metaPath = join(leagueDir.path, META_FILE)
  const existing = await readExistingMeta(metaPath)
  const meta = healMeta(existing.input, {
    folderName: leagueDir.name,
    day,
    liveSeasons: seasonFolders.map((s) => s.season),
    archivedSeasons
  })

  if (heal) {
    const serialised = JSON.stringify(meta, null, 2) + '\n'
    if (serialised !== existing.raw) {
      try {
        await writeFile(metaPath, serialised, 'utf8')
      } catch (err) {
        // The league was removed mid-scan (e.g. just trashed); the watcher
        // will trigger a fresh scan without it.
        if (!isMissing(err)) throw err
      }
    }
  }

  const seasons: SeasonNode[] = await Promise.all(
    seasonFolders.map(async ({ entry, season }, index) => ({
      name: season.name,
      status:
        index === seasonFolders.length - 1
          ? ('active' as const)
          : index === seasonFolders.length - 2
            ? ('previous' as const)
            : ('live' as const),
      path: entry.path,
      files: await listEntries(entry.path)
    }))
  )

  return {
    folderName: leagueDir.name,
    path: leagueDir.path,
    day,
    meta,
    running: seasons.length > 0,
    seasons,
    otherEntries,
    archivedSeasons,
    archiveItemCount: archiveEntries.length,
    archivePath
  }
}

export async function scanLeaguesRoot(
  root: string,
  opts: { heal?: boolean } = {}
): Promise<LeaguesTree> {
  const heal = opts.heal ?? false
  const rootEntries = await listEntries(root)

  // SAFETY: fromEntries over the full WEEKDAYS tuple yields exactly one entry per Weekday key.
  const days = Object.fromEntries(WEEKDAYS.map((d) => [d, [] as LeagueNode[]])) as Record<
    Weekday,
    LeagueNode[]
  >
  const unrecognisedRootEntries: FileEntry[] = []

  for (const entry of rootEntries) {
    if (entry.name.startsWith('_')) continue
    if (entry.kind === 'folder' && isWeekday(entry.name)) {
      const day = entry.name
      const leagueDirs = (await listEntries(entry.path)).filter((e) => e.kind === 'folder')
      days[day] = await Promise.all(leagueDirs.map((dir) => scanLeague(day, dir, root, heal)))
    } else {
      unrecognisedRootEntries.push(entry)
    }
  }

  const specialDirs = new Set(rootEntries.filter((e) => e.kind === 'folder').map((e) => e.name))

  return {
    root,
    days,
    templatesPath: join(root, '_templates'),
    sharedPath: join(root, '_shared'),
    hasTemplates: specialDirs.has('_templates'),
    hasShared: specialDirs.has('_shared'),
    unrecognisedRootEntries
  }
}
