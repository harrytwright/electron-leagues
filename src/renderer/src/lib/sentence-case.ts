/** "monday" → "Monday"; the rest of the string is left alone. */
export function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
