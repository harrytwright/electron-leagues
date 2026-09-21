export interface Props {
  label: string
  name: string
  /** An ISO date such as `1990-05-04`, or an empty string for none. */
  value: string
  onChange: (value: string) => void
  /** The first and last years the calendar's year list offers. */
  fromYear: number
  toYear: number
  /** Where the calendar opens when there is no value yet; defaults to today. */
  openAt?: Date
  disabled?: boolean
}
