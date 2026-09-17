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
  stat
} from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { healMeta, parseLeagueMetaInput, type LeagueMetaInput } from '../../shared/meta'
import type { ImportFilesResult, ZipArchiveResult } from '../../shared/ipc'
import {
  compareSeasonNames,
  parseSeasonName,
  sortSeasonNames,
  type SeasonName
} from '../../shared/season'
import { sanitiseFolderName } from '../../shared/sanitise'
import type { Weekday } from '../../shared/weekday'
import type { SeasonCreateRequest, SeasonSyncRequest } from '../../shared/season-create'
import { errorCode, isAlreadyExists, isMissing, toUserFacing, UserFacingError } from './fs-errors'
import { assertMetaWritable, META_FILE, writeLeagueMeta } from './league-meta'
import {
  ARCHIVES_FOLDER,
  assertInsideRoot,
  assertLeagueFolderName,
  assertRealLayout,
  resolveArchivePath,
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

const SPECIAL_FOLDERS = ['_templates', '_shared', ARCHIVES_FOLDER] as const
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
  const duplicateFolder = `A league folder named "${folderName}" already exists`

  const path = join(root, day, folderName)
  // Check collisions first: realpath can canonicalise casing and obscure an ordinary duplicate-name error.
  if (await exists(path)) {
    throw new UserFacingError(duplicateFolder)
  }
  await assertRealLayout(root, path, join(day, folderName))

  await mkdir(dirname(path), { recursive: true })
  await mkdir(path).catch((err) => {
    if (isAlreadyExists(err)) {
      throw new UserFacingError(duplicateFolder)
    }
    throw toUserFacing(err)
  })
  const meta = healMeta(parseLeagueMetaInput({ name: displayName.trim() }), {
    folderName,
    day,
    liveSeasons: [],
    archivedSeasons: []
  })
  await writeLeagueMeta(path, meta, { exclusive: true }).catch((err) => {
    if (isAlreadyExists(err)) {
      throw new UserFacingError(duplicateFolder)
    }
    throw toUserFacing(err)
  })
  return path
}

async function isOccupied(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    (err) => {
      if (isMissing(err)) return false
      throw toUserFacing(err)
    }
  )
}

/**
 * On a case-insensitive volume a case-only rename targets the folder it renames.
 * Anything unresolvable, such as a dangling link, counts as a different occupant.
 */
async function isSameEntry(a: string, b: string): Promise<boolean> {
  try {
    const [realA, realB] = await Promise.all([realpath(a), realpath(b)])
    return realA === realB
  } catch {
    return false
  }
}

async function readLeagueMetaInput(leaguePath: string): Promise<LeagueMetaInput | null> {
  return readFile(join(leaguePath, META_FILE), 'utf8')
    .then((raw) => parseLeagueMetaInput(JSON.parse(raw)))
    .catch(() => null)
}

async function archivedSeasonsOf(archivePath: string): Promise<string[]> {
  const entries = await readdir(archivePath, { withFileTypes: true }).catch(() => [])
  return sortSeasonNames(entries.filter((e) => e.isDirectory()).map((e) => e.name))
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- catch clauses hand us `unknown`; see fs-errors
function renameFailure(leagueFolder: string, err: unknown): Error {
  // Windows refuses to move a folder holding an open document with either code.
  const code = errorCode(err)
  if (code === 'EBUSY' || code === 'EPERM') {
    return new UserFacingError(
      `Couldn’t rename “${leagueFolder}” because a file inside it is open in another program`
    )
  }
  return toUserFacing(err)
}

export interface RenameLeagueOptions {
  root: string
  day: Weekday
  leagueFolder: string
  displayName: string
}

/**
 * Give a league a new display name and, when the sanitised name differs, a new
 * folder. The archive folder follows the league so its seasons stay attached.
 * Every collision is checked before anything moves, and a failed archive move
 * puts the live folder back so the tree never shows a league without its archive.
 */
export async function renameLeague(
  opts: RenameLeagueOptions,
  moveFolder: (from: string, to: string) => Promise<void> = rename
): Promise<string> {
  assertLeagueFolderName(opts.leagueFolder)
  const displayName = opts.displayName.trim()
  const folderName = sanitiseFolderName(displayName)
  if (!folderName) throw new UserFacingError(`"${opts.displayName}" is not a usable league name`)
  return withTemplateLock(opts.root, () =>
    renameLeagueUnlocked(opts, displayName, folderName, moveFolder)
  )
}

async function renameLeagueUnlocked(
  opts: RenameLeagueOptions,
  displayName: string,
  folderName: string,
  moveFolder: (from: string, to: string) => Promise<void>
): Promise<string> {
  const { root, day, leagueFolder } = opts
  const fromPath = await assertRealLayout(
    root,
    join(root, day, leagueFolder),
    join(day, leagueFolder)
  ).catch((err) => {
    throw toUserFacing(err)
  })
  const fromInfo = await stat(fromPath).catch((err) => {
    throw toUserFacing(err)
  })
  if (!fromInfo.isDirectory()) throw new UserFacingError('That folder no longer exists')
  await assertMetaWritable(fromPath)

  const folderChanges = folderName !== leagueFolder
  const toPath = folderChanges ? join(root, day, folderName) : fromPath
  const fromArchive = await resolveArchivePath(root, leagueFolder)
  const toArchive = folderChanges ? await resolveArchivePath(root, folderName) : fromArchive
  const hasArchive = await isOccupied(fromArchive)

  if (folderChanges) {
    if ((await isOccupied(toPath)) && !(await isSameEntry(fromPath, toPath))) {
      throw new UserFacingError(`A league folder named "${folderName}" already exists`)
    }
    await assertRealLayout(root, toPath, join(day, folderName))
    if (
      hasArchive &&
      (await isOccupied(toArchive)) &&
      !(await isSameEntry(fromArchive, toArchive))
    ) {
      throw new UserFacingError(`An archive folder named "${folderName}" already exists`)
    }
  }

  const existing = await readLeagueMetaInput(fromPath)

  if (folderChanges) {
    await moveFolder(fromPath, toPath).catch((err) => {
      throw renameFailure(leagueFolder, err)
    })
    if (hasArchive) {
      try {
        await moveFolder(fromArchive, toArchive)
      } catch (err) {
        const failure = renameFailure(`_archives/${leagueFolder}`, err)
        const restored = await moveFolder(toPath, fromPath).then(
          () => true,
          () => false
        )
        throw new UserFacingError(
          restored
            ? failure.message
            : `Renamed the league folder to “${folderName}” but its archived seasons stayed under “${leagueFolder}”: ${failure.message}`
        )
      }
    }
  }

  const meta = healMeta(
    { name: displayName, seasons: existing?.seasons ?? [], extra: existing?.extra ?? {} },
    {
      folderName,
      day,
      liveSeasons: await liveSeasonsOf(toPath),
      archivedSeasons: await archivedSeasonsOf(toArchive)
    }
  )
  await writeLeagueMeta(toPath, meta).catch((err) => {
    throw new UserFacingError(
      `Renamed the folder but couldn’t update its meta.json: ${toUserFacing(err).message}`
    )
  })
  return toPath
}

async function liveSeasonsOf(leaguePath: string): Promise<SeasonName[]> {
  const entries = await readdir(leaguePath, { withFileTypes: true })
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => parseSeasonName(e.name))
    .filter((s): s is SeasonName => s !== null)
    .sort(compareSeasonNames)
}

async function assertArchiveSlotFree(path: string): Promise<void> {
  const occupied = await lstat(path).then(
    () => true,
    (err) => {
      if (errorCode(err) === 'ENOENT') return false
      throw toUserFacing(err)
    }
  )
  if (occupied) {
    throw new UserFacingError(
      `An archive folder for “${basename(path)}” already exists in “${basename(dirname(path))}”`
    )
  }
}

async function moveDir(from: string, to: string): Promise<void> {
  await assertArchiveSlotFree(to)
  await mkdir(dirname(to), { recursive: true })
  try {
    await rename(from, to)
  } catch (err) {
    if (errorCode(err) !== 'EXDEV') throw toUserFacing(err)
    await cp(from, to, { recursive: true, force: false, errorOnExist: true })
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
  if (await exists(seasonPath)) {
    throw new UserFacingError(`Season "${season.name}" already exists`)
  }
  await assertMetaWritable(leaguePath)

  const before = await liveSeasonsOf(leaguePath)
  const archivePath = await resolveArchivePath(opts.root, opts.leagueFolder)
  const after = [...before, season].sort(compareSeasonNames)
  const oldest = opts.archiveOldest && after.length > 2 ? after[0] : null
  if (oldest) await assertArchiveSlotFree(join(archivePath, oldest.name))

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
  if (oldest) {
    await moveDir(join(leaguePath, oldest.name), join(archivePath, oldest.name))
    archived = oldest.name
  }

  const meta = healMeta(await readLeagueMetaInput(leaguePath), {
    folderName: opts.leagueFolder,
    day: opts.day,
    liveSeasons: await liveSeasonsOf(leaguePath),
    archivedSeasons: await archivedSeasonsOf(archivePath)
  })
  const created = meta.seasons.find((s) => s.name === season.name)
  if (created && !created.createdAt) created.createdAt = new Date().toISOString()
  await writeLeagueMeta(leaguePath, meta)

  return { seasonPath, archived }
}

export interface SyncSeasonOptions extends SeasonSyncRequest {
  root: string
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
): Promise<ZipArchiveResult> {
  assertLeagueFolderName(leagueFolder)
  const seasons = seasonNames.map((name) => {
    const season = parseSeasonName(name)
    if (!season || season.name !== name) throw new UserFacingError('Invalid season name')
    return season
  })
  if (seasons.length === 0) return { zips: [], failed: [] }
  const archiveDir = await resolveArchivePath(root, leagueFolder)
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
  const failed: ZipArchiveResult['failed'] = []
  let firstError: Error | undefined

  for (const { season, seasonDir, zipPath } of plans) {
    try {
      await new Promise<void>((resolvePromise, reject) => {
        const output = createWriteStream(zipPath)
        const zip = new ZipArchive({ zlib: { level: 9 } })
        let archiveFailed = false
        let outputClosed = false
        output.on('close', () => {
          outputClosed = true
          if (!archiveFailed) resolvePromise()
        })
        const fail = (err: Error): void => {
          if (archiveFailed) return
          archiveFailed = true
          zip.destroy()
          const cleanup = (): void => {
            // A failed archive is never useful; ignore cleanup failure so the initiating error stays actionable.
            void rm(zipPath, { force: true }).then(
              () => reject(err),
              () => reject(err)
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
        zip.on('warning', (err: Error) => {
          fail(
            new UserFacingError(`“${season.name}” couldn’t be zipped completely: ${err.message}`)
          )
        })
        zip.pipe(output)
        zip.directory(seasonDir, season.name)
        // Archiver reports through both the emitter and its promise; handling both prevents a rejected finalize leak.
        void zip.finalize().catch(fail)
      })
      zips.push(zipPath)
    } catch (err) {
      const error = toUserFacing(err)
      firstError ??= err instanceof Error ? err : error
      failed.push({ season: season.name, message: error.message })
    }
  }

  if (zips.length === 0 && firstError) throw toUserFacing(firstError)
  return { zips, failed }
}

/** Copy files into a folder, never overwriting — clashes get " (2)", " (3)", … */
export async function importFiles(dest: string, sources: string[]): Promise<ImportFilesResult> {
  const copied: string[] = []
  const failed: ImportFilesResult['failed'] = []
  let firstError: Error | undefined
  for (const source of sources) {
    try {
      const ext = extname(source)
      const stem = basename(source, ext)
      let suffix = 1
      while (true) {
        const name = suffix === 1 ? `${stem}${ext}` : `${stem} (${suffix})${ext}`
        const target = join(dest, name)
        // Anything already at the name is taken, a dangling link included: Windows would copy
        // through such a link rather than refuse it, where POSIX refuses under the exclusive flag.
        const occupied = await lstat(target).then(
          () => true,
          (err) => {
            if (isMissing(err)) return false
            throw err
          }
        )
        if (occupied) {
          suffix += 1
          continue
        }
        try {
          // The exclusive flag still closes the exists/copy race between the check and the copy.
          await copyFile(source, target, constants.COPYFILE_EXCL)
          copied.push(target)
          break
        } catch (err) {
          if (!isAlreadyExists(err)) throw err
          suffix += 1
        }
      }
    } catch (err) {
      const error = toUserFacing(err)
      firstError ??= err instanceof Error ? err : error
      failed.push({ source, message: error.message })
    }
  }
  if (copied.length === 0 && firstError) throw toUserFacing(firstError)
  return { copied, failed }
}
