import { plural } from './plural'

const FORMAT_LABELS = ['Singles', 'Doubles', 'Trios', 'Fours', 'Fives'] as const

/** The bowling name for a players-per-team count, falling back to the number. */
export function formatLabel(format: number): string {
  return FORMAT_LABELS[format - 1] ?? plural(format, 'player')
}
