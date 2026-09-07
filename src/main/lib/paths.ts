import { realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseSeasonName } from '../../shared/season'
import { isWeekday } from '../../shared/weekday'
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
export async function assertInsideRoot(root: string, target: string): Promise<string> {
  const resolved = resolve(target)
  const realRoot = await realpath(root)
  const realTarget = await realpath(resolved)
  if (!isInsideRoot(realRoot, realTarget)) {
    throw new UserFacingError('Path is outside the leagues folder')
  }
  return resolved
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
