import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LeagueMeta } from '../../shared/meta'

export const META_FILE = 'meta.json'

export function serialiseLeagueMeta(meta: LeagueMeta): string {
  return `${JSON.stringify(meta, null, 2)}\n`
}

export function writeLeagueMeta(leaguePath: string, meta: LeagueMeta): Promise<void> {
  return writeFile(join(leaguePath, META_FILE), serialiseLeagueMeta(meta), 'utf8')
}
