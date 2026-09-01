import { stat } from 'node:fs/promises'

export type OneDriveAvailability = 'local' | 'cloud-only' | 'unknown'

export interface OneDriveStatus {
  underOneDrive: boolean
  availability: OneDriveAvailability
}

/**
 * Stub OneDrive awareness — reported to analytics only, never drives UI.
 *
 * Detection is heuristic: a path is "under OneDrive" when it sits below a
 * OneDrive sync root (the %OneDrive% env vars on Windows, ~/Library/CloudStorage
 * on macOS). A Files On-Demand placeholder on Windows reports a non-zero size
 * but zero allocated blocks.
 */
export async function oneDriveStatus(path: string): Promise<OneDriveStatus> {
  const roots = [
    process.env.OneDrive,
    process.env.OneDriveConsumer,
    process.env.OneDriveCommercial,
    process.platform === 'darwin' ? `${process.env.HOME}/Library/CloudStorage` : undefined
  ].filter((r): r is string => Boolean(r))

  const underOneDrive = roots.some((root) => path.startsWith(root))

  let availability: OneDriveAvailability = 'unknown'
  if (process.platform === 'win32' && underOneDrive) {
    try {
      const s = await stat(path)
      availability = s.size > 0 && s.blocks === 0 ? 'cloud-only' : 'local'
    } catch {
      availability = 'unknown'
    }
  }

  return { underOneDrive, availability }
}
