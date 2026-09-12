import { lstat, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseSeasonName } from '../../shared/season'
import { isWeekday, type Weekday } from '../../shared/weekday'
import { isMissing, toUserFacing, UserFacingError } from './fs-errors'

function relativeInside(root: string, target: string): string | null {
  const rel = relative(resolve(root), resolve(target))
  if (rel === '' || isAbsolute(rel)) return null
  if (rel === '..' || rel.startsWith(`..${sep}`)) return null
  return rel
}

/** True when `target` is strictly below `root` (the root itself does not count). */
export function isInsideRoot(root: string, target: string): boolean {
  return relativeInside(root, target) !== null
}

/**
 * Resolve `target` and confirm it lives inside `root`, comparing real paths so
 * a symlink planted inside the root cannot point the app at something outside
 * it. Returns the resolved (not real) path for use with fs / shell APIs.
 */
interface ContainmentOptions {
  allowMissingLeaf?: boolean
  allowRoot?: boolean
}

async function resolveExistingPrefix(target: string): Promise<string> {
  try {
    return await realpath(target)
  } catch (err) {
    if (!isMissing(err)) throw err
    const leaf = await lstat(target).catch((leafError) => {
      if (isMissing(leafError)) return null
      throw leafError
    })
    // ENOENT can describe a dangling link, not just a new output; following it
    // later during a write would bypass an otherwise safe parent check.
    if (leaf?.isSymbolicLink()) {
      throw new UserFacingError('An output path can’t be a symbolic link')
    }
    const parent = dirname(target)
    if (parent === target) throw err
    return join(await resolveExistingPrefix(parent), basename(target))
  }
}

export async function assertInsideRoot(
  root: string,
  target: string,
  options: ContainmentOptions = {}
): Promise<string> {
  const resolved = resolve(target)
  const realRoot = await realpath(root)
  if (options.allowMissingLeaf) {
    const leaf = await lstat(resolved).catch((err) => {
      if (isMissing(err)) return null
      throw err
    })
    // Even an in-root link could redirect a zip write onto an unrelated user document.
    if (leaf?.isSymbolicLink()) throw new UserFacingError('An output path can’t be a symbolic link')
  }
  // Resolve the existing prefix rather than creating parents just to validate a future output.
  const realTarget = options.allowMissingLeaf
    ? await resolveExistingPrefix(resolved)
    : await realpath(resolved)
  const isRoot = realTarget === realRoot
  if ((!options.allowRoot || !isRoot) && !isInsideRoot(realRoot, realTarget)) {
    throw new UserFacingError('Path is outside the leagues folder')
  }
  return resolved
}

/** Reject an in-root alias whose real location no longer matches the requested layout. */
export async function assertRealLayout(
  root: string,
  target: string,
  expectedRelative: string
): Promise<string> {
  const resolved = resolve(target)
  const realRoot = await realpath(root)
  const realExistingPrefix = await resolveExistingPrefix(resolved)
  if (!isInsideRoot(realRoot, realExistingPrefix)) {
    throw new UserFacingError('Path is outside the leagues folder')
  }
  // Containment permits aliases within the root; writes must still land in the location named by the UI.
  if (relative(realRoot, realExistingPrefix) !== expectedRelative) {
    throw new UserFacingError('Path does not match the selected leagues location')
  }
  return resolved
}

/** Validate a not-yet-created season through whichever parent already exists. */
export async function resolveNewLiveSeasonRoot(
  root: string,
  day: Weekday,
  leagueFolder: string,
  seasonName: string
): Promise<string> {
  assertLeagueFolderName(leagueFolder)
  const target = resolve(root, day, leagueFolder, seasonName)
  try {
    const expected = join(day, leagueFolder, seasonName)
    return await assertRealLayout(root, target, expected)
  } catch (err) {
    throw toUserFacing(err)
  }
}

/** Validate an import destination by both its requested and real on-disk layout. */
export async function resolveImportDestination(root: string, destination: string): Promise<string> {
  const resolvedRoot = resolve(root)
  const resolved = resolve(destination)
  const requested = relative(resolvedRoot, resolved)
  if (
    !requested ||
    isAbsolute(requested) ||
    requested === '..' ||
    requested.startsWith(`..${sep}`)
  ) {
    throw new UserFacingError('Invalid import destination')
  }

  const parts = requested.split(sep)
  const first = parts[0]
  const isManaged = first === '_shared' || first === '_templates'
  const season = parts.length >= 3 ? parseSeasonName(parts[2]) : null
  const isLive =
    isWeekday(first) && (parts.length === 2 || (parts.length >= 3 && season?.name === parts[2]))
  const isOtherRootItem = parts.length === 1 && first !== '_archives' && !isWeekday(first)
  // Archives and incomplete weekday paths are browseable, but imports must target a user-managed pane.
  if (!isManaged && !isLive && !isOtherRootItem) {
    throw new UserFacingError('Invalid import destination')
  }
  return assertRealLayout(root, resolved, requested)
}

/** Reject path syntax where an exact league folder name is required. */
export function assertLeagueFolderName(name: string): void {
  if (!name || name === '.' || name === '..' || basename(name) !== name) {
    throw new UserFacingError('Invalid league folder')
  }
}

/** Resolve an exact `weekday/league/season` target and reject symlink aliases. */
export async function resolveLiveSeasonRoot(
  root: string,
  day: string,
  leagueFolder: string,
  seasonName: string
): Promise<string> {
  if (!isWeekday(day)) throw new UserFacingError('Invalid league day')
  assertLeagueFolderName(leagueFolder)
  const season = parseSeasonName(seasonName)
  if (!season || season.name !== seasonName) throw new UserFacingError('Invalid season name')

  const target = resolve(root, day, leagueFolder, season.name)
  let resolved: [string, string, Awaited<ReturnType<typeof stat>>]
  try {
    resolved = await Promise.all([realpath(root), realpath(target), stat(target)])
  } catch (err) {
    throw toUserFacing(err)
  }
  const [realRoot, realTarget, info] = resolved
  const rel = relative(realRoot, realTarget)
  const parts = rel.split(sep)
  if (
    parts.length !== 3 ||
    parts[0] !== day ||
    parts[1] !== leagueFolder ||
    parts[2] !== season.name ||
    !info.isDirectory()
  ) {
    throw new UserFacingError('Only a live season folder can be synced with templates')
  }
  return target
}

export type TrashTarget = 'league' | 'season'

/**
 * Classifies by path shape only: `day/League` is a league, `day/League/2025-26`
 * a season. Callers must still confirm the target is a directory.
 */
export function classifyTrashTarget(root: string, target: string): TrashTarget | null {
  const rel = relativeInside(root, target)
  if (rel === null) return null
  const segments = rel.split(sep)
  if (!isWeekday(segments[0])) return null
  if (segments.length === 2) return 'league'
  if (segments.length === 3 && parseSeasonName(segments[2])) return 'season'
  return null
}

export interface TrashPlan {
  kind: TrashTarget
  /** Ordered so that if any step fails, nothing the user can see has changed yet. */
  paths: string[]
}

/** Validate a delete request and list what must go to the trash, dependents first. */
export async function planTrash(root: string, target: string): Promise<TrashPlan> {
  let resolved: string
  try {
    resolved = await assertInsideRoot(root, target)
  } catch (err) {
    throw toUserFacing(err)
  }
  const kind = classifyTrashTarget(root, resolved)
  if (!kind || !(await stat(resolved)).isDirectory()) {
    throw new UserFacingError('Only league and season folders can be deleted')
  }
  const paths = [resolved]
  if (kind === 'league') {
    // Archived seasons live beside the league under _archives; leaving them
    // behind would orphan them.
    const archive = join(root, '_archives', basename(resolved))
    const present = await stat(archive).then(
      () => true,
      (err) => {
        if (isMissing(err)) return false
        throw err
      }
    )
    if (present) paths.unshift(archive)
  }
  return { kind, paths }
}
