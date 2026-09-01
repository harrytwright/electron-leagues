import { forwardRef } from 'react'
import { Button, type ButtonProps } from '@cloudflare/kumo'

type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'> & {
  icon: React.ReactNode
  /** Icon-only buttons still need a name. */
  'aria-label': string
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  loading?: boolean
}

/** A square, icon-only Kumo Button; forwards the ref so it can be a menu trigger. */
const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(props, ref) {
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- Kumo's prop for icon-only sizing
  return <Button ref={ref} {...props} shape="square" />
})

export default IconButton
