export interface Props {
  baseDir: string
  label: string
  present: boolean
  onChanged: () => void | Promise<void>
  onCurrentDirChange: (path: string) => void
}
