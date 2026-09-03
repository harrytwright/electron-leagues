export interface Props {
  root: string
  isHome: boolean
  onHome: () => void
  onLocationChanged: () => void | Promise<void>
}
