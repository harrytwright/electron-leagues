import { useCallback, useMemo, useRef, useState } from 'react'
import {
  OperationFeedbackContext,
  type OperationScope
} from '@renderer/contexts/OperationFeedbackContext'
import type { FeedbackState, Props } from './interface'

export function OperationFeedbackProvider({ children, locationKey }: Props): React.JSX.Element {
  const nextId = useRef(0)
  const [currentLocation, setCurrentLocation] = useState(locationKey)
  const [state, setState] = useState<FeedbackState>({
    pending: new Map()
  })

  if (currentLocation !== locationKey) {
    setCurrentLocation(locationKey)
    setState((current) => ({
      pending: new Map(
        [...current.pending].filter(([, operation]) => operation.scope === 'application')
      )
    }))
  }

  const begin = useCallback((label: string, scope: OperationScope = 'location'): number => {
    const id = (nextId.current += 1)
    setState((current) => ({
      pending: new Map(current.pending).set(id, { label, scope })
    }))
    return id
  }, [])

  const finish = useCallback((id: number): void => {
    setState((current) => {
      if (!current.pending.has(id)) return current
      const pending = new Map(current.pending)
      pending.delete(id)
      return { pending }
    })
  }, [])

  const activity = useMemo(() => {
    const latestPending = [...state.pending].at(-1)
    return latestPending ? { id: latestPending[0], label: latestPending[1].label } : null
  }, [state.pending])

  const value = useMemo(() => ({ activity, begin, finish }), [activity, begin, finish])

  return <OperationFeedbackContext value={value}>{children}</OperationFeedbackContext>
}
