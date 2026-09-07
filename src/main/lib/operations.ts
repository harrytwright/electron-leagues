import { ZipArchive } from 'archiver'
import { createWriteStream } from 'node:fs'
import {
  copyFile,
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { healMeta, parseLeagueMetaInput } from '../../shared/meta'
import { compareSeasonNames, parseSeasonName, type SeasonName } from '../../shared/season'
import { sanitiseFolderName } from '../../shared/sanitise'
import { isWeekday, type Weekday } from '../../shared/weekday'
import { isWorkflowId } from '../../shared/workflows'
import { toUserFacing, UserFacingError } from './fs-errors'
import { assertLeagueFolderName, resolveLiveSeasonRoot } from './paths'
import {
  executeCopyPlan,
  FILE_RULES,
  readDirectMetadata,
  runWorkflow,
  syncMissingTemplates,
  type CopyExecutionResult
} from './template-workflows'

const SPECIAL_FOLDERS = ['_templates', '_shared', '_archives'] as const
const REQUIRED_TEMPLATES = ['Rules.docx', 'Sign-In Sheet.docx'] as const
const REQUIRED_TEMPLATE_NAMES: ReadonlySet<string> = new Set(REQUIRED_TEMPLATES)

const templateTasks = new Map<string, Promise<void>>()

export interface RepairResult {
  repaired: string[]
  warnings: string[]
}

export type RootSelectionMode = 'select' | 'init'

/** Keep repair and its dependent readers together, including aliases of the same root. */
export async function withTemplateLock<T>(root: string, run: () => Promise<T>): Promise<T> {
  const key = await realpath(root).catch((err) => {
    throw toUserFacing(err)
  })
  const previous = templateTasks.get(key) ?? Promise.resolve()
  const task = previous.then(run)
  // A failed operation releases the queue too; each caller still receives its own error.
  const settled = task.then(
    () => {},
    () => {}
  )
  templateTasks.set(key, settled)
  try {
    return await task
  } finally {
    if (templateTasks.get(key) === settled) templateTasks.delete(key)
  }
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  )
}

/** Repair app-owned locations without ever creating the selected root itself. */
export async function repairReservedLocations(
  root: string,
  templatesSource?: string
): Promise<RepairResult> {
  try {
    return await withTemplateLock(root, () =>
      repairReservedLocationsUnlocked(root, templatesSource)
    )
  } catch (err) {
    const mapped = toUserFacing(err)
    throw mapped instanceof UserFacingError ? mapped : new UserFacingError(mapped.message)
  }
}

async function repairReservedLocationsUnlocked(
  root: string,
  templatesSource?: string
): Promise<RepairResult> {
  try {
    return await repairReservedLocationsUnchecked(root, templatesSource)
  } catch (err) {
    const mapped = toUserFacing(err)
    throw mapped instanceof UserFacingError ? mapped : new UserFacingError(mapped.message)
  }
}

async function repairReservedLocationsUnchecked(
  root: string,
  templatesSource?: string
): Promise<RepairResult> {
  const repaired: string[] = []
  const rootInfo = await stat(root).catch((err) => {
    throw toUserFacing(err)
  })
  if (!rootInfo.isDirectory()) throw new UserFacingError('The leagues location is not a folder')

  for (const folder of SPECIAL_FOLDERS) {
    const target = join(root, folder)
    let existing = await lstat(target).catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') return null
      throw err
    })
    if (!existing) {
      let created = true
      await mkdir(target).catch((err: NodeJS.ErrnoException) => {
        // Concurrent repairs may both observe the missing folder. The winner is
        // valid only after the checks below inspect what now occupies it.
        if (err.code !== 'EEXIST') throw toUserFacing(err)
        created = false
      })
      existing = await lstat(target)
      if (created) repaired.push(folder)
    }
    if (existing?.isSymbolicLink()) {
      throw new UserFacingError(`Reserved folder “${folder}” can’t be a symbolic link`)
    }
    if (existing && !existing.isDirectory()) {
      throw new UserFacingError(`Reserved location “${folder}” is not a folder`)
    }
  }

  if (!templatesSource) return { repaired, warnings: [] }
  const available = (await readDirectMetadata(templatesSource)).filter((file) =>
    REQUIRED_TEMPLATE_NAMES.has(file.relativePath)
  )
  const found = new Set(
    available.filter((file) => file.kind === 'file').map((file) => file.relativePath)
  )
  for (const required of REQUIRED_TEMPLATES) {
    if (!found.has(required)) {
      throw new UserFacingError(`Bundled template “${required}” is missing`)
    }
  }
  const destination = join(root, '_templates')
  const existing = await readDirectMetadata(destination)
  for (const item of existing) {
    if (REQUIRED_TEMPLATE_NAMES.has(item.relativePath) && item.kind !== 'file') {
      throw new UserFacingError(`Template “${item.relativePath}” is not a regular file`)
    }
  }
  const plan = await FILE_RULES['fill-missing'](existing, available)
  const copied = await executeCopyPlan(plan, { templates: templatesSource, destination })
  repaired.push(...copied.added.map((name) => `_templates/${name}`))
  return { repaired, warnings: [] }
}

/** Create/repair app-owned locations and seed only the two bundled defaults. */
export async function initialiseRoot(
  root: string,
  templatesSource?: string
): Promise<RepairResult> {
  return repairReservedLocations(root, templatesSource)
}

/** Selecting an existing root is read-only; only initialisation repairs it. */
export async function prepareRootSelection(
  root: string,
  mode: RootSelectionMode,
  templatesSource?: string
): Promise<RepairResult | null> {
  return mode === 'init' ? initialiseRoot(root, templatesSource) : null
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
  day: string
  leagueFolder: string
  seasonName: string
  source: string
  archiveOldest: boolean
}

export interface CreateSeasonResult {
  seasonPath: string
  archived: string | null
}

export async function createSeason(opts: CreateSeasonOptions): Promise<CreateSeasonResult> {
  return withTemplateLock(opts.root, () => createSeasonUnlocked(opts))
}

async function createSeasonUnlocked(opts: CreateSeasonOptions): Promise<CreateSeasonResult> {
  if (!isWorkflowId(opts.source)) throw new UserFacingError('Unknown season workflow')
  if (!isWeekday(opts.day)) throw new UserFacingError('Invalid league day')
  assertLeagueFolderName(opts.leagueFolder)
  const season = parseSeasonName(opts.seasonName)
  if (!season) throw new Error(`"${opts.seasonName}" is not a valid season name`)
  await repairReservedLocationsUnlocked(opts.root)

  const leaguePath = join(opts.root, opts.day, opts.leagueFolder)
  const seasonPath = join(leaguePath, season.name)
  if (await exists(seasonPath)) throw new Error(`Season "${season.name}" already exists`)

  const before = await liveSeasonsOf(leaguePath)

  await mkdir(seasonPath, { recursive: true })
  const previousDir =
    opts.source === 'previous' && before.length > 0
      ? join(leaguePath, before[before.length - 1].name)
      : undefined
  await runWorkflow(opts.source, {
    current: previousDir,
    templates: join(opts.root, '_templates'),
    destination: seasonPath
  })

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

export interface SyncSeasonOptions {
  root: string
  day: string
  leagueFolder: string
  seasonName: string
}

/** Fill one existing live season root with missing templates. */
export async function syncSeasonWithTemplates(
  opts: SyncSeasonOptions
): Promise<CopyExecutionResult> {
  return withTemplateLock(opts.root, async () => {
    const seasonPath = await resolveLiveSeasonRoot(
      opts.root,
      opts.day,
      opts.leagueFolder,
      opts.seasonName
    )
    await repairReservedLocationsUnlocked(opts.root)
    return syncMissingTemplates(seasonPath, join(opts.root, '_templates'))
  })
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
