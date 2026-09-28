export type ChooseRootMode = 'select' | 'init'

export interface LocationOperation {
  busy: boolean
  choose(mode: ChooseRootMode): Promise<void>
  switchTo(path: string): Promise<void>
  forget(): Promise<void>
}
