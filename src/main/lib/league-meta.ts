import { join } from 'node:path'
import type { LeagueMeta } from '../../shared/meta'
import {
  AppFileSymlinkError,
  assertAppJsonWritable,
  serialiseAppJson,
  writeAppJson
} from './app-json'

export const META_FILE = 'meta.json'

export { AppFileSymlinkError as MetaSymlinkError }

interface WriteLeagueMetaOptions {
  exclusive?: boolean
}

export function serialiseLeagueMeta(meta: LeagueMeta): string {
  return serialiseAppJson(meta)
}

export async function assertMetaWritable(leaguePath: string): Promise<string> {
  return assertAppJsonWritable(join(leaguePath, META_FILE))
}

export async function writeLeagueMeta(
  leaguePath: string,
  meta: LeagueMeta,
  options: WriteLeagueMetaOptions = {}
): Promise<void> {
  await writeAppJson(join(leaguePath, META_FILE), meta, options)
}
