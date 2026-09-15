/** One step of a drill-down below a browser's base folder. */
export interface Crumb {
  name: string
  /** Absolute path, as handed out by main — the renderer never joins paths. */
  path: string
}
