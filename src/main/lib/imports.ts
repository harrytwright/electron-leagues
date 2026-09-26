import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  applyMbdSync,
  applyRosterImport,
  columnChoices,
  isImportFileName,
  isWorkbookFileName,
  mappingFitsColumns,
  mappingProblem,
  parseDelimited,
  planMbdSync,
  planRosterImport,
  readImportRows,
  suggestMapping,
  type DelimitedTable,
  type ImportMapping,
  type ImportSummary,
  type MappingPreview,
  type RosterPlan,
  type SyncDecision,
  type SyncPlan,
  type SyncSummary
} from '../../shared/imports'
import { newTeamId, type FileRevision } from '../../shared/members'
import type { SeasonSyncRequest } from '../../shared/season-create'
import { toUserFacing, UserFacingError } from './fs-errors'
import {
  fileRevision,
  membersFilePath,
  readMasterForWrite,
  readSeasonFile,
  seasonFilePath,
  STALE_MESSAGE,
  writeMaster,
  writeSeasonFile
} from './members'
import { assertAbsolutePath, resolveLiveSeasonRoot } from './paths'
import { withRootLock } from './root-lock'
import { readXlsxTable } from './xlsx'

const MAX_IMPORT_BYTES = 20 * 1024 * 1024
const SAMPLE_ROWS = 5

/** Exports are UTF-8 unless they are not, in which case they are Windows text. */
function decodeExport(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** Read a picked or dropped export from wherever it is; nothing is copied into the location. */
export async function readImportTable(path: string): Promise<DelimitedTable> {
  assertAbsolutePath(path, 'Invalid export path')
  if (!isImportFileName(basename(path))) {
    throw new UserFacingError('Exports are read from .xlsx, .csv, .tsv or .txt files')
  }
  let bytes: Buffer
  try {
    const info = await stat(path)
    if (!info.isFile()) throw new UserFacingError(`“${basename(path)}” is not a file`)
    if (info.size > MAX_IMPORT_BYTES) {
      throw new UserFacingError(`“${basename(path)}” is too large to be a bowler export`)
    }
    bytes = await readFile(path)
  } catch (err) {
    if (err instanceof UserFacingError) throw err
    throw toUserFacing(err)
  }
  const table = isWorkbookFileName(basename(path))
    ? readXlsxTable(bytes)
    : parseDelimited(decodeExport(bytes))
  if (table.columns.length === 0) throw new UserFacingError(`“${basename(path)}” has no header row`)
  return table
}

/** A mapping remembered for one location and one header layout. */
export interface MappingMemory {
  root: string
  signature: string
  mapping: ImportMapping
}

const MAPPING_MEMORY_LIMIT = 50

export function mappingSignature(columns: readonly string[]): string {
  return columns.join('|')
}

export function rememberedMapping(
  memories: readonly MappingMemory[],
  root: string,
  signature: string
): ImportMapping | null {
  const memory = memories.find((entry) => entry.root === root && entry.signature === signature)
  return memory ? memory.mapping : null
}

/** Most recent first; a location's mapping for a header layout replaces its earlier one. */
export function rememberMapping(
  memories: readonly MappingMemory[],
  memory: MappingMemory
): MappingMemory[] {
  const others = memories.filter(
    (entry) => entry.root !== memory.root || entry.signature !== memory.signature
  )
  return [memory, ...others].slice(0, MAPPING_MEMORY_LIMIT)
}

export async function previewImport(
  root: string,
  path: string,
  memories: readonly MappingMemory[]
): Promise<MappingPreview> {
  const table = await readImportTable(path)
  const remembered = rememberedMapping(memories, root, mappingSignature(table.columns))
  const usable = remembered !== null && mappingFitsColumns(remembered, table.columns.length)
  return {
    path,
    fileName: basename(path),
    columns: table.columns,
    sample: table.rows.slice(0, SAMPLE_ROWS),
    rowCount: table.rows.length,
    choices: table.columns.map((_, index) => columnChoices(table, index)),
    mapping: usable ? remembered : suggestMapping(table.columns),
    remembered: usable
  }
}

function checkedMapping(mapping: ImportMapping, table: DelimitedTable): ImportMapping {
  const problem = mappingProblem(mapping)
  if (problem) throw new UserFacingError(problem)
  if (!mappingFitsColumns(mapping, table.columns.length)) {
    throw new UserFacingError('The mapping names a column this file does not have')
  }
  return mapping
}

export interface SyncPlanResult {
  plan: SyncPlan
  revision: FileRevision
  /** The export as planned; decisions name its lines, so a changed file is refused. */
  sourceRevision: FileRevision
  /** Identifies the header layout so the mapping can be remembered for it. */
  signature: string
}

/** What a sync would do, read from the master list as it is now. */
export async function planSync(
  root: string,
  path: string,
  mapping: ImportMapping
): Promise<SyncPlanResult> {
  const sourceRevision = await fileRevision(path)
  const table = await readImportTable(path)
  const rows = readImportRows(table, checkedMapping(mapping, table))
  const revision = await fileRevision(membersFilePath(root))
  const master = await readMasterForWrite(root, revision)
  return {
    plan: planMbdSync(master.members, rows),
    revision,
    sourceRevision,
    signature: mappingSignature(table.columns)
  }
}

const SOURCE_CHANGED_MESSAGE =
  'The export changed since it was read, so nothing was saved. Start again from the file.'

async function readPlannedTable(path: string, expected: FileRevision): Promise<DelimitedTable> {
  if ((await fileRevision(path)) !== expected) throw new UserFacingError(SOURCE_CHANGED_MESSAGE)
  return readImportTable(path)
}

export interface SyncRequest {
  path: string
  mapping: ImportMapping
  decisions: readonly SyncDecision[]
  revision: FileRevision
  sourceRevision: FileRevision
}

/** Re-plan under the lock against the same master list the decisions were made on, then write. */
export async function syncMbd(root: string, request: SyncRequest): Promise<SyncSummary> {
  const table = await readPlannedTable(request.path, request.sourceRevision)
  const rows = readImportRows(table, checkedMapping(request.mapping, table))
  const { decisions } = request
  return withRootLock(root, async () => {
    const master = await readMasterForWrite(root, request.revision)
    const plan = planMbdSync(master.members, rows)
    const { file, summary } = applyMbdSync(master, plan, decisions)
    await writeMaster(root, file)
    return summary
  })
}

export interface RosterPlanResult {
  plan: RosterPlan
  membersRevision: FileRevision
  seasonRevision: FileRevision
  sourceRevision: FileRevision
  signature: string
}

interface SeasonForImport {
  seasonPath: string
  revision: FileRevision
}

async function seasonForImport(root: string, ref: SeasonSyncRequest): Promise<SeasonForImport> {
  const seasonPath = await resolveLiveSeasonRoot(root, ref.day, ref.leagueFolder, ref.seasonName)
  return { seasonPath, revision: await fileRevision(seasonFilePath(seasonPath)) }
}

export async function planPlayersImport(
  root: string,
  ref: SeasonSyncRequest,
  path: string,
  mapping: ImportMapping,
  league: string | null
): Promise<RosterPlanResult> {
  const sourceRevision = await fileRevision(path)
  const table = await readImportTable(path)
  const rows = readImportRows(table, checkedMapping(mapping, table), { league })
  const { seasonPath, revision: seasonRevision } = await seasonForImport(root, ref)
  const season = await readSeasonFile(seasonPath)
  if (season.status === 'missing') {
    throw new UserFacingError('This season has no roster file; older seasons are not backfilled')
  }
  if (season.status === 'invalid') throw new UserFacingError(season.message)
  const membersRevision = await fileRevision(membersFilePath(root))
  const master = await readMasterForWrite(root, membersRevision)
  return {
    plan: planRosterImport(master.members, season.value, rows),
    membersRevision,
    seasonRevision,
    sourceRevision,
    signature: mappingSignature(table.columns)
  }
}

export interface PlayersImportRequest {
  ref: SeasonSyncRequest
  path: string
  mapping: ImportMapping
  /** The league to take from a dump of several, or null for every row. */
  league: string | null
  /** Lines of unknown MBD IDs the desk chose to create members for. */
  createLines: readonly number[]
  membersRevision: FileRevision
  seasonRevision: FileRevision
  sourceRevision: FileRevision
}

/** Members are written before the roster, so a failed roster write leaves nothing dangling. */
export async function addPlayersFromExport(
  root: string,
  request: PlayersImportRequest
): Promise<ImportSummary> {
  const table = await readPlannedTable(request.path, request.sourceRevision)
  const rows = readImportRows(table, checkedMapping(request.mapping, table), {
    league: request.league
  })
  return withRootLock(root, async () => {
    const master = await readMasterForWrite(root, request.membersRevision)
    const { seasonPath, revision } = await seasonForImport(root, request.ref)
    if (revision !== request.seasonRevision) throw new UserFacingError(STALE_MESSAGE)
    const season = await readSeasonFile(seasonPath)
    if (season.status === 'missing') {
      throw new UserFacingError('This season has no roster file; older seasons are not backfilled')
    }
    if (season.status === 'invalid') throw new UserFacingError(season.message)
    const plan = planRosterImport(master.members, season.value, rows)
    const result = applyRosterImport(master, season.value, plan, request.createLines, () =>
      newTeamId(() => randomUUID().replaceAll('-', '').slice(0, 12))
    )
    if (result.summary.created > 0 || result.summary.restored > 0) {
      await writeMaster(root, result.membersFile)
    }
    if (result.summary.added > 0) await writeSeasonFile(seasonPath, result.season)
    return result.summary
  })
}
