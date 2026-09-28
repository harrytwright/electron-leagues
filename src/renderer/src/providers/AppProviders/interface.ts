import type { ReactNode } from 'react'
import type { QueryClient } from '@tanstack/react-query'

export interface Props {
  queryClient: QueryClient
  children: ReactNode
}
