/**
 * Kumo ships no prefers-color-scheme CSS — dark mode is opt-in via a
 * data-mode="dark" attribute on the root element, so mirror the OS setting.
 */
export function watchSystemTheme(root: HTMLElement = document.documentElement): () => void {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = (): void => {
    if (query.matches) root.setAttribute('data-mode', 'dark')
    else root.removeAttribute('data-mode')
  }
  apply()
  query.addEventListener('change', apply)
  return () => query.removeEventListener('change', apply)
}
