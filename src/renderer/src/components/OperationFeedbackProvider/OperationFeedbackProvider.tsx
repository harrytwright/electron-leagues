import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  OperationFeedbackContext,
  type OperationActivity,
  type OperationFeedbackProviderProps,
  type OperationResult
} from '@renderer/hooks/use-operation-feedback'

interface PendingOperation {
  label: string
  scope: 'application' | 'location'
}

interface FeedbackState {
  pending: Map<number, PendingOperation>
  result: OperationActivity | null
  acceptedResultId: number
}

export function OperationFeedbackProvider({
  children,
  locationKey
}: OperationFeedbackProviderProps): React.JSX.Element {
  const nextId = useRef(0)
  const [currentLocation, setCurrentLocation] = useState(locationKey)
  const [state, setState] = useState<FeedbackState>({
    pending: new Map(),
    result: null,
    acceptedResultId: 0
  })

  if (currentLocation !== locationKey) {
    setCurrentLocation(locationKey)
    setState((current) => ({
      pending: new Map(
        [...current.pending].filter(([, operation]) => operation.scope === 'application')
      ),
      result: null,
      acceptedResultId: current.acceptedResultId
    }))
  }

  useEffect(() => {
    const id = state.result?.id
    if (id === undefined) return
    const timer = setTimeout(() => {
      setState((current) => (current.result?.id === id ? { ...current, result: null } : current))
    }, 5000)
    return () => clearTimeout(timer)
  }, [state.result?.id])

  const begin = useCallback(
    (label: string, scope: 'application' | 'location' = 'location'): number => {
      const id = (nextId.current += 1)
      setState((current) => ({
        ...current,
        result: null,
        pending: new Map(current.pending).set(id, { label, scope })
      }))
      return id
    },
    []
  )

  const finish = useCallback((id: number, result: OperationResult, message?: string): void => {
    setState((current) => {
      const operation = current.pending.get(id)
      if (!operation) return current
      const pending = new Map(current.pending)
      pending.delete(id)
      if (id < current.acceptedResultId) return { ...current, pending }
      return {
        pending,
        result: { id, label: operation.label, state: result, message },
        acceptedResultId: id
      }
    })
  }, [])

  const activity = useMemo(() => {
    const latestPending = [...state.pending].at(-1)
    return latestPending
      ? { id: latestPending[0], label: latestPending[1].label, state: 'pending' as const }
      : state.result
  }, [state.pending, state.result])

  const value = useMemo(() => ({ activity, begin, finish }), [activity, begin, finish])

  return <OperationFeedbackContext value={value}>{children}</OperationFeedbackContext>
}
