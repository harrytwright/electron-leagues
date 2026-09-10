import { BrowserError } from '../FileBrowser/components/BrowserError'
import { BrowserLoading } from '../FileBrowser/components/BrowserLoading'
import { BrowserEmpty } from '../FileBrowser/components/BrowserEmpty'
import { BrowserNoMatches } from '../FileBrowser/components/BrowserNoMatches'
import { BrowserMessageRow } from '../FileBrowser/components/BrowserMessageRow'
import { FileActionsMenu } from '../FileBrowser/components/FileActionsMenu'
import { FileActionsButton } from '../FileBrowser/components/FileActionsButton'
import { FileModified } from '../FileBrowser/components/FileModified'
import { useFileActions } from '@renderer/hooks/use-file-actions'
import { useFileSelection } from '@renderer/hooks/use-file-selection'
import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { Button, cn, Loader, Table } from '@cloudflare/kumo'
import { ArrowDownIcon } from '@phosphor-icons/react/dist/csr/ArrowDown'
import { ArrowUpIcon } from '@phosphor-icons/react/dist/csr/ArrowUp'
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown'
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight'
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle'
import { IconButton } from '../IconButton'
import { FileBrowserFrame } from '../FileBrowser/components/FileBrowserFrame'
import { FileEntryIcon } from '../FileBrowser/components/FileEntryIcon'
import { fileType } from '../FileBrowser/file-type'
import { FILE_ROW_CLASS, FILE_TABLE_CLASS } from '../FileBrowser/styles'
import { fileRows } from './file-tree'
import type { FileRow, Props, SortColumn } from './interface'
import { revealLabel } from '@renderer/lib/reveal-label'
import { useRowActionsMenu } from '@renderer/hooks/use-row-actions-menu'
import type { RowMenuItem } from '../FileBrowser/row'

export function TreeFileBrowser({
  currentDir,
  name,
  listing,
  tree,
  sort,
  onSortChange,
  readOnly,
  onNavigate,
  consumeFocusRequest,
  onDropFiles,
  onBack
}: Props): React.JSX.Element {
  const [queryState, setQueryState] = useState({ dir: currentDir, value: '' })
  if (queryState.dir !== currentDir) setQueryState({ dir: currentDir, value: '' })
  const query = queryState.dir === currentDir ? queryState.value : ''
  const setQuery = (value: string): void => setQueryState({ dir: currentDir, value })
  const instructions = useId()
  // Explicit row names exclude the action button's label from selection announcements.
  const rowNames = useId()
  const filterRef = useRef<HTMLInputElement>(null)
  // rowMenu.target has already been cleared when the close effect restores focus.
  const menuTarget = useRef<string | null>(null)
  const { openFile, revealFile } = useFileActions()
  const filter = query.trim().toLocaleLowerCase()
  const rows = fileRows(listing.entries ?? [], tree.branches, tree.expanded, sort, filter)
  const rowMenu = useRowActionsMenu(rows.map((row) => row.entry.path))
  const selection = useFileSelection(
    currentDir,
    rows.map((row) => row.entry.path)
  )
  const selectedRow = rows.find((row) => row.entry.path === selection.selected)
  const folderCount = listing.entries?.filter((entry) => entry.kind === 'folder').length ?? 0
  const fileCount = (listing.entries?.length ?? 0) - folderCount

  useEffect(() => {
    if (listing.entries !== null && consumeFocusRequest?.(currentDir)) {
      selection.focusFirstRow()
    }
  }, [consumeFocusRequest, currentDir, listing.entries, selection])

  const focus = (row: FileRow | undefined): void => {
    if (row) selection.focus(row.entry.path)
  }

  const open = async (row: FileRow, focusFirstRow = false): Promise<void> => {
    if (row.entry.kind === 'folder') {
      onNavigate([...row.ancestors, row.entry], focusFirstRow)
      return
    }
    await openFile(row.entry.path)
  }

  const actions = (row: FileRow | undefined): RowMenuItem[] =>
    row
      ? [
          { label: 'Open', onSelect: () => void open(row) },
          { label: revealLabel(), onSelect: () => void revealFile(row.entry.path) }
        ]
      : []

  const openContextMenu = (
    event: React.MouseEvent<HTMLTableRowElement> | React.KeyboardEvent<HTMLTableRowElement>,
    row: FileRow
  ): void => {
    event.preventDefault()
    selection.focus(row.entry.path)
    menuTarget.current = row.entry.path
    const bounds = event.currentTarget.getBoundingClientRect()
    const pointer = 'clientX' in event && event.clientX > 0
    rowMenu.openAt(
      row.entry.path,
      pointer
        ? { left: event.clientX, top: event.clientY }
        : { left: bounds.right - 24, top: bounds.top }
    )
  }

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLTableRowElement>,
    row: FileRow,
    index: number
  ): void => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      openContextMenu(event, row)
      return
    }
    switch (event.key) {
      case 'ArrowRight':
        if (row.entry.kind === 'folder' && !filter) {
          if (!row.expanded) tree.toggle(row.entry.path)
          else if (rows[index + 1]?.ancestors.at(-1)?.path === row.entry.path)
            focus(rows[index + 1])
        }
        break
      case 'ArrowLeft':
        if (row.entry.kind === 'folder' && row.expanded && !filter) tree.toggle(row.entry.path)
        else {
          const parent = row.ancestors.at(-1)
          if (parent) selection.focus(parent.path)
        }
        break
      default:
        selection.onKeyDown(event, index, () => void open(row, true))
        return
    }
    event.preventDefault()
  }

  const sortBy = (column: SortColumn): void => {
    onSortChange({
      column,
      direction:
        sort.column === column && sort.direction === 'ascending' ? 'descending' : 'ascending'
    })
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
      filterRef={filterRef}
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
            <BrowserMessageRow level={1}>
              {listing.error ? (
                <BrowserError message={listing.error} onRetry={refresh} onBack={onBack} />
              ) : listing.entries === null ? (
                <BrowserLoading />
              ) : filter ? (
                <BrowserNoMatches
                  title="No matching files"
                  description="Only loaded folders are included. Try a different name or clear the filter."
                  onClear={() => setQuery('')}
                />
              ) : (
                <BrowserEmpty
                  title="This folder is empty"
                  description={
                    readOnly ? undefined : 'Drop files here or use Add files to import them.'
                  }
                />
              )}
            </BrowserMessageRow>
          ) : (
            rows.map((row, index) => {
              const { entry, ancestors, expanded } = row
              const nameId = `${rowNames}-${index}-name`
              const branch = tree.branches.get(entry.path)
              const branchMessage =
                expanded &&
                entry.kind === 'folder' &&
                (!branch?.entries || branch.entries.length === 0)
              return (
                <Fragment key={entry.path}>
                  <Table.Row
                    {...selection.rowProps(entry.path)}
                    aria-level={ancestors.length + 1}
                    aria-labelledby={nameId}
                    aria-posinset={row.position}
                    aria-setsize={row.siblings}
                    aria-expanded={entry.kind === 'folder' ? expanded : undefined}
                    className={FILE_ROW_CLASS}
                    onDoubleClick={() => void open(row)}
                    onContextMenu={(event) => openContextMenu(event, row)}
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
                            tabIndex={-1}
                            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${entry.name}`}
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
                          id={nameId}
                          title={entry.name}
                          className={cn('truncate', entry.kind === 'folder' && 'font-medium')}
                        >
                          {entry.name}
                        </span>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap text-kumo-subtle">
                      <FileModified
                        mtime={entry.mtime}
                        title={new Date(entry.mtime).toLocaleString('en-GB')}
                      />
                    </Table.Cell>
                    <Table.Cell className="truncate text-kumo-subtle">{fileType(entry)}</Table.Cell>
                    <FileActionsButton
                      name={entry.name}
                      menuId={rowMenu.id}
                      expanded={rowMenu.target === entry.path}
                      onClick={(event) => {
                        selection.focus(entry.path)
                        menuTarget.current = entry.path
                        const bounds = event.currentTarget.getBoundingClientRect()
                        rowMenu.openAt(entry.path, { left: bounds.right, top: bounds.bottom })
                      }}
                    />
                  </Table.Row>
                  {branchMessage ? (
                    <Table.Row aria-level={ancestors.length + 2} className="even:bg-transparent">
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
      <FileActionsMenu
        id={rowMenu.id}
        label={`Actions for ${rows.find((row) => row.entry.path === rowMenu.target)?.entry.name ?? 'file'}`}
        open={rowMenu.target !== null && rows.some((row) => row.entry.path === rowMenu.target)}
        anchor={rowMenu.anchor}
        actions={actions(rows.find((row) => row.entry.path === rowMenu.target))}
        onOpenChange={rowMenu.onOpenChange}
        onRestoreFocus={() => {
          if (selection.focus(menuTarget.current ?? undefined)) return
          if (selection.focusFirstRow()) return
          filterRef.current?.focus()
        }}
      />
    </FileBrowserFrame>
  )
}
