import type { ReactNode } from 'react'
import { render, renderHook, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { useSlots } from '../use-slots'

function Description({
  children,
  variant
}: {
  children: ReactNode
  variant?: 'inline' | 'block'
}): React.JSX.Element {
  return <p data-variant={variant}>{children}</p>
}

it('extracts a slot by its component matcher', () => {
  const description = <Description>Folder access is blocked</Description>
  const { result } = renderHook(() =>
    useSlots(description, { description: Description, action: 'button' })
  )
  const [slots, rest] = result.current

  expect(slots.description).toBe(description)
  expect(slots.action).toBeUndefined()
  expect(rest).toEqual([])
})

it('matches a component and its props with a tuple matcher', () => {
  const inline = <Description variant="inline">Inline description</Description>
  const block = <Description variant="block">Block description</Description>
  const { result } = renderHook(() =>
    useSlots([inline, block], {
      block: [Description, (props) => props.variant === 'block']
    })
  )
  const [slots, rest] = result.current

  expect(slots.block).toBe(block)
  expect(rest).toEqual([inline])
})

it('preserves non-slot children in rest', () => {
  const other = <span>Other content</span>
  const description = <Description>Folder access is blocked</Description>
  const { result } = renderHook(() =>
    useSlots(['Attempts: ', description, 3, other], { description: Description })
  )
  const [slots, rest] = result.current

  expect(slots.description).toBe(description)
  expect(rest).toEqual(['Attempts: ', 3, other])
})

it('warns about duplicate slots and renders only the first', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const first = <Description>First description</Description>
  const second = <Description>Second description</Description>
  const { result } = renderHook(() => useSlots([first, second], { description: Description }))
  const [slots, rest] = result.current

  render(
    <>
      {slots.description}
      {rest}
    </>
  )

  expect(warn).toHaveBeenCalledExactlyOnceWith(
    'Found duplicate "description" slot. Only the first will be rendered.'
  )
  expect(screen.getByText('First description')).toBeInTheDocument()
  expect(screen.queryByText('Second description')).not.toBeInTheDocument()
})
