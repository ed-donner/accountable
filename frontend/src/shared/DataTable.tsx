import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn,
  type SortingFn,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2 } from "lucide-react";

export const PAGE_SIZE = 25;

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    numeric?: boolean;
    width?: string;
  }
}

type Props<T> = {
  data: T[];
  columns: ColumnDef<T, any>[];
  /** Singular and plural nouns, such as ["contact", "contacts"]. */
  noun: [string, string];
  rowName: (row: T) => string;
  onOpen: (row: T) => void;
  onEdit: (row: T) => void;
  onDelete: (row: T) => void;
  onAdd: () => void;
  addLabel: string;
  initialSort?: SortingState;
  /** Filters shown next to the search box, such as the status filter. */
  filters?: ReactNode;
  /** Shown instead of "No contacts yet." when a filter is on. */
  emptyMessage?: string;
};

/**
 * Text compares ignoring case, numbers as numbers, and empty values sort last in
 * both directions. TanStack flips the whole result for a descending sort, so the
 * empties' order is flipped first to cancel that out.
 */
const smartSort =
  (sorting: { current: SortingState }): SortingFn<unknown> =>
  (a, b, columnId) => {
    const x = a.getValue(columnId);
    const y = b.getValue(columnId);
    const xEmpty = x === null || x === undefined || x === "";
    const yEmpty = y === null || y === undefined || y === "";
    if (xEmpty || yEmpty) {
      const last = xEmpty === yEmpty ? 0 : xEmpty ? 1 : -1;
      return sorting.current.find((s) => s.id === columnId)?.desc ? -last : last;
    }
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x).localeCompare(String(y), undefined, { sensitivity: "base", numeric: true });
  };

const search: FilterFn<unknown> = (row, columnId, query: string) => {
  const value = row.getValue(columnId);
  return String(value ?? "").toLowerCase().includes(query.trim().toLowerCase());
};

/** Tables with search as you type, sorting, 25 rows a page and row actions (T1 to T5, T7). */
export function DataTable<T>({
  data,
  columns,
  noun,
  rowName,
  onOpen,
  onEdit,
  onDelete,
  onAdd,
  addLabel,
  initialSort = [],
  filters,
  emptyMessage,
}: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort);
  // TanStack keeps the first sorting function it's given, so it reads the current
  // direction through a ref rather than a stale copy.
  const sortingRef = useRef(sorting);
  sortingRef.current = sorting;
  const sortingFn = useMemo(() => smartSort(sortingRef), []);
  const [query, setQuery] = useState("");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZE });

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: query, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    globalFilterFn: search as FilterFn<T>,
    // Columns opt in with `enableGlobalFilter`. Without this, TanStack also drops any
    // column whose first row is empty, so one blank email would stop email search.
    getColumnCanGlobalFilter: () => true,
    defaultColumn: { sortingFn: sortingFn as SortingFn<T>, enableGlobalFilter: false },
    enableSortingRemoval: false,
    sortDescFirst: false,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const rows = table.getRowModel().rows;
  const first = pagination.pageIndex * PAGE_SIZE + 1;
  const last = Math.min(first + PAGE_SIZE - 1, filteredCount);
  const pageCount = Math.max(1, table.getPageCount());

  // Keep the page in range when rows go away, such as after a delete.
  const lastPage = pageCount - 1;
  if (pagination.pageIndex > lastPage) setPagination((p) => ({ ...p, pageIndex: lastPage }));

  const onSearch = (value: string) => {
    setQuery(value);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  };

  const empty = useMemo(() => {
    if (data.length === 0) {
      return (
        <div className="empty-state">
          <p>{emptyMessage ?? `No ${noun[1]} yet.`}</p>
          <button type="button" className="btn" onClick={onAdd}>
            <Plus size={16} aria-hidden="true" />
            {addLabel}
          </button>
        </div>
      );
    }
    return (
      <div className="empty-state">
        <p>No {noun[1]} match “{query.trim()}”.</p>
      </div>
    );
  }, [data.length, emptyMessage, noun, onAdd, addLabel, query]);

  return (
    <div className="panel table-panel">
      <div className="table-toolbar">
        <label className="search-box">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search {noun[1]}</span>
          <input type="search" placeholder={`Search ${noun[1]}`} value={query} onChange={(e) => onSearch(e.target.value)} />
        </label>
        {filters}
      </div>

      {rows.length === 0 ? (
        empty
      ) : (
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const numeric = header.column.columnDef.meta?.numeric;
                  return (
                    <th
                      key={header.id}
                      className={numeric ? "num" : undefined}
                      style={{ width: header.column.columnDef.meta?.width }}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    >
                      {header.column.getCanSort() ? (
                        <button type="button" className="sort" onClick={header.column.getToggleSortingHandler()}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" && <ArrowUp size={13} aria-hidden="true" />}
                          {sorted === "desc" && <ArrowDown size={13} aria-hidden="true" />}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
                <th className="actions-col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} onClick={() => onOpen(row.original)}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={cell.column.columnDef.meta?.numeric ? "num" : undefined}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
                <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Edit ${rowName(row.original)}`}
                    onClick={() => onEdit(row.original)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn danger"
                    aria-label={`Delete ${rowName(row.original)}`}
                    onClick={() => onDelete(row.original)}
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {filteredCount > 0 && (
        <div className="table-foot">
          <span className="muted">
            Showing {first} to {last} of {filteredCount}
          </span>
          {pageCount > 1 && (
            <div className="pager">
              <button
                type="button"
                className="icon-btn"
                aria-label="Previous page"
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="muted">
                Page {pagination.pageIndex + 1} of {pageCount}
              </span>
              <button
                type="button"
                className="icon-btn"
                aria-label="Next page"
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
