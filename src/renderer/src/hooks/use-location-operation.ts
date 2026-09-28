import { use } from 'react'
import {
  LocationOperationContext,
  type LocationOperation
} from '@renderer/contexts/LocationOperationContext'

export function useLocationOperation(): LocationOperation {
  const value = use(LocationOperationContext)
  if (!value) throw new Error('useLocationOperation must be used inside LocationOperationProvider')
  return value
}
