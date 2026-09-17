import { z } from 'zod'

export const HELP_SECTIONS = ['Basics', 'Working with leagues', 'Reference'] as const

export type HelpSection = (typeof HELP_SECTIONS)[number]

export const HELP_STATUSES = ['draft', 'verified'] as const

export type HelpStatus = (typeof HELP_STATUSES)[number]

export const helpFrontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  section: z.enum(HELP_SECTIONS),
  order: z.coerce.number().int().positive(),
  status: z.enum(HELP_STATUSES),
  /** Informational only: when the words were last checked against the app. */
  updated: z.iso.date(),
  /** Informational only: the app version the words were last checked against. */
  version: z.string().regex(/^\d+\.\d+\.\d+$/)
})

export type HelpFrontmatter = z.infer<typeof helpFrontmatterSchema>

export interface FrontmatterField {
  key: string
  value: string
}

/** The docs need only flat `key: value` lines, so no YAML parser is worth its weight. */
export function parseFrontmatterFields(raw: string): FrontmatterField[] {
  const fields: FrontmatterField[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === '') continue
    const separator = line.indexOf(':')
    if (separator === -1) throw new Error(`Frontmatter line is not "key: value": ${line}`)
    const key = line.slice(0, separator).trim()
    if (fields.some((field) => field.key === key)) {
      throw new Error(`Duplicate frontmatter key: ${key}`)
    }
    fields.push({ key, value: line.slice(separator + 1).trim() })
  }
  return fields
}

export function parseHelpFrontmatter(raw: string): HelpFrontmatter {
  return helpFrontmatterSchema.parse(
    Object.fromEntries(parseFrontmatterFields(raw).map((field) => [field.key, field.value]))
  )
}
