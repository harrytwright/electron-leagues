export interface Props {
  root: string
  /** The location changed; the caller rescans. */
  onChanged: () => void | Promise<void>
}
