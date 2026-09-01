export const MAX_RECENT_ROOTS = 6

/** Most-recently-used first, deduplicated, with the current root at index 0. */
export function updateRecents(recents: readonly string[], root: string): string[] {
  return [root, ...recents.filter((r) => r !== root)].slice(0, MAX_RECENT_ROOTS)
}
