import { ZipArchive } from 'archiver'
import { constants, createWriteStream } from 'node:fs'
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
import { basename, dirname, extname, join } from 'node:path'
import { healMeta, parseLeagueMetaInput } from '../../shared/meta'
import { compareSeasonNames, parseSeasonName, type SeasonName } from '../../shared/season'
import { sanitiseFolderName } from '../../shared/sanitise'
import type { Weekday } from '../../shared/weekday'
import type { SeasonCreateRequest } from '../../shared/season-create'
import { toUserFacing, UserFacingError } from './fs-errors'
import {
  assertInsideRoot,
  assertLeagueFolderName,
  assertRealLayout,
  resolveNewLiveSeasonRoot,
  resolveLiveSeasonRoot
} from './paths'
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
    // Unexpected repair faults remain reportable bugs rather than being
    // disguised as expected user mistakes.
    throw toUserFacing(err)
  }
}

async function repairReservedLocationsUnlocked(
  root: string,
  templatesSource?: string
): Promise<RepairResult> {
  try {
    return await repairReservedLocationsUnchecked(root, templatesSource)
  } catch (err) {
    // Keep the unlocked boundary safe for callers already holding the lock,
    // while preserving unexpected errors for Sentry.
    throw toUserFacing(err)
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
  if (!folderName) throw new UserFacingError(`"${displayName}" is not a usable league name`)

  const path = join(root, day, folderName)
  // Check collisions first: realpath can canonicalise casing and obscure an ordinary duplicate-name error.
  if (await exists(path)) {
    throw new UserFacingError(`A league folder named "${folderName}" already exists`)
  }
  await assertRealLayout(root, path, join(day, folderName))

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

export interface CreateSeasonOptions extends SeasonCreateRequest {
  root: string
}

export interface CreateSeasonResult {
  seasonPath: string
  archived: string | null
}

export async function createSeason(opts: CreateSeasonOptions): Promise<CreateSeasonResult> {
  assertLeagueFolderName(opts.leagueFolder)
  const season = parseSeasonName(opts.seasonName)
  if (!season || season.name !== opts.seasonName) {
    throw new UserFacingError('Invalid season name')
  }
  return withTemplateLock(opts.root, async () => {
    // Resolve after waiting for earlier operations, not against a potentially stale pre-queue path.
    const seasonPath = await resolveNewLiveSeasonRoot(
      opts.root,
      opts.day,
      opts.leagueFolder,
      season.name
    )
    return createSeasonUnlocked(opts, seasonPath, season)
  })
}

async function createSeasonUnlocked(
  opts: CreateSeasonOptions,
  seasonPath: string,
  season: SeasonName
): Promise<CreateSeasonResult> {
  await repairReservedLocationsUnlocked(opts.root)

  const leaguePath = dirname(seasonPath)
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
  day: Weekday
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
  assertLeagueFolderName(leagueFolder)
  const seasons = seasonNames.map((name) => {
    const season = parseSeasonName(name)
    if (!season || season.name !== name) throw new UserFacingError('Invalid season name')
    return season
  })
  if (seasons.length === 0) return []
  const archiveDir = join(root, '_archives', leagueFolder)
  await assertRealLayout(root, archiveDir, join('_archives', leagueFolder))
  // Validate the entire batch first so a later invalid selection cannot leave earlier zip writes behind.
  const plans = await Promise.all(
    seasons.map(async (season) => {
      const seasonDir = join(archiveDir, season.name)
      if (!(await exists(seasonDir))) {
        throw new UserFacingError(`"${season.name}" has no archive folder for ${leagueFolder}`)
      }
      await assertInsideRoot(root, seasonDir)
      const zipPath = await assertInsideRoot(root, join(archiveDir, `${season.name}.zip`), {
        allowMissingLeaf: true
      })
      return { season, seasonDir, zipPath }
    })
  )
  const zips: string[] = []

  for (const { season, seasonDir, zipPath } of plans) {
    await new Promise<void>((resolvePromise, reject) => {
      const output = createWriteStream(zipPath)
      const zip = new ZipArchive({ zlib: { level: 9 } })
      let failed = false
      let outputClosed = false
      output.on('close', () => {
        outputClosed = true
        if (!failed) resolvePromise()
      })
      const fail = (err: Error): void => {
        if (failed) return
        failed = true
        zip.destroy()
        const cleanup = (): void => {
          // A failed archive is never useful; ignore cleanup failure so the initiating error stays actionable.
          void rm(zipPath, { force: true }).then(
            () => reject(toUserFacing(err)),
            () => reject(toUserFacing(err))
          )
        }
        if (outputClosed) cleanup()
        else {
          // Windows cannot remove an open destination, so wait for destruction to close its handle.
          output.once('close', cleanup)
          output.destroy()
        }
      }
      // Archive errors do not cover destination failures, so handle the stream or the promise can hang.
      output.on('error', fail)
      zip.on('error', fail)
      zip.pipe(output)
      zip.directory(seasonDir, season.name)
      // Archiver reports through both the emitter and its promise; handling both prevents a rejected finalize leak.
      void zip.finalize().catch(fail)
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
    let suffix = 1
    while (true) {
      const name = suffix === 1 ? `${stem}${ext}` : `${stem} (${suffix})${ext}`
      const target = join(dest, name)
      try {
        // The exclusive flag closes the exists/copy race and refuses dangling links as destinations.
        await copyFile(source, target, constants.COPYFILE_EXCL)
        copied.push(target)
        break
      } catch (err) {
        // SAFETY: Node filesystem errors are Errors carrying an optional string code.
        const code = err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined
        if (code !== 'EEXIST') throw err
        suffix += 1
      }
    }
  }
  return copied
}
