import { useState } from 'react'

/**
 * State that starts over whenever its owner key changes. The reset happens during
 * render, so a consumer never sees the previous owner's value for even one frame.
 */
export function useKeyedState<Key, Value>(
  key: Key,
  initial: Value
): [Value, (value: Value) => void] {
  const [state, setState] = useState({ key, value: initial })
  if (state.key !== key) setState({ key, value: initial })
  return [state.key === key ? state.value : initial, (value) => setState({ key, value })]
}
