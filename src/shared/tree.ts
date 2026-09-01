import type { LeagueMeta } from './meta'
import type { Weekday } from './weekday'

export interface FileEntry {
  name: string
  path: string
  kind: 'file' | 'folder'
}

/** One row of an on-demand directory listing; `mtime` is epoch milliseconds. */
export interface DirEntry extends FileEntry {
  mtime: number
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
  // Joined on `root` in main so the renderer never has to join path segments itself.
  templatesPath: string
  sharedPath: string
  hasTemplates: boolean
  hasShared: boolean
  templateFiles: FileEntry[]
  sharedFiles: FileEntry[]
  unrecognisedRootEntries: FileEntry[]
}
