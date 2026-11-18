import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  useTable,
  type RowData,
  type SortingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import styles from './DataTable.module.css'

/** Search and sort happen in the browser (D10), with TanStack Table rather than hand-rolled code. */
export const tableSetup = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  // `text` (case-insensitive) is what automatic sorting picks for string columns. Columns that can be
  // empty name it themselves: automatic sorting looks only at the first rows, and if those are all empty
  // it falls back to `basic`, which doesn't order empty values consistently.
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, text: sortFn_text },
})

/** Above this many rows, only the rows in view are drawn, so search and sort stay quick (R56). */
const VIRTUAL_FROM = 200
const ROW_HEIGHT = 48

/** Column helper for a table of `T`. Define columns at module scope so they stay stable. */
export const columnHelper = <T extends RowData>() => createColumnHelper<typeof tableSetup, T>()

type Props<T> = {
  data: T[] | undefined
  // The column helper's output; typed loosely so each feature can mix value types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: any[]
  /** Plural noun for messages: "organizations". */
  noun: string
  addLabel: string
  onAdd: () => void
  getRowId: (row: T) => string
  /** Extra controls between the search box and the add button, such as the status filter (R23). */
  toolbar?: ReactNode
  error?: unknown
  /** The sort to start with; the user can change it by clicking a heading (R20). */
  initialSort?: SortingState
}

/** A white panel with search, the add button and a sortable table (R19–R25, D18). */
export function DataTable<T extends RowData>({ data, columns, noun, addLabel, onAdd, getRowId, toolbar, error, initialSort = [] }: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort)
  const [search, setSearch] = useState('')
  const rows = data ?? EMPTY
  const table = useTable({
    features: tableSetup,
    columns,
    data: rows as T[],
    getRowId,
    state: { sorting, globalFilter: search },
    onSortingChange: setSorting,
    onGlobalFilterChange: setSearch,
    globalFilterFn: 'includesString',
    // Search every text column, even when a value is empty in the first row (R19).
    getColumnCanGlobalFilter: (column) => (column.columnDef as { enableGlobalFilter?: boolean }).enableGlobalFilter !== false,
    enableSortingRemoval: false,
    sortDescFirst: false,
  })
  const visible = table.getRowModel().rows
  const searchId = `search-${noun}`

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtual = visible.length > VIRTUAL_FROM
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    enabled: virtual,
    initialRect: { width: 1200, height: 800 },
  })
  const items = virtual ? virtualizer.getVirtualItems() : null
  const shown = items ? items.map((i) => ({ row: visible[i.index], index: i.index })) : visible.map((row, index) => ({ row, index }))
  const padTop = items?.length ? items[0].start : 0
  const padBottom = items?.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0
  const columnCount = table.getAllLeafColumns().length

  return (
    <section className={`panel ${styles.panel}`}>
      <div className={styles.toolbar}>
        <div className="search">
          <Search size={16} aria-hidden />
          <label htmlFor={searchId} className="visually-hidden">
            Search {noun}
          </label>
          <input
            id={searchId}
            className="input"
            type="search"
            placeholder={`Search ${noun}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {toolbar}
        <button type="button" className={`btn btn-primary ${styles.add}`} onClick={onAdd}>
          <Plus size={16} aria-hidden />
          {addLabel}
        </button>
      </div>

      {error ? (
        <div className="empty" role="alert">
          Couldn't load {noun}. Refresh the page to try again.
        </div>
      ) : data === undefined ? (
        <div className="empty">Loading {noun}…</div>
      ) : visible.length === 0 ? (
        <div className="empty">
          <p>{rows.length === 0 ? `No ${noun} yet.` : `No ${noun} match “${search}”.`}</p>
          <button type="button" className="btn btn-quiet" onClick={onAdd}>
            <Plus size={16} aria-hidden />
            {addLabel}
          </button>
        </div>
      ) : (
        <div className={styles.scroll} ref={scrollRef}>
          {/* When virtualized, the row count and indexes keep screen readers' "row 512 of 1,000" right. */}
          <table className={styles.table} aria-rowcount={virtual ? visible.length + 1 : undefined}>
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => {
                    const sorted = header.column.getIsSorted()
                    const canSort = header.column.getCanSort()
                    const meta = header.column.columnDef.meta as { align?: 'right' } | undefined
                    return (
                      <th
                        key={header.id}
                        aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                        className={meta?.align === 'right' ? styles.right : undefined}
                      >
                        {canSort ? (
                          <button type="button" className={styles.sort} onClick={header.column.getToggleSortingHandler()}>
                            <table.FlexRender header={header} />
                            {sorted === 'asc' ? (
                              <ArrowUp size={14} aria-hidden />
                            ) : sorted === 'desc' ? (
                              <ArrowDown size={14} aria-hidden />
                            ) : (
                              <ArrowUpDown size={14} aria-hidden className={styles.idle} />
                            )}
                          </button>
                        ) : (
                          <table.FlexRender header={header} />
                        )}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {padTop > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={columnCount} style={{ height: padTop, padding: 0, boxShadow: 'none' }} />
                </tr>
              )}
              {shown.map(({ row, index }) => (
                <tr key={row.id} aria-rowindex={virtual ? index + 2 : undefined}>
                  {row.getAllCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as { align?: 'right' } | undefined
                    return (
                      <td key={cell.id} className={meta?.align === 'right' ? styles.right : undefined}>
                        <table.FlexRender cell={cell} />
                      </td>
                    )
                  })}
                </tr>
              ))}
              {padBottom > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={columnCount} style={{ height: padBottom, padding: 0, boxShadow: 'none' }} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

const EMPTY: never[] = []
