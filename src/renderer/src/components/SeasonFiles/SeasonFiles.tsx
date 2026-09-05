import { Fragment, useId, useRef, useState } from 'react'
import {
  Button,
  cn,
  DropdownMenu,
  Empty,
  Loader,
  Table,
  useKumoToastManager
} from '@cloudflare/kumo'
import { ArrowDownIcon } from '@phosphor-icons/react/dist/csr/ArrowDown'
import { ArrowUpIcon } from '@phosphor-icons/react/dist/csr/ArrowUp'
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown'
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight'
import { DotsThreeIcon } from '@phosphor-icons/react/dist/csr/DotsThree'
import { FolderOpenIcon } from '@phosphor-icons/react/dist/csr/FolderOpen'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle'
import { formatModified } from '@renderer/lib/format-date'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { revealLabel } from '@renderer/lib/reveal-label'
import { IconButton } from '../IconButton'
import { FileBrowserFrame } from '../FileBrowser/FileBrowserFrame'
import { FileEntryIcon } from '../FileBrowser/FileEntryIcon'
import { fileType } from '../FileBrowser/file-type'
import { FILE_ROW_CLASS, FILE_TABLE_CLASS } from '../FileBrowser/styles'
import { fileRows } from './file-tree'
import type { FileRow, Props, Sort, SortColumn } from './interface'
import { useTreeFolders } from './use-tree-folders'

export function SeasonFiles({
  name,
  listing,
  readOnly,
  onNavigate,
  onDropFiles,
  onBack
}: Props): React.JSX.Element {
  const tree = useTreeFolders()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>({ column: 'name', direction: 'ascending' })
  const [selected, setSelected] = useState<string | null>(null)
  const elements = useRef(new Map<string, HTMLTableRowElement>())
  const instructions = useId()
  const { add } = useKumoToastManager()
  const filter = query.trim().toLocaleLowerCase()
  const rows = fileRows(listing.entries ?? [], tree.branches, tree.expanded, sort, filter)
  const selectedRow = rows.find((row) => row.entry.path === selected)
  const focusPath = selectedRow?.entry.path ?? rows[0]?.entry.path
  const folderCount = listing.entries?.filter((entry) => entry.kind === 'folder').length ?? 0
  const fileCount = (listing.entries?.length ?? 0) - folderCount

  const focus = (row: FileRow | undefined): void => {
    if (row) elements.current.get(row.entry.path)?.focus()
  }

  const open = async (row: FileRow): Promise<void> => {
    if (row.entry.kind === 'folder') {
      onNavigate([...row.ancestors, row.entry])
      return
    }
    try {
      const error = await window.api.openFile(row.entry.path)
      if (error) add({ title: error, variant: 'error' })
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    }
  }

  const reveal = async (row: FileRow): Promise<void> => {
    try {
      await window.api.revealFile(row.entry.path)
    } catch (caught) {
      add({ title: ipcErrorMessage(caught), variant: 'error' })
    }
  }

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLTableRowElement>,
    row: FileRow,
    index: number
  ): void => {
    if (event.target !== event.currentTarget) return
    switch (event.key) {
      case 'ArrowDown':
        focus(rows[index + 1])
        break
      case 'ArrowUp':
        focus(rows[index - 1])
        break
      case 'Home':
        focus(rows[0])
        break
      case 'End':
        focus(rows.at(-1))
        break
      case 'ArrowRight':
        if (row.entry.kind === 'folder') {
          if (!row.expanded) tree.toggle(row.entry.path)
          else if (rows[index + 1]?.ancestors.at(-1)?.path === row.entry.path)
            focus(rows[index + 1])
        }
        break
      case 'ArrowLeft':
        if (row.entry.kind === 'folder' && row.expanded && !filter) tree.toggle(row.entry.path)
        else {
          const parent = row.ancestors.at(-1)
          if (parent) elements.current.get(parent.path)?.focus()
        }
        break
      case 'Enter':
        void open(row)
        break
      default:
        return
    }
    event.preventDefault()
  }

  const sortBy = (column: SortColumn): void => {
    setSort((current) => ({
      column,
      direction:
        current.column === column && current.direction === 'ascending' ? 'descending' : 'ascending'
    }))
  }

  const refresh = (): void => {
    listing.reload()
    tree.reload()
  }

  return (
    <FileBrowserFrame
      name={name}
      heading="Files"
      readOnly={readOnly}
      query={query}
      filterLabel="Filter loaded files"
      onQueryChange={setQuery}
      onRefresh={refresh}
      onDropFiles={onDropFiles}
      selection={selectedRow?.entry.name}
      summary={
        listing.entries
          ? filter
            ? `${rows.length} item${rows.length === 1 ? '' : 's'} shown · Loaded folders only`
            : `${folderCount} folder${folderCount === 1 ? '' : 's'}, ${fileCount} file${fileCount === 1 ? '' : 's'}`
          : '—'
      }
      actions={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-base"
          disabled={tree.expanded.size === 0 || Boolean(filter)}
          onClick={tree.collapse}
        >
          Collapse all
        </Button>
      }
    >
      <p id={instructions} className="sr-only">
        Use the up and down arrow keys to select files, right and left to expand or collapse
        folders, and Enter to open. Double-click a row to open it. Filtering searches only folders
        already loaded.
      </p>
      <Table
        role="treegrid"
        aria-label={name}
        aria-describedby={instructions}
        layout="fixed"
        className={FILE_TABLE_CLASS}
      >
        <Table.Header sticky>
          <Table.Row>
            {(['name', 'mtime', 'type'] as const).map((column) => (
              <Table.Head
                key={column}
                aria-sort={sort.column === column ? sort.direction : 'none'}
                className={column === 'name' ? 'w-auto' : column === 'mtime' ? 'w-36' : 'w-40'}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 rounded-sm text-left text-kumo-subtle hover:text-kumo-default focus-visible:outline-2 focus-visible:outline-kumo-focus"
                  onClick={() => sortBy(column)}
                >
                  {column === 'name' ? 'Name' : column === 'mtime' ? 'Modified' : 'Kind'}
                  {sort.column === column ? (
                    sort.direction === 'ascending' ? (
                      <ArrowUpIcon aria-hidden size={12} />
                    ) : (
                      <ArrowDownIcon aria-hidden size={12} />
                    )
                  ) : null}
                </button>
              </Table.Head>
            ))}
            <Table.Head className="w-12">
              <span className="sr-only">Actions</span>
            </Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {listing.error || listing.entries === null || rows.length === 0 ? (
            <Table.Row className="even:bg-transparent">
              <Table.Cell colSpan={4}>
                {listing.error ? (
                  <Empty
                    size="sm"
                    className="rounded-none border-0 bg-transparent"
                    icon={<WarningCircleIcon size={24} />}
                    title="Couldn’t read this folder"
                    description={listing.error}
                    contents={
                      <div className="flex gap-2">
                        <Button size="sm" onClick={onBack.action}>
                          {onBack.label}
                        </Button>
                        <Button size="sm" onClick={refresh}>
                          Try again
                        </Button>
                      </div>
                    }
                  />
                ) : listing.entries === null ? (
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
                    title={filter ? 'No matching files' : 'This folder is empty'}
                    description={
                      filter
                        ? 'Only loaded folders are included. Try a different name or clear the filter.'
                        : readOnly
                          ? undefined
                          : 'Drop files here or use Add files to import them.'
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
            rows.map((row, index) => {
              const { entry, ancestors, expanded } = row
              const branch = tree.branches.get(entry.path)
              const branchMessage =
                expanded &&
                entry.kind === 'folder' &&
                (!branch?.entries || branch.entries.length === 0)
              return (
                <Fragment key={entry.path}>
                  <Table.Row
                    ref={(element) => {
                      if (element) elements.current.set(entry.path, element)
                      else elements.current.delete(entry.path)
                    }}
                    aria-label={entry.name}
                    aria-level={ancestors.length + 1}
                    aria-posinset={row.position}
                    aria-setsize={row.siblings}
                    aria-expanded={entry.kind === 'folder' ? expanded : undefined}
                    aria-selected={selected === entry.path}
                    tabIndex={focusPath === entry.path ? 0 : -1}
                    className={FILE_ROW_CLASS}
                    onFocus={() => setSelected(entry.path)}
                    onClick={() => focus(row)}
                    onDoubleClick={() => void open(row)}
                    onKeyDown={(event) => onKeyDown(event, row, index)}
                  >
                    <Table.Cell className="relative">
                      {ancestors.map((ancestor, depth) => (
                        <span
                          key={ancestor.path}
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0 border-l border-kumo-line"
                          style={{ left: 24 + depth * 24 }}
                        />
                      ))}
                      <div
                        className="flex min-w-0 items-center gap-2"
                        style={{ paddingLeft: ancestors.length * 24 }}
                      >
                        {entry.kind === 'folder' ? (
                          <IconButton
                            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${entry.name}`}
                            aria-expanded={expanded}
                            variant="ghost"
                            size="xs"
                            className="size-6 shrink-0"
                            disabled={Boolean(filter)}
                            icon={
                              expanded ? (
                                <CaretDownIcon aria-hidden size={12} />
                              ) : (
                                <CaretRightIcon aria-hidden size={12} />
                              )
                            }
                            onClick={(event) => {
                              event.stopPropagation()
                              tree.toggle(entry.path)
                              focus(row)
                            }}
                            onDoubleClick={(event) => event.stopPropagation()}
                          />
                        ) : (
                          <span aria-hidden className="w-6 shrink-0" />
                        )}
                        <span className="shrink-0">
                          <FileEntryIcon entry={row.entry} expanded={row.expanded} />
                        </span>
                        <span
                          title={entry.name}
                          className={cn('truncate', entry.kind === 'folder' && 'font-medium')}
                        >
                          {entry.name}
                        </span>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap text-kumo-subtle">
                      <time
                        dateTime={new Date(entry.mtime).toISOString()}
                        title={new Date(entry.mtime).toLocaleString('en-GB')}
                      >
                        {formatModified(entry.mtime)}
                      </time>
                    </Table.Cell>
                    <Table.Cell className="truncate text-kumo-subtle">{fileType(entry)}</Table.Cell>
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
                              aria-label={`Actions for ${entry.name}`}
                            />
                          }
                        />
                        <DropdownMenu.Content>
                          <DropdownMenu.Item onClick={() => void open(row)}>Open</DropdownMenu.Item>
                          <DropdownMenu.Item onClick={() => void reveal(row)}>
                            {revealLabel()}
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu>
                    </Table.Cell>
                  </Table.Row>
                  {branchMessage ? (
                    <Table.Row className="even:bg-transparent">
                      <Table.Cell colSpan={4}>
                        <div
                          role={branch?.error ? 'alert' : 'status'}
                          className="flex items-center gap-2 py-1 text-kumo-subtle"
                          style={{ paddingLeft: (ancestors.length + 1) * 24 + 32 }}
                        >
                          {branch?.error ? (
                            <>
                              <WarningCircleIcon aria-hidden size={16} />
                              <span>{branch.error}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void tree.load(entry.path)}
                              >
                                Try again
                              </Button>
                            </>
                          ) : branch?.entries ? (
                            'Empty folder'
                          ) : (
                            <>
                              <Loader />
                              Loading…
                            </>
                          )}
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  ) : null}
                </Fragment>
              )
            })
          )}
        </Table.Body>
      </Table>
    </FileBrowserFrame>
  )
}
