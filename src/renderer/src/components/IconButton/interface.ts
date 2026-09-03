import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { ButtonProps } from '@cloudflare/kumo'

export type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'> & {
  icon: ReactNode
  /** Icon-only buttons still need a name. */
  'aria-label': string
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  loading?: boolean
}
