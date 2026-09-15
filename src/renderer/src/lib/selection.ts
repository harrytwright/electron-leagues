import { z } from 'zod'
import type { LeagueNode, LeaguesTree } from '@shared/tree'
import { WEEKDAYS, type Weekday } from '@shared/weekday'

export type Selection = { kind: 'home' } | { kind: 'league'; day: Weekday; folderName: string }

export const HOME: Selection = { kind: 'home' }

export const selectionSchema: z.ZodType<Selection> = z.union([
  z.object({ kind: z.literal('home') }),
  z.object({ kind: z.literal('league'), day: z.enum(WEEKDAYS), folderName: z.string() })
])

/** A remembered league is only worth restoring while it still exists in the tree. */
export function restoreSelection(tree: LeaguesTree, stored: Selection | null): Selection {
  if (stored?.kind === 'league' && findLeague(tree, stored)) return stored
  return HOME
}

export function findLeague(tree: LeaguesTree, selection: Selection): LeagueNode | null {
  if (selection.kind !== 'league') return null
  return tree.days[selection.day].find((l) => l.folderName === selection.folderName) ?? null
}
