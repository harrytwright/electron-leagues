import { z } from 'zod'

/** A topic id is a markdown filename stem under `resources/docs`; the anchor is a heading id. */
export const helpTargetSchema = z.object({
  topic: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: 'Invalid help topic' }),
  anchor: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: 'Invalid help anchor' })
    .optional()
})

export type HelpTarget = z.infer<typeof helpTargetSchema>

/** Passed by the Windows jump list task; a second instance forwards it to the running app. */
export const HELP_LAUNCH_FLAG = '--open-help'

export function helpRequested(argv: readonly string[]): boolean {
  return argv.includes(HELP_LAUNCH_FLAG)
}

export function helpTargetFromSearch(search: string): HelpTarget | null {
  const params = new URLSearchParams(search)
  const parsed = helpTargetSchema.safeParse({
    topic: params.get('topic') ?? undefined,
    anchor: params.get('anchor') ?? undefined
  })
  return parsed.success ? parsed.data : null
}

export function helpTargetToSearch(target: HelpTarget | null): Record<string, string> {
  if (!target) return {}
  return target.anchor ? { topic: target.topic, anchor: target.anchor } : { topic: target.topic }
}
