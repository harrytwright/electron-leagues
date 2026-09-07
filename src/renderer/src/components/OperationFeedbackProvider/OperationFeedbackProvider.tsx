import { useRef, useState } from 'react'
import {
  OperationFeedbackContext,
  type OperationActivity,
  type OperationFeedbackProviderProps,
  type OperationResult
} from '@renderer/hooks/use-operation-feedback'

interface FeedbackState {
  pending: Map<number, string>
  result: OperationActivity | null
}

export function OperationFeedbackProvider({
  children,
  locationKey
}: OperationFeedbackProviderProps): React.JSX.Element {
  const nextId = useRef(0)
  const [currentLocation, setCurrentLocation] = useState(locationKey)
  const [state, setState] = useState<FeedbackState>({ pending: new Map(), result: null })

  if (currentLocation !== locationKey) {
    setCurrentLocation(locationKey)
    setState({ pending: new Map(), result: null })
  }

  const begin = (label: string): number => {
    const id = (nextId.current += 1)
    setState((current) => ({
      ...current,
      pending: new Map(current.pending).set(id, label)
    }))
    return id
  }

  const finish = (id: number, result: OperationResult, message?: string): void => {
    setState((current) => {
      const label = current.pending.get(id)
      if (!label) return current
      const pending = new Map(current.pending)
      pending.delete(id)
      return {
        pending,
        result:
          !current.result || id > current.result.id
            ? { id, label, state: result, message }
            : current.result
      }
    })
  }

  const latestPending = [...state.pending].at(-1)
  const activity = latestPending
    ? { id: latestPending[0], label: latestPending[1], state: 'pending' as const }
    : state.result

  return (
    <OperationFeedbackContext value={{ activity, begin, finish }}>
      {children}
    </OperationFeedbackContext>
  )
}
