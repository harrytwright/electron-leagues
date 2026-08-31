import type { LeagueMeta } from './meta'
import type { Weekday } from './weekday'

export interface FileEntry {
  name: string
  path: string
  kind: 'file' | 'folder'
}

export interface SeasonNode {
  name: string
  status: 'active' | 'previous' | 'live'
  path: string
  files: FileEntry[]
}

export interface LeagueNode {
  folderName: string
  path: string
  day: Weekday
  meta: LeagueMeta
  running: boolean
  seasons: SeasonNode[]
  otherEntries: FileEntry[]
  archivedSeasons: string[]
  archivePath: string
}

export interface LeaguesTree {
  root: string
  days: Record<Weekday, LeagueNode[]>
  hasTemplates: boolean
  hasShared: boolean
  templateFiles: FileEntry[]
  sharedFiles: FileEntry[]
  unrecognisedRootEntries: FileEntry[]
}
