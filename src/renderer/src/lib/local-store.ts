import { z } from 'zod'
import { WEEKDAYS, type Weekday } from '@shared/weekday'
import { selectionSchema, type Selection } from './selection'

/**
 * Per-location UI memory (last selection, collapsed sidebar days) in
 * localStorage. Every access is guarded: storage can be unavailable or hold
 * stale shapes, and neither should ever break the app.
 */

const collapsedDaysSchema = z.array(z.enum(WEEKDAYS))

function key(root: string, name: string): string {
  return `leagues:${root}:${name}`
}

function read<T>(storageKey: string, schema: z.ZodType<T>): T | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw === null) return null
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function write<T>(storageKey: string, value: T): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value))
  } catch {
    // Storage full or disabled — losing UI memory is acceptable.
  }
}

export function loadSelection(root: string): Selection | null {
  return read(key(root, 'selection'), selectionSchema)
}

export function saveSelection(root: string, selection: Selection): void {
  write(key(root, 'selection'), selection)
}

export function loadCollapsedDays(root: string): Weekday[] {
  return read(key(root, 'collapsed-days'), collapsedDaysSchema) ?? []
}

export function saveCollapsedDays(root: string, days: readonly Weekday[]): void {
  write(key(root, 'collapsed-days'), days)
}
