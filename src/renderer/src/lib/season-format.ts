import { MAX_FORMAT, MIN_FORMAT, SINGLES_FORMAT } from '@shared/members'
import { plural } from './plural'

const FORMAT_LABELS = ['Singles', 'Doubles', 'Trios', 'Fours', 'Fives'] as const

/** The bowling name for a players-per-team count, falling back to the number. */
export function formatLabel(format: number): string {
  return FORMAT_LABELS[format - 1] ?? plural(format, 'player')
}

/** Select items for every format the roster file allows, explained in players per team. */
export const FORMAT_ITEMS: Record<string, string> = Object.fromEntries(
  Array.from({ length: MAX_FORMAT - MIN_FORMAT + 1 }, (_, index) => {
    const format = MIN_FORMAT + index
    const detail = format === SINGLES_FORMAT ? 'no teams' : `${format} per team`
    return [String(format), `${formatLabel(format)} (${detail})`]
  })
)
