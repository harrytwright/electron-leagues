export const MAX_RECENT_ROOTS = 6

/** Most-recently-used first, deduplicated, with the newly activated root at index 0. */
export function updateRecents(recents: readonly string[], root: string): string[] {
  return [root, ...recents.filter((r) => r !== root)].slice(0, MAX_RECENT_ROOTS)
}

/** Installs that predate the recents list only know their current root. */
export function seedRecents(
  recents: readonly string[] | undefined,
  rootPath: string | undefined
): string[] {
  if (recents) return [...recents]
  return rootPath ? [rootPath] : []
}

export type RootProbe = 'dir' | 'missing' | 'unavailable'

/**
 * Drop roots that are definitely gone. Ones that merely can't be reached right
 * now (unplugged drive, offline share, permission hiccup) are kept.
 */
export async function pruneRecents(
  recents: readonly string[],
  probe: (path: string) => Promise<RootProbe>
): Promise<string[]> {
  const results = await Promise.all(recents.map(probe))
  return recents.filter((_, i) => results[i] !== 'missing')
}
