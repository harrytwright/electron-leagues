import { act, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useCrumbs } from '../use-crumbs'

const base = '/leagues/monday/Triples'
const season = { name: '2025-26', path: `${base}/2025-26` }
const week = { name: 'Week 1', path: `${season.path}/Week 1` }

it('requests focus once for the entered folder only when asked', () => {
  const { result } = renderHook(() => useCrumbs(base))

  act(() => result.current.enter(season))
  expect(result.current.consumeFocusRequest(season.path)).toBe(false)

  act(() => result.current.enter(week, true))
  expect(result.current.currentDir).toBe(week.path)
  expect(result.current.consumeFocusRequest(season.path)).toBe(false)
  expect(result.current.consumeFocusRequest(week.path)).toBe(true)
  expect(result.current.consumeFocusRequest(week.path)).toBe(false)
})

it('requests focus on the last of many folders and on the jump destination', () => {
  const onCurrentDirChange = vi.fn()
  const { result } = renderHook(() => useCrumbs(base, onCurrentDirChange))

  act(() => result.current.enterMany([season, week], true))
  expect(onCurrentDirChange).toHaveBeenLastCalledWith(week.path)
  expect(result.current.consumeFocusRequest(week.path)).toBe(true)

  act(() => result.current.jumpTo(1))
  expect(result.current.currentDir).toBe(season.path)
  expect(onCurrentDirChange).toHaveBeenLastCalledWith(season.path)
  expect(result.current.consumeFocusRequest(season.path)).toBe(true)

  act(() => result.current.jumpTo(0))
  expect(result.current.atBase).toBe(true)
  expect(result.current.consumeFocusRequest(base)).toBe(true)
})

it('starts over from a different base', () => {
  const { result, rerender } = renderHook(({ baseDir }) => useCrumbs(baseDir), {
    initialProps: { baseDir: base }
  })
  act(() => result.current.enter(season))
  rerender({ baseDir: '/elsewhere' })
  expect(result.current.crumbs).toEqual([])
  expect(result.current.currentDir).toBe('/elsewhere')
})
