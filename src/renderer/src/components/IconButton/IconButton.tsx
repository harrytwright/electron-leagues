import { forwardRef } from 'react'
import { Button } from '@cloudflare/kumo'
import type { Props } from './interface'

/** A square, icon-only Kumo Button; forwards the ref so it can be a menu trigger. */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(props, ref) {
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- Kumo's prop for icon-only sizing
  return <Button ref={ref} {...props} shape="square" />
})
