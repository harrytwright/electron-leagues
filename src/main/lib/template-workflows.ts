import { constants } from 'node:fs'
import { copyFile, lstat, readdir, realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { WorkflowId } from '../../shared/workflows'
import { isMissing, UserFacingError } from './fs-errors'

export type FileKind = 'file' | 'directory' | 'symlink' | 'other'

export interface FileMetadata {
  relativePath: string
  kind: FileKind
  size: number
  mtimeMs: number
}

export type CopySource = 'current' | 'templates'

export interface PlannedCopy {
  source: CopySource
  relativePath: string
}

export interface PlannedSkip {
  relativePath: string
  reason: 'hidden' | 'not-file' | 'already-present'
}

export interface RuleResult {
  copies: PlannedCopy[]
  skips: PlannedSkip[]
}

export type Rule = (
  current: readonly FileMetadata[],
  templates: readonly FileMetadata[]
) => Promise<RuleResult>

export type FileRuleId = 'fill-missing'

export interface CopyExecutionResult {
  added: string[]
  skipped: string[]
}

function kindOf(info: Awaited<ReturnType<typeof lstat>>): FileKind {
  if (info.isSymbolicLink()) return 'symlink'
  if (info.isFile()) return 'file'
  if (info.isDirectory()) return 'directory'
  return 'other'
}

/** Metadata for direct children only. Symlinks are described, never followed. */
export async function readDirectMetadata(dir: string): Promise<FileMetadata[]> {
  return readEntryMetadata(dir, await readdir(dir))
}

/** Resolve a directory snapshot; children can disappear before their metadata is read. */
export async function readEntryMetadata(
  dir: string,
  names: readonly string[]
): Promise<FileMetadata[]> {
  const entries = await Promise.all(
    names
      .filter((name) => !name.startsWith('.'))
      .map(async (name): Promise<FileMetadata | null> => {
        const info = await lstat(join(dir, name)).catch((err: NodeJS.ErrnoException) => {
          if (err.code === 'ENOENT') return null
          throw err
        })
        if (!info) return null
        return {
          relativePath: name,
          kind: kindOf(info),
          size: info.size,
          mtimeMs: info.mtimeMs
        }
      })
  )
  return entries.filter((entry): entry is FileMetadata => entry !== null)
}

interface UsableFiles {
  files: FileMetadata[]
  skips: PlannedSkip[]
}

function usableFiles(files: readonly FileMetadata[]): UsableFiles {
  const usable: FileMetadata[] = []
  const skips: PlannedSkip[] = []
  for (const file of files) {
    if (file.relativePath.startsWith('.')) {
      skips.push({ relativePath: file.relativePath, reason: 'hidden' })
    } else if (file.kind !== 'file') {
      skips.push({ relativePath: file.relativePath, reason: 'not-file' })
    } else {
      usable.push(file)
    }
  }
  return { files: usable, skips }
}

/** Fill a destination from ordered sources; the first source owns filename collisions. */
export function planFillMissing(
  sources: readonly { source: CopySource; files: readonly FileMetadata[] }[],
  existing: readonly FileMetadata[] = []
): RuleResult {
  const occupied = new Set(existing.map((file) => file.relativePath))
  const copies: PlannedCopy[] = []
  const skips: PlannedSkip[] = []
  for (const source of sources) {
    const usable = usableFiles(source.files)
    skips.push(...usable.skips)
    for (const file of usable.files) {
      if (occupied.has(file.relativePath)) {
        skips.push({ relativePath: file.relativePath, reason: 'already-present' })
        continue
      }
      occupied.add(file.relativePath)
      copies.push({ source: source.source, relativePath: file.relativePath })
    }
  }
  return { copies, skips }
}

/** Pure file rules: `current` is what the destination already contains. */
export const FILE_RULES: Record<FileRuleId, Rule> = {
  'fill-missing': async (current, templates) =>
    planFillMissing([{ source: 'templates', files: templates }], current)
}

/** Workflow handlers compose source selection with the reusable file rules. */
export const WORKFLOW_HANDLERS: Record<WorkflowId, Rule> = {
  templates: async (_previous, templates) => FILE_RULES['fill-missing']([], templates),
  previous: async (previous, templates) => {
    const copiedPrevious = planFillMissing([{ source: 'current', files: previous }])
    const copiedNames = new Set(copiedPrevious.copies.map((copy) => copy.relativePath))
    const destinationState = previous.filter((file) => copiedNames.has(file.relativePath))
    const filledTemplates = await FILE_RULES['fill-missing'](destinationState, templates)
    return {
      copies: [...copiedPrevious.copies, ...filledTemplates.copies],
      skips: [...copiedPrevious.skips, ...filledTemplates.skips]
    }
  },
  empty: async () => ({ copies: [], skips: [] })
}

function safeDirectName(relativePath: string): boolean {
  return (
    relativePath.length > 0 &&
    basename(relativePath) === relativePath &&
    !isAbsolute(relativePath) &&
    relativePath !== '.' &&
    relativePath !== '..' &&
    !relativePath.includes(sep)
  )
}

async function assertDirectRegularFile(base: string, relativePath: string): Promise<string> {
  if (!safeDirectName(relativePath)) throw new UserFacingError('Invalid workflow file path')
  const path = join(base, relativePath)
  const [realBase, realFile, info] = await Promise.all([
    realpath(base),
    realpath(path),
    lstat(path)
  ])
  const rel = relative(realBase, realFile)
  if (rel === '' || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) {
    throw new UserFacingError('A workflow source points outside its folder')
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new UserFacingError(`“${relativePath}” is no longer a regular file`)
  }
  return path
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- catch clauses provide unknown at this filesystem boundary
function isAlreadyExists(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  // SAFETY: Node filesystem failures are Error instances with an optional code.
  return (err as NodeJS.ErrnoException).code === 'EEXIST'
}

/** Apply a plan once. COPYFILE_EXCL makes stale metadata and copy races skip, never overwrite. */
export async function executeCopyPlan(
  result: RuleResult,
  directories: { current?: string; templates: string; destination: string }
): Promise<CopyExecutionResult> {
  const destinationInfo = await stat(directories.destination)
  if (!destinationInfo.isDirectory()) throw new UserFacingError('Copy destination is not a folder')
  const added: string[] = []
  const skipped = result.skips.map((item) => item.relativePath)

  for (const copy of result.copies) {
    const sourceBase = copy.source === 'templates' ? directories.templates : directories.current
    if (!sourceBase) throw new Error(`Workflow source “${copy.source}” is unavailable`)
    const source = await assertDirectRegularFile(sourceBase, copy.relativePath)
    const target = resolve(directories.destination, copy.relativePath)
    if (relative(resolve(directories.destination), target) !== copy.relativePath) {
      throw new UserFacingError('Invalid workflow destination path')
    }
    try {
      await copyFile(source, target, constants.COPYFILE_EXCL)
      added.push(copy.relativePath)
    } catch (err) {
      if (isAlreadyExists(err)) {
        const occupied = await lstat(target)
        if (!occupied.isFile() || occupied.isSymbolicLink()) {
          throw new UserFacingError(`“${copy.relativePath}” conflicts with a non-file item`)
        }
        skipped.push(copy.relativePath)
        continue
      }
      if (isMissing(err)) {
        throw new UserFacingError(`“${copy.relativePath}” changed before it could be copied`)
      }
      throw err
    }
  }
  return { added, skipped }
}

export async function runWorkflow(
  action: WorkflowId,
  directories: { current?: string; templates: string; destination: string }
): Promise<CopyExecutionResult> {
  const [current, templates] = await Promise.all([
    directories.current ? readDirectMetadata(directories.current) : Promise.resolve([]),
    action === 'empty' ? Promise.resolve([]) : readDirectMetadata(directories.templates)
  ])
  const result = await WORKFLOW_HANDLERS[action](current, templates)
  return executeCopyPlan(result, directories)
}

/** Add templates missing from an existing folder using the same fill-missing planner. */
export async function syncMissingTemplates(
  destination: string,
  templates: string
): Promise<CopyExecutionResult> {
  const [existing, available] = await Promise.all([
    readDirectMetadata(destination),
    readDirectMetadata(templates)
  ])
  const result = await FILE_RULES['fill-missing'](existing, available)
  return executeCopyPlan(result, { templates, destination })
}
