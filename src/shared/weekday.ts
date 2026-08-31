export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
] as const

export type Weekday = (typeof WEEKDAYS)[number]

export function isWeekday(value: string): value is Weekday {
  return WEEKDAYS.some((day) => day === value)
}
