const FORBIDDEN = /[\\/:*?"<>|]/g
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x1f\x7f]/g
const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i

/**
 * Sanitise a user-supplied display name into a folder name that is safe on
 * both Windows and macOS. Returns null when nothing usable remains, the name
 * is a Windows reserved device name, or it collides with the app's
 * underscore-prefixed folder convention.
 */
export function sanitiseFolderName(raw: string): string | null {
  const name = raw
    .replace(CONTROL, '')
    .replace(FORBIDDEN, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')

  if (!name) return null
  if (RESERVED.test(name)) return null
  if (name.startsWith('_')) return null
  return name
}
