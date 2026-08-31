import { ZipArchive } from 'archiver'
import { createWriteStream } from 'node:fs'
import {
  copyFile,
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { healMeta, parseLeagueMetaInput } from '../../shared/meta'
import { compareSeasonNames, parseSeasonName, type SeasonName } from '../../shared/season'
import { sanitiseFolderName } from '../../shared/sanitise'
import type { Weekday } from '../../shared/weekday'

const SPECIAL_FOLDERS = ['_templates', '_shared', '_archives']

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  )
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter((e) => e.isFile() && !e.name.startsWith('.')).map((e) => e.name)
  } catch {
    return []
  }
}

/** Create the app-special folders and seed _templates from a source directory. */
export async function initialiseRoot(root: string, templatesSource?: string): Promise<void> {
  for (const folder of SPECIAL_FOLDERS) {
    await mkdir(join(root, folder), { recursive: true })
  }
  if (!templatesSource) return
  for (const name of await listFiles(templatesSource)) {
    const target = join(root, '_templates', name)
    if (!(await exists(target))) {
      await copyFile(join(templatesSource, name), target)
    }
  }
}

/** Create a new league folder under its weekday, with a fresh meta.json. */
export async function createLeague(
  root: string,
  day: Weekday,
  displayName: string
): Promise<string> {
  const folderName = sanitiseFolderName(displayName)
  if (!folderName) throw new Error(`"${displayName}" is not a usable league name`)

  const path = join(root, day, folderName)
  if (await exists(path)) throw new Error(`A league folder named "${folderName}" already exists`)

  await mkdir(path, { recursive: true })
  const meta = healMeta(parseLeagueMetaInput({ name: displayName.trim() }), {
    folderName,
    day,
    liveSeasons: [],
    archivedSeasons: []
  })
  await writeFile(join(path, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8')
  return path
}

async function liveSeasonsOf(leaguePath: string): Promise<SeasonName[]> {
  const entries = await readdir(leaguePath, { withFileTypes: true })
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => parseSeasonName(e.name))
    .filter((s): s is SeasonName => s !== null)
    .sort(compareSeasonNames)
}

async function moveDir(from: string, to: string): Promise<void> {
  await mkdir(join(to, '..'), { recursive: true })
  try {
    await rename(from, to)
  } catch {
    await cp(from, to, { recursive: true })
    await rm(from, { recursive: true })
  }
}

export interface CreateSeasonOptions {
  root: string
  day: Weekday
  leagueFolder: string
  seasonName: string
  source: 'templates' | 'previous' | 'empty'
  archiveOldest: boolean
}

export interface CreateSeasonResult {
  seasonPath: string
  archived: string | null
}

export async function createSeason(opts: CreateSeasonOptions): Promise<CreateSeasonResult> {
  const season = parseSeasonName(opts.seasonName)
  if (!season) throw new Error(`"${opts.seasonName}" is not a valid season name`)

  const leaguePath = join(opts.root, opts.day, opts.leagueFolder)
  const seasonPath = join(leaguePath, season.name)
  if (await exists(seasonPath)) throw new Error(`Season "${season.name}" already exists`)

  const before = await liveSeasonsOf(leaguePath)

  await mkdir(seasonPath, { recursive: true })
  const sourceDir =
    opts.source === 'templates'
      ? join(opts.root, '_templates')
      : opts.source === 'previous'
        ? before.length > 0
          ? join(leaguePath, before[before.length - 1].name)
          : null
        : null
  if (sourceDir) {
    for (const name of await listFiles(sourceDir)) {
      await copyFile(join(sourceDir, name), join(seasonPath, name))
    }
  }

  let archived: string | null = null
  const after = await liveSeasonsOf(leaguePath)
  if (opts.archiveOldest && after.length > 2) {
    const oldest = after[0]
    await moveDir(
      join(leaguePath, oldest.name),
      join(opts.root, '_archives', opts.leagueFolder, oldest.name)
    )
    archived = oldest.name
  }

  const archivePath = join(opts.root, '_archives', opts.leagueFolder)
  const archivedSeasons = (await readdir(archivePath, { withFileTypes: true }).catch(() => []))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)

  const metaPath = join(leaguePath, 'meta.json')
  const existing = await readFile(metaPath, 'utf8')
    .then((raw) => parseLeagueMetaInput(JSON.parse(raw)))
    .catch(() => null)
  const meta = healMeta(existing, {
    folderName: opts.leagueFolder,
    day: opts.day,
    liveSeasons: await liveSeasonsOf(leaguePath),
    archivedSeasons
  })
  const created = meta.seasons.find((s) => s.name === season.name)
  if (created && !created.createdAt) created.createdAt = new Date().toISOString()
  await writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8')

  return { seasonPath, archived }
}

/** Zip each selected archived season folder into `{season}.zip` beside it. */
export async function zipArchivedSeasons(
  root: string,
  leagueFolder: string,
  seasonNames: string[]
): Promise<string[]> {
  const archiveDir = join(root, '_archives', leagueFolder)
  const zips: string[] = []

  for (const name of seasonNames) {
    const seasonDir = join(archiveDir, name)
    if (!(await exists(seasonDir))) {
      throw new Error(`"${name}" has no archive folder for ${leagueFolder}`)
    }
    const zipPath = join(archiveDir, `${name}.zip`)
    await new Promise<void>((resolvePromise, reject) => {
      const output = createWriteStream(zipPath)
      const zip = new ZipArchive({ zlib: { level: 9 } })
      output.on('close', () => resolvePromise())
      zip.on('error', reject)
      zip.pipe(output)
      zip.directory(seasonDir, name)
      void zip.finalize()
    })
    zips.push(zipPath)
  }

  return zips
}

/** Copy files into a folder, never overwriting — clashes get " (2)", " (3)", … */
export async function importFiles(dest: string, sources: string[]): Promise<string[]> {
  const copied: string[] = []
  for (const source of sources) {
    const ext = extname(source)
    const stem = basename(source, ext)
    let target = join(dest, `${stem}${ext}`)
    for (let n = 2; await exists(target); n++) {
      target = join(dest, `${stem} (${n})${ext}`)
    }
    await copyFile(source, target)
    copied.push(target)
  }
  return copied
}
