export interface Props {
  baseDir: string
  label: string
  present: boolean
  onCurrentDirChange: (path: string) => void
}
