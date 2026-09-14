import type { z } from 'zod'
import { workspaceEnvelopeSchema } from '../lib/workspace-store'

export type WorkspaceEnvelope = z.infer<typeof workspaceEnvelopeSchema>

/** Parses the raw `leagues:workspace` envelope JSON the persist middleware writes. */
export function parseWorkspaceEnvelope(raw: string): WorkspaceEnvelope {
  return workspaceEnvelopeSchema.parse(JSON.parse(raw))
}
