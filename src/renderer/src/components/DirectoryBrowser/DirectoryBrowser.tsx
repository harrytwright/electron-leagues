import { useId, useRef, useState } from 'react'
import { Button, DropdownMenu, Empty, Loader, Table, useKumoToastManager } from '@cloudflare/kumo'
import { DotsThreeIcon } from '@phosphor-icons/react/dist/csr/DotsThree'
import { FolderOpenIcon } from '@phosphor-icons/react/dist/csr/FolderOpen'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle'
import { formatModified } from '@renderer/lib/format-date'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { revealLabel } from '@renderer/lib/reveal-label'
import { FileBrowserFrame } from '../FileBrowser/FileBrowserFrame'
import { FileEntryIcon } from '../FileBrowser/FileEntryIcon'
import { fileType } from '../FileBrowser/file-type'
import { FILE_ROW_CLASS, FILE_TABLE_CLASS } from '../FileBrowser/styles'
import { IconButton } from '../IconButton'
import type { BrowserRow, Props } from './interface'

/** Flat directory pane for the league overview and its archive, preserving scan order. */
export function DirectoryBrowser({
  name,
  heading,
  rows,
  metadataColumn,
  readOnly,
  listing,
  onRefresh,
  onNavigate,
  onDropFiles,
  onBack,
  emptyTitle,
  emptyDescription
}: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const elements = useRef(new Map<string, HTMLTableRowElement>())
  const instructions = useId()
  const { add } = useKumoToastManager()
  const filter = query.trim().toLocaleLowerCase()
  const visible = rows.filter((row) => row.name.toLocaleLowerCase().includes(filter))
  const selectedRow = visible.find((row) => row.path === selected)
  const focusPath = selectedRow?.path ?? visible[0]?.path
  const loading = listing?.entries === null
  const error = listing?.error

  const focus = (row: BrowserRow | undefined): void => {
    if (row) elements.current.get(row.path)?.focus()
  }

  const open = async (row: BrowserRow): Promise<void> => {
    if (row.kind === 'folder') {
      onNavigate(row)
      return
    }
    try {
      const error = await window.api.openFile(row.path)
      if (error) add({ title: error, variant: 'error' })
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    }
  }

  const reveal = async (row: BrowserRow): Promise<void> => {
    try {
      await window.api.revealFile(row.path)
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    }
  }

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLTableRowElement>,
    row: BrowserRow,
    index: number
  ): void => {
    if (event.target !== event.currentTarget) return
    switch (event.key) {
      case 'ArrowDown':
        focus(visible[index + 1])
        break
      case 'ArrowUp':
        focus(visible[index - 1])
        break
      case 'Home':
        focus(visible[0])
        break
      case 'End':
        focus(visible.at(-1))
        break
      case 'Enter':
        void open(row)
        break
      default:
        return
    }
    event.preventDefault()
  }

  return (
    <FileBrowserFrame
      name={name}
      heading={heading}
      readOnly={readOnly}
      query={query}
      filterLabel="Filter this folder"
      onQueryChange={setQuery}
      onRefresh={onRefresh}
      onDropFiles={onDropFiles}
      selection={selectedRow?.name}
      summary={
        loading || error
          ? '—'
          : filter
            ? `${visible.length} of ${rows.length} items`
            : `${rows.length} item${rows.length === 1 ? '' : 's'}`
      }
    >
      <p id={instructions} className="sr-only">
        Use the up and down arrow keys to select an item, and Enter to open. Double-click a row to
        open it.
      </p>
      <Table
        role="grid"
        aria-label={name}
        aria-describedby={instructions}
        layout="fixed"
        className={FILE_TABLE_CLASS}
      >
        <Table.Header sticky>
          <Table.Row className="text-kumo-subtle">
            <Table.Head>Name</Table.Head>
            <Table.Head className={metadataColumn === 'contents' ? 'w-28' : 'w-36'}>
              {metadataColumn === 'contents' ? 'Contents' : 'Modified'}
            </Table.Head>
            <Table.Head className={metadataColumn === 'contents' ? 'w-32' : 'w-40'}>
              Kind
            </Table.Head>
            <Table.Head className="w-12">
              <span className="sr-only">Actions</span>
            </Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {error || loading || visible.length === 0 ? (
            <Table.Row className="even:bg-transparent">
              <Table.Cell colSpan={4}>
                {error ? (
                  <Empty
                    size="sm"
                    className="rounded-none border-0 bg-transparent"
                    icon={<WarningCircleIcon size={24} />}
                    title="Couldn’t read this folder"
                    description={error}
                    contents={
                      <div className="flex gap-2">
                        {onBack ? (
                          <Button size="sm" onClick={onBack.action}>
                            {onBack.label}
                          </Button>
                        ) : null}
                        <Button size="sm" onClick={onRefresh}>
                          Try again
                        </Button>
                      </div>
                    }
                  />
                ) : loading ? (
                  <div
                    role="status"
                    className="flex items-center justify-center gap-2 py-12 text-kumo-subtle"
                  >
                    <Loader />
                    Loading files…
                  </div>
                ) : (
                  <Empty
                    size="sm"
                    className="rounded-none border-0 bg-transparent"
                    icon={filter ? <MagnifyingGlassIcon size={24} /> : <FolderOpenIcon size={24} />}
                    title={filter ? 'No matching items' : emptyTitle}
                    description={
                      filter ? 'Try a different name or clear the filter.' : emptyDescription
                    }
                    contents={
                      filter ? (
                        <Button size="sm" onClick={() => setQuery('')}>
                          Clear filter
                        </Button>
                      ) : undefined
                    }
                  />
                )}
              </Table.Cell>
            </Table.Row>
          ) : (
            visible.map((row, index) => (
              <Table.Row
                key={row.key}
                ref={(element) => {
                  if (element) elements.current.set(row.path, element)
                  else elements.current.delete(row.path)
                }}
                aria-label={row.name}
                aria-selected={selected === row.path}
                tabIndex={focusPath === row.path ? 0 : -1}
                className={FILE_ROW_CLASS}
                onFocus={() => setSelected(row.path)}
                onClick={() => focus(row)}
                onDoubleClick={() => void open(row)}
                onKeyDown={(event) => onKeyDown(event, row, index)}
              >
                <Table.Cell>
                  <div className="flex min-w-0 items-center gap-2 pl-8">
                    <span className="shrink-0">
                      <FileEntryIcon entry={row} />
                    </span>
                    <span title={row.name} className="truncate font-medium">
                      {row.name}
                    </span>
                    {row.badge}
                  </div>
                </Table.Cell>
                <Table.Cell className="whitespace-nowrap text-kumo-subtle">
                  {metadataColumn === 'contents' ? (
                    (row.contents ?? '—')
                  ) : row.mtime === undefined ? (
                    '—'
                  ) : (
                    <time dateTime={new Date(row.mtime).toISOString()}>
                      {formatModified(row.mtime)}
                    </time>
                  )}
                </Table.Cell>
                <Table.Cell className="truncate text-kumo-subtle">
                  {row.typeLabel ?? fileType(row)}
                </Table.Cell>
                <Table.Cell
                  onClick={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                >
                  <DropdownMenu>
                    <DropdownMenu.Trigger
                      render={
                        <IconButton
                          variant="ghost"
                          size="sm"
                          icon={<DotsThreeIcon aria-hidden size={16} weight="bold" />}
                          aria-label={`Actions for ${row.name}`}
                        />
                      }
                    />
                    <DropdownMenu.Content>
                      <DropdownMenu.Item onClick={() => void open(row)}>Open</DropdownMenu.Item>
                      <DropdownMenu.Item onClick={() => void reveal(row)}>
                        {revealLabel()}
                      </DropdownMenu.Item>
                      {row.menuItems?.length ? <DropdownMenu.Separator /> : null}
                      {row.menuItems?.map((item) => (
                        <DropdownMenu.Item
                          key={item.label}
                          variant={item.variant}
                          disabled={item.disabled}
                          onClick={item.onSelect}
                        >
                          {item.label}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.Content>
                  </DropdownMenu>
                </Table.Cell>
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table>
    </FileBrowserFrame>
  )
}
