const rules = new Intl.PluralRules('en-GB')

/** "1 item", "2 items"; pass the plural form when it is not the noun plus an s. */
export function plural(count: number, noun: string, pluralForm = `${noun}s`): string {
  return `${count} ${rules.select(count) === 'one' ? noun : pluralForm}`
}
