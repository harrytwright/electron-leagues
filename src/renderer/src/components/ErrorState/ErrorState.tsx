import { isValidElement } from 'react'
import { Text } from '@cloudflare/kumo'
import { useSlots } from '../../hooks/use-slots'
import type { ErrorStateChildProps, ErrorStateProps, ErrorStateTitleProps } from './interface'

function ErrorStateRoot({ children }: ErrorStateProps): React.JSX.Element {
  const [slots, rest] = useSlots(children, {
    title: ErrorStateTitle,
    message: ErrorStateMessage,
    actions: ErrorStateActions
  })

  if (import.meta.env.DEV && rest.some(isValidElement)) {
    throw new Error(
      'ErrorState expects ErrorState.Title, ErrorState.Message or ErrorState.Actions as direct element children'
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-kumo-base px-6 py-5">
      <div role="alert" className="grid max-w-md gap-1.5 text-center">
        {slots.title}
        {slots.message}
        {rest}
      </div>
      {slots.actions}
    </div>
  )
}

function ErrorStateTitle({ as = 'h1', children }: ErrorStateTitleProps): React.JSX.Element {
  return (
    <Text as={as} variant="heading">
      {children}
    </Text>
  )
}

function ErrorStateMessage({ children }: ErrorStateChildProps): React.JSX.Element {
  return <Text variant="secondary">{children}</Text>
}

function ErrorStateActions({ children }: ErrorStateChildProps): React.JSX.Element {
  return <div className="flex gap-3">{children}</div>
}

export const ErrorState = Object.assign(ErrorStateRoot, {
  Title: ErrorStateTitle,
  Message: ErrorStateMessage,
  Actions: ErrorStateActions
})
