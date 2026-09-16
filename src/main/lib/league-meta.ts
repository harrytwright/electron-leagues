import { lstat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LeagueMeta } from '../../shared/meta'
import { isMissing, UserFacingError } from './fs-errors'

export const META_FILE = 'meta.json'

export class MetaSymlinkError extends UserFacingError {}

interface WriteLeagueMetaOptions {
  exclusive?: boolean
}

export function serialiseLeagueMeta(meta: LeagueMeta): string {
  return `${JSON.stringify(meta, null, 2)}\n`
}

export async function assertMetaWritable(leaguePath: string): Promise<string> {
  const metaPath = join(leaguePath, META_FILE)
  const existing = await lstat(metaPath).catch((err) => {
    if (isMissing(err)) return null
    throw err
  })
  if (existing?.isSymbolicLink()) {
    throw new MetaSymlinkError('meta.json can’t be a symbolic link')
  }
  return metaPath
}

export async function writeLeagueMeta(
  leaguePath: string,
  meta: LeagueMeta,
  options: WriteLeagueMetaOptions = {}
): Promise<void> {
  const metaPath = await assertMetaWritable(leaguePath)
  await writeFile(metaPath, serialiseLeagueMeta(meta), {
    encoding: 'utf8',
    flag: options.exclusive ? 'wx' : 'w'
  })
}
