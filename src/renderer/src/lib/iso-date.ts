const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** A local calendar day from an ISO date; anything else, including a half typed date, is none. */
export function parseIsoDate(value: string): Date | undefined {
  const match = ISO_DATE.exec(value)
  if (!match) return undefined
  const [, year, month, day] = match.map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : undefined
}

export function toIsoDate(date: Date): string {
  const pad = (part: number): string => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
