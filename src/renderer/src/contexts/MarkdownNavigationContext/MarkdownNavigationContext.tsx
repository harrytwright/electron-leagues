import { createContext } from 'react'
import type { MarkdownNavigation } from './interface'

export const MarkdownNavigationContext = createContext<MarkdownNavigation | null>(null)
