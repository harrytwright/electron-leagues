import { z } from 'zod'
import { DEFAULT_MEMBERS_SORT, membersSortSchema } from './members-filter'

/**
 * How the desk last arranged the members table: the sort and any column widths
 * they dragged. It lives in localStorage and, like every other UI memory, is
 * guarded so a missing or stale value falls back to the defaults.
 */

export const RESIZABLE_MEMBER_COLUMNS = ['number', 'name', 'born', 'contact', 'leagues'] as const

export type ResizableMemberColumn = (typeof RESIZABLE_MEMBER_COLUMNS)[number]

/** Narrower than this and a number or a date no longer fits on one line. */
export const MIN_MEMBER_COLUMN_WIDTH = 64

const columnWidthsSchema = z.object({
  number: z.number().int().min(MIN_MEMBER_COLUMN_WIDTH).optional(),
  name: z.number().int().min(MIN_MEMBER_COLUMN_WIDTH).optional(),
  born: z.number().int().min(MIN_MEMBER_COLUMN_WIDTH).optional(),
  contact: z.number().int().min(MIN_MEMBER_COLUMN_WIDTH).optional(),
  leagues: z.number().int().min(MIN_MEMBER_COLUMN_WIDTH).optional()
})

export type MemberColumnWidths = z.infer<typeof columnWidthsSchema>

const membersTableSchema = z.object({
  sort: membersSortSchema,
  widths: columnWidthsSchema
})

export type MembersTablePreference = z.infer<typeof membersTableSchema>

export const DEFAULT_MEMBERS_TABLE: MembersTablePreference = {
  sort: DEFAULT_MEMBERS_SORT,
  widths: {}
}

const MEMBERS_TABLE_KEY = 'leagues:members-table:v1'

export function loadMembersTable(): MembersTablePreference {
  try {
    const raw = localStorage.getItem(MEMBERS_TABLE_KEY)
    if (raw === null) return DEFAULT_MEMBERS_TABLE
    const parsed = membersTableSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : DEFAULT_MEMBERS_TABLE
  } catch {
    return DEFAULT_MEMBERS_TABLE
  }
}

export function saveMembersTable(preference: MembersTablePreference): void {
  try {
    localStorage.setItem(MEMBERS_TABLE_KEY, JSON.stringify(preference))
  } catch {
    // Storage full or disabled: losing the arrangement is acceptable.
  }
}
