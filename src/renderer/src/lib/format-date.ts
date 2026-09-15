// Fixed locale (the app's copy is en-GB), local time zone, date only.
const modified = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' })

export function formatModified(mtime: number): string {
  return modified.format(new Date(mtime))
}
