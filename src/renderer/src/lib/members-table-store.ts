import { z } from 'zod'
import { DEFAULT_MEMBERS_SORT, membersSortSchema } from './members-filter'

/**
 * How the desk last sorted the members list. It lives in localStorage and, like
 * every other UI memory, is guarded so a missing or stale value falls back to
 * the default. Earlier builds also stored column widths under the same key;
 * those are ignored.
 */

const membersTableSchema = z.object({ sort: membersSortSchema })

export type MembersTablePreference = z.infer<typeof membersTableSchema>

export const DEFAULT_MEMBERS_TABLE: MembersTablePreference = { sort: DEFAULT_MEMBERS_SORT }

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
