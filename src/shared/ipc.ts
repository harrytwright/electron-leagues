import { z } from 'zod'
import type { DirEntry, LeaguesTree } from './tree'
import {
  leagueFolderSchema,
  seasonCreateRequestSchema,
  seasonNameSchema,
  seasonSyncRequestSchema,
  weekdaySchema,
  type SeasonCreateRequest,
  type SeasonSyncRequest
} from './season-create'

const pathSchema = z.string().min(1)

export interface ZipArchiveResult {
  zips: string[]
  failed: { season: string; message: string }[]
}

export interface ImportFilesResult {
  copied: string[]
  failed: { source: string; message: string }[]
}

export interface InvokeOutputs {
  getAnalyticsConfig: { apiKey: string | null; distinctId: string }
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
  createSeason: { seasonPath: string; archived: string | null }
  syncSeasonTemplates: { added: string[]; skipped: string[] }
  zipArchive: ZipArchiveResult
  openFile: void
  revealFile: void
  pickFiles: string[]
  importFiles: ImportFilesResult
}

interface InvokeDefinition {
  channel: string
  args: z.ZodTuple
  failureMessage: string
}

export const invokeDefinitions = {
  getAnalyticsConfig: {
    channel: 'analytics:config',
    args: z.tuple([]),
    failureMessage: 'Invalid analytics request'
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
