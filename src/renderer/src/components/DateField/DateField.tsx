import { useState } from 'react'
import { DatePicker, Input, Popover } from '@cloudflare/kumo'
import { CalendarBlankIcon } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { parseIsoDate, toIsoDate } from '@renderer/lib/iso-date'
import { IconButton } from '../IconButton'
import type { Props } from './interface'

/**
 * A date typed like any other field, with Kumo's calendar beside it for anyone
 * who would rather pick. The calendar's month and year are dropdowns, since a
 * date of birth can be decades away from today.
 */
export function DateField({
  label,
  name,
  value,
  onChange,
  fromYear,
  toYear,
  openAt,
  disabled
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const selected = parseIsoDate(value)

  return (
    <div className="flex items-end gap-1.5">
      <Input
        label={label}
        name={name}
        type="date"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          render={
            <IconButton
              type="button"
              variant="secondary"
              // Named without the field so label queries still find the input alone.
              aria-label="Open calendar"
              disabled={disabled}
              icon={<CalendarBlankIcon aria-hidden size={16} />}
            />
          }
        />
        <Popover.Content align="end">
          <DatePicker
            mode="single"
            selected={selected}
            defaultMonth={selected ?? openAt ?? new Date()}
            captionLayout="dropdown"
            startMonth={new Date(fromYear, 0)}
            endMonth={new Date(toYear, 11)}
            onChange={(date) => {
              if (date) onChange(toIsoDate(date))
              setOpen(false)
            }}
          />
        </Popover.Content>
      </Popover>
    </div>
  )
}
