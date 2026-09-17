/** Adapted from Primer React's useSlots (MIT, https://github.com/primer/react). */
import {
  Children,
  isValidElement,
  type ElementType,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode
} from 'react'

// slot config allows 2 options:
// 1. Component to match, example: { leadingVisual: LeadingVisual }
export type ComponentMatcher = ElementType<Props>
// 2. Component to match + a test function, example: { blockDescription: [Description, props => props.variant === 'block'] }
export type ComponentAndPropsMatcher = [ComponentMatcher, (props: Props) => boolean]

export type SlotConfig = Record<string, ComponentMatcher | ComponentAndPropsMatcher>

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matcher props vary by component; SlotValue recovers them from the configuration
type Props = any

type SlotElements<Config extends SlotConfig> = {
  [Property in keyof Config]: SlotValue<Config, Property>
}

type SlotValue<Config, Property extends keyof Config> = Config[Property] extends ElementType // config option 1
  ? ReactElement<ComponentPropsWithoutRef<Config[Property]>, Config[Property]>
  : Config[Property] extends readonly [
        infer MatchedElementType extends ElementType, // config option 2, infer array[0] as component
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- tuple inference preserves the matched component’s props without using the predicate type
        infer _testFn
      ]
    ? ReactElement<ComponentPropsWithoutRef<MatchedElementType>, MatchedElementType>
    : never // useful for narrowing types, third option is not possible

/**
 * Extract components from `children` so we can render them in different places.
 * Note: We can only extract direct children, not nested ones.
 */
export function useSlots<Config extends SlotConfig>(
  children: ReactNode,
  config: Config
): [Partial<SlotElements<Config>>, ReactNode[]] {
  // Object mapping slot names to their elements
  const slots: Partial<SlotElements<Config>> = {}

  // Array of elements that are not slots
  const rest: ReactNode[] = []

  // SAFETY: these enumerable keys come directly from the supplied slot configuration.
  const keys = Object.keys(config) as Array<keyof Config>
  const values = Object.values(config)

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      rest.push(child)
      return
    }

    const index = values.findIndex((value) => {
      if (Array.isArray(value)) {
        const [component, testFn] = value
        return child.type === component && testFn(child.props)
      } else {
        return child.type === value
      }
    })

    // If the child is not a slot, add it to the `rest` array
    if (index === -1) {
      rest.push(child)
      return
    }

    const slotKey = keys[index]

    // If slot is already filled, ignore duplicates
    if (slots[slotKey]) {
      if (import.meta.env.DEV) {
        console.warn(`Found duplicate "${String(slotKey)}" slot. Only the first will be rendered.`)
      }
      return
    }

    // SAFETY: the matched config entry checks the element type and any props predicate.
    slots[slotKey] = child as SlotValue<Config, keyof Config>
  })

  return [slots, rest]
}
