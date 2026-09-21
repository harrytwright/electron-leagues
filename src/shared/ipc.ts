import { z } from 'zod'
import { helpTargetSchema } from './help'
import type { DirEntry, LeaguesTree } from './tree'
import type { AppUpdateStatus } from './app-update'
import {
  importMappingSchema,
  syncDecisionSchema,
  type ImportSummary,
  type MappingPreview,
  type RosterPlan,
  type SyncPlan,
  type SyncSummary
} from './imports'
import { memberInputSchema, seasonFileSchema, type Member, type MembersSnapshot } from './members'
import {
  leagueFolderSchema,
  seasonCreateRequestSchema,
  seasonNameSchema,
  seasonRosterRequestSchema,
  seasonSyncRequestSchema,
  weekdaySchema,
  type SeasonCreateRequest,
  type SeasonSyncRequest
} from './season-create'

const pathSchema = z.string().min(1)
const revisionSchema = z.string()
const memberIdSchema = z.number().int().positive()

export interface ZipArchiveResult {
  zips: string[]
  failed: { season: string; message: string }[]
}

export interface ImportFilesResult {
  copied: string[]
  failed: { source: string; message: string }[]
}

export interface SeasonSaveResult {
  /** The sheet is remade after every save; a failure is retried the next time it is opened. */
  signInSheet: 'updated' | 'failed'
}

export interface SyncPlanOutput {
  plan: SyncPlan
  /** The master list revision the plan was made from; the sync names it again. */
  revision: string
  /** The export's own revision; its lines are what the decisions refer to. */
  sourceRevision: string
}

export interface RosterPlanOutput {
  plan: RosterPlan
  membersRevision: string
  seasonRevision: string
  sourceRevision: string
}

export interface InvokeOutputs {
  getAppUpdateStatus: AppUpdateStatus
  getAnalyticsConfig: { apiKey: string | null; distinctId: string }
  openPermissionSettings: void
  getRoot: string | null
  chooseRoot: string | null
  forgetRoot: void
  repairLocation: { repaired: string[]; warnings: string[] }
  setRoot: string | null
  recentRoots: string[]
  scan: LeaguesTree | null
  listDir: DirEntry[]
  trashFolder: void
  createLeague: string
  renameLeague: string
  createSeason: { seasonPath: string; archived: string | null }
  syncSeasonTemplates: { added: string[]; skipped: string[] }
  zipArchive: ZipArchiveResult
  openFile: void
  revealFile: void
  pickFiles: string[]
  importFiles: ImportFilesResult
  openHelp: void
  enableMembers: void
  membersSnapshot: MembersSnapshot | null
  saveMember: Member
  mergeMembers: void
  deleteMember: 'hard' | 'soft'
  /** Development only: empties every roster and the master list so a sync can be rerun. */
  resetMembers: void
  renumberDuplicates: number[]
  saveSeason: SeasonSaveResult
  /** Gives a season made before the database was on a roster file of its own. */
  createSeasonRoster: void
  openSignInSheet: string
  pickImportFile: string | null
  previewImport: MappingPreview
  planMbdSync: SyncPlanOutput
  syncMbd: SyncSummary
  planPlayersImport: RosterPlanOutput
  addPlayersFromExport: ImportSummary
  /** The card sheet's path, opened for printing. */
  printCards: string
  /** Where the file was saved and how many rows it holds, or null when the dialog was cancelled. */
  exportMembersCsv: { path: string; count: number } | null
}

interface InvokeDefinition {
  channel: string
  args: z.ZodTuple
  failureMessage: string
}

export const invokeDefinitions = {
  getAppUpdateStatus: {
    channel: 'app:update-status',
    args: z.tuple([]),
    failureMessage: 'Invalid app update request'
  },
  getAnalyticsConfig: {
    channel: 'analytics:config',
    args: z.tuple([]),
    failureMessage: 'Invalid analytics request'
  },
  openPermissionSettings: {
    channel: 'permissions:open-settings',
    args: z.tuple([]),
    failureMessage: 'Invalid permission settings request'
  },
  getRoot: {
    channel: 'root:get',
    args: z.tuple([]),
    failureMessage: 'Invalid location request'
  },
  chooseRoot: {
    channel: 'root:choose',
    args: z.tuple([z.enum(['select', 'init'], { error: 'Invalid location request' })]),
    failureMessage: 'Invalid location request'
  },
  forgetRoot: {
    channel: 'root:forget',
    args: z.tuple([]),
    failureMessage: 'Invalid location request'
  },
  repairLocation: {
    channel: 'root:repair',
    args: z.tuple([]),
    failureMessage: 'Invalid location repair request'
  },
  /** Switch to a known location; null when it can't be used (missing or unreadable). */
  setRoot: {
    channel: 'root:set',
    args: z.tuple([pathSchema]),
    failureMessage: 'Invalid location request'
  },
  recentRoots: {
    channel: 'root:recents',
    args: z.tuple([]),
    failureMessage: 'Invalid recent locations request'
  },
  scan: {
    channel: 'leagues:scan',
    args: z.tuple([]),
    failureMessage: 'Invalid leagues scan request'
  },
  listDir: {
    channel: 'dir:list',
    args: z.tuple([pathSchema]),
    failureMessage: 'Invalid file path'
  },
  /** Move a league or season folder (and a league's archives) to the OS trash. */
  trashFolder: {
    channel: 'folder:trash',
    args: z.tuple([pathSchema]),
    failureMessage: 'Invalid file path'
  },
  createLeague: {
    channel: 'league:create',
    args: z.tuple([weekdaySchema, z.string()]),
    failureMessage: 'Invalid league request'
  },
  /** Rename a league's display name and, when its sanitised folder name changes, its folders. */
  renameLeague: {
    channel: 'league:rename',
    args: z.tuple([weekdaySchema, leagueFolderSchema, z.string()]),
    failureMessage: 'Invalid league rename request'
  },
  createSeason: {
    channel: 'season:create',
    args: z.tuple([seasonCreateRequestSchema]),
    failureMessage: 'Invalid season request'
  },
  syncSeasonTemplates: {
    channel: 'season:sync-templates',
    args: z.tuple([seasonSyncRequestSchema]),
    failureMessage: 'Invalid season sync request'
  },
  zipArchive: {
    channel: 'archive:zip',
    args: z.tuple([leagueFolderSchema, z.array(seasonNameSchema)]),
    failureMessage: 'Invalid archive request'
  },
  openFile: {
    channel: 'file:open',
    args: z.tuple([pathSchema]),
    failureMessage: 'Invalid file path'
  },
  revealFile: {
    channel: 'file:reveal',
    args: z.tuple([pathSchema]),
    failureMessage: 'Invalid file path'
  },
  pickFiles: {
    channel: 'files:pick',
    args: z.tuple([]),
    failureMessage: 'Invalid file picker request'
  },
  importFiles: {
    channel: 'file:import',
    args: z.tuple([pathSchema, z.array(pathSchema)]),
    failureMessage: 'Invalid file import request'
  },
  /** Open or focus the help window, optionally at a topic and heading. */
  openHelp: {
    channel: 'help:open',
    args: z.tuple([helpTargetSchema.nullable()]),
    failureMessage: 'Invalid help request'
  },
  /** Creates the master list, which switches the feature on for the location. */
  enableMembers: {
    channel: 'members:enable',
    args: z.tuple([]),
    failureMessage: 'Invalid members request'
  },
  membersSnapshot: {
    channel: 'members:snapshot',
    args: z.tuple([]),
    failureMessage: 'Invalid members request'
  },
  /** Every members write names the file revision it started from; a stale one is refused. */
  saveMember: {
    channel: 'members:save',
    args: z.tuple([memberInputSchema, revisionSchema]),
    failureMessage: 'Invalid member details'
  },
  mergeMembers: {
    channel: 'members:merge',
    args: z.tuple([memberIdSchema, memberIdSchema, revisionSchema]),
    failureMessage: 'Invalid merge request'
  },
  deleteMember: {
    channel: 'members:delete',
    args: z.tuple([memberIdSchema, revisionSchema]),
    failureMessage: 'Invalid delete request'
  },
  resetMembers: {
    channel: 'members:reset',
    args: z.tuple([revisionSchema]),
    failureMessage: 'Invalid reset request'
  },
  renumberDuplicates: {
    channel: 'members:renumber',
    args: z.tuple([memberIdSchema, z.number().int().nonnegative(), revisionSchema]),
    failureMessage: 'Invalid renumber request'
  },
  createSeasonRoster: {
    channel: 'season:create-roster',
    args: z.tuple([seasonSyncRequestSchema, seasonRosterRequestSchema]),
    failureMessage: 'Invalid roster request'
  },
  saveSeason: {
    channel: 'season:save',
    args: z.tuple([seasonSyncRequestSchema, seasonFileSchema, revisionSchema]),
    failureMessage: 'Invalid season file'
  },
  /** Makes the season's sheet when missing or older than its roster, then opens it. */
  openSignInSheet: {
    channel: 'season:sign-in-sheet',
    args: z.tuple([seasonSyncRequestSchema]),
    failureMessage: 'Invalid sign-in sheet request'
  },
  /** The native picker limited to delimited text, for a bowler export. */
  pickImportFile: {
    channel: 'import:pick',
    args: z.tuple([]),
    failureMessage: 'Invalid file picker request'
  },
  /** Columns and a sample from an export, with a remembered or guessed mapping. */
  previewImport: {
    channel: 'import:preview',
    args: z.tuple([pathSchema]),
    failureMessage: 'Invalid export path'
  },
  planMbdSync: {
    channel: 'members:plan-sync',
    args: z.tuple([pathSchema, importMappingSchema]),
    failureMessage: 'Invalid sync request'
  },
  syncMbd: {
    channel: 'members:sync-mbd',
    args: z.tuple([
      pathSchema,
      importMappingSchema,
      z.array(syncDecisionSchema),
      revisionSchema,
      revisionSchema
    ]),
    failureMessage: 'Invalid sync request'
  },
  /** The league name picks one league out of a dump that covers several; null takes every row. */
  planPlayersImport: {
    channel: 'season:plan-import',
    args: z.tuple([
      seasonSyncRequestSchema,
      pathSchema,
      importMappingSchema,
      z.string().nullable()
    ]),
    failureMessage: 'Invalid player import request'
  },
  addPlayersFromExport: {
    channel: 'season:import-players',
    args: z.tuple([
      seasonSyncRequestSchema,
      pathSchema,
      importMappingSchema,
      z.string().nullable(),
      z.array(z.number().int().positive()),
      revisionSchema,
      revisionSchema,
      revisionSchema
    ]),
    failureMessage: 'Invalid player import request'
  },
  printCards: {
    channel: 'members:print-cards',
    args: z.tuple([z.array(memberIdSchema).min(1), revisionSchema]),
    failureMessage: 'Invalid card request'
  },
  /** The given members in the given order; the renderer owns the filter and sort. */
  exportMembersCsv: {
    channel: 'members:export-csv',
    args: z.tuple([z.array(memberIdSchema), z.object({ marketingOnly: z.boolean() })]),
    failureMessage: 'Invalid export request'
  }
} as const satisfies Record<keyof InvokeOutputs, InvokeDefinition>

export type InvokeName = keyof typeof invokeDefinitions

/**
 * Domain checks (refinements and enums) carry their own messages; anything else is a
 * shape failure and reports the channel's message.
 */
export function invokeFailureMessage(name: InvokeName, issues: z.core.$ZodIssue[]): string {
  const issue = issues[0]
  const isDomainIssue = issue?.code === 'custom' || issue?.code === 'invalid_value'
  return issue && isDomainIssue ? issue.message : invokeDefinitions[name].failureMessage
}

export type InvokeArguments<Name extends InvokeName> = z.infer<
  (typeof invokeDefinitions)[Name]['args']
>
export type InvokeApi = {
  [Name in InvokeName]: (...args: InvokeArguments<Name>) => Promise<InvokeOutputs[Name]>
}

export type { SeasonCreateRequest, SeasonSyncRequest }
