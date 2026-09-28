import { lstat, readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { z } from 'zod'
import { isMissing, UserFacingError } from './fs-errors'

/** The target of an app-owned JSON write is a symlink; following it could overwrite a user document. */
export class AppFileSymlinkError extends UserFacingError {}

interface WriteAppJsonOptions {
  exclusive?: boolean
}

/** App-owned files are always a JSON object with a schema version at the top. */
export interface AppJsonDocument {
  schemaVersion: number
}

export function serialiseAppJson<T extends AppJsonDocument>(value: T): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/** Refuse a symlinked target before the first byte is written. */
export async function assertAppJsonWritable(path: string): Promise<string> {
  const existing = await lstat(path).catch((err) => {
    if (isMissing(err)) return null
    throw err
  })
  if (existing?.isSymbolicLink()) {
    throw new AppFileSymlinkError(`${basename(path)} can’t be a symbolic link`)
  }
  return path
}

export async function writeAppJson<T extends AppJsonDocument>(
  path: string,
  value: T,
  options: WriteAppJsonOptions = {}
): Promise<void> {
  await assertAppJsonWritable(path)
  await writeFile(path, serialiseAppJson(value), {
    encoding: 'utf8',
    flag: options.exclusive ? 'wx' : 'w'
  })
}

export type AppJsonRead<T> =
  | { status: 'missing' }
  | { status: 'ok'; value: T; raw: string }
  | { status: 'invalid'; message: string }

/**
 * Read and validate an app-owned file. A missing file is a state, not an
 * error; anything unparsable is reported so the UI can say which file and why.
 */
export async function readAppJson<T>(path: string, schema: z.ZodType<T>): Promise<AppJsonRead<T>> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (err) {
    if (isMissing(err)) return { status: 'missing' }
    throw err
  }
  let parsed: z.ZodSafeParseResult<T>
  try {
    parsed = schema.safeParse(JSON.parse(raw))
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return { status: 'invalid', message: `${basename(path)} is not valid JSON: ${reason}` }
  }
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue?.path.length ? ` at ${issue.path.join('.')}` : ''
    return {
      status: 'invalid',
      message: `${basename(path)} has an unexpected shape${where}: ${issue?.message ?? 'unknown'}`
    }
  }
  return { status: 'ok', value: parsed.data, raw }
}
