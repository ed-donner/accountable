import {
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type Row,
  type RowData,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, Pencil, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";

import { useAddress, type AddressChange } from "../lib/useAddress";
import { EmptyState } from "./EmptyState";

export const PAGE_SIZE = 50;

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

export type TableColumn<T> = {
  id: string;
  header: string;
  /** The value shown and searched. Blank values sort last in both directions. */
  value: (row: T) => string | number | null | undefined;
  /** Whether search looks in this column. */
  searchable?: boolean;
  /** Replaces the value when sorting, for orders that aren't alphabetical. */
  sortValue?: (row: T) => number;
  cell?: (row: T) => ReactNode;
  numeric?: boolean;
  /** Tailwind width for columns that need less room than they'd take. */
  width?: string;
};

type Props<T extends RowData> = {
  /** Singular and plural words for the messages, such as "organization". */
  noun: string;
  rows: T[] | undefined;
  columns: TableColumn<T>[];
  defaultSort: { id: string; desc: boolean };
  rowId: (row: T) => number;
  rowName: (row: T) => string;
  rowHref: (row: T) => string;
  onAdd: () => void;
  onEdit: (row: T) => void;
  onDelete: (row: T) => void;
  /** Filters that sit beside the search box, already applied to rows. */
  filters?: (update: (change: AddressChange) => void) => ReactNode;
  /** True when rows is narrowed by those filters. */
  filtered?: boolean;
  /** Address settings to clear along with the search. */
  clearParams?: string[];
};

function compare(a: string | number, b: string | number) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en", { sensitivity: "base", numeric: true });
}

function blankToUndefined<V>(value: V | null | undefined | ""): V | undefined {
  return value === null || value === "" ? undefined : (value as V | undefined);
}

export function DataTable<T extends RowData>({
  noun,
  rows,
  columns,
  defaultSort,
  rowId,
  rowName,
  rowHref,
  onAdd,
  onEdit,
  onDelete,
  filters,
  filtered = false,
  clearParams = [],
}: Props<T>) {
  const navigate = useNavigate();
  const { params, latest, update } = useAddress();

  function readSort(address: URLSearchParams) {
    const id = address.get("sort");
    return id && columns.some((column) => column.id === id)
      ? { id, desc: address.get("dir") === "desc" }
      : defaultSort;
  }

  function readPage(address: URLSearchParams) {
    return Math.max(1, Number.parseInt(address.get("page") ?? "1", 10) || 1);
  }

  const search = params.get("q") ?? "";
  const sort = readSort(params);
  const page = readPage(params);

  // The box keeps its own text, because the address updates a moment later and a
  // box fed from it would drop whatever was typed in between. It follows the
  // address only when something else changed it: Clear search, back or forward.
  const [searchText, setSearchText] = useState(search);
  useEffect(() => {
    if (search === (latest.current.get("q") ?? "")) setSearchText(search);
  }, [search, latest]);

  /** Ascending, then descending. A further click never clears the sort. */
  function toggleSort(id: string) {
    const current = readSort(latest.current);
    const desc = current.id === id ? !current.desc : false;
    update((address) => {
      address.set("sort", id);
      address.set("dir", desc ? "desc" : "asc");
      address.delete("page");
    });
  }

  function setSearch(value: string) {
    setSearchText(value);
    update((next) => {
      if (value) next.set("q", value);
      else next.delete("q");
      next.delete("page");
    });
  }

  function clearSearch() {
    update((next) => {
      next.delete("q");
      next.delete("page");
      clearParams.forEach((name) => next.delete(name));
    });
  }

  const columnDefs = useMemo(
    () =>
      columns.map((column) => ({
        id: column.id,
        header: column.header,
        accessorFn: (row: T) => blankToUndefined(column.value(row)),
        sortUndefined: "last" as const,
        sortDescFirst: false,
        sortFn: column.sortValue
          ? (a: Row<typeof features, T>, b: Row<typeof features, T>) =>
              column.sortValue!(a.original) - column.sortValue!(b.original)
          : (a: Row<typeof features, T>, b: Row<typeof features, T>, id: string) =>
              compare(a.getValue<string | number>(id), b.getValue<string | number>(id)),
      })),
    [columns],
  );

  const searchable = useMemo(
    () => new Set(columns.filter((column) => column.searchable).map((column) => column.id)),
    [columns],
  );

  const data = useMemo(() => rows ?? [], [rows]);

  const table = useTable({
    features,
    columns: columnDefs,
    data,
    getRowId: (row) => String(rowId(row)),
    autoResetPageIndex: false,
    globalFilterFn: "includesString",
    getColumnCanGlobalFilter: (column) => searchable.has(column.id),
    state: {
      sorting: [sort],
      globalFilter: search,
      pagination: { pageIndex: page - 1, pageSize: PAGE_SIZE },
    },
    onGlobalFilterChange: () => undefined,
    onPaginationChange: (updater) => {
      const current = { pageIndex: readPage(latest.current) - 1, pageSize: PAGE_SIZE };
      const next = typeof updater === "function" ? updater(current) : updater;
      update((address) => {
        if (next.pageIndex > 0) address.set("page", String(next.pageIndex + 1));
        else address.delete("page");
      });
    },
  });

  const matching = table.getFilteredRowModel().rows.length;
  const lastPage = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const visible = table.getRowModel().rows;
  const first = (page - 1) * PAGE_SIZE + 1;

  const cells = new Map(columns.map((column) => [column.id, column]));

  return (
    <div className="flex flex-col gap-2.5 px-5 pb-4">
      <div className="flex items-center gap-3">
        <div className="relative w-[320px]">
          <Search size={16} aria-hidden="true" className="absolute top-[11px] left-3 text-muted" />
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${noun === "activity" ? "activities" : `${noun}s`}`}
            aria-label={`Search ${noun}s`}
            className="input bg-panel pl-9"
          />
        </div>
        {filters?.(update)}
      </div>

      <div className="panel p-2">
        {rows !== undefined && rows.length === 0 && !search && !filtered && (
          <EmptyState message={`No ${noun}s yet. Add the first one.`}>
            <button type="button" className="btn btn-primary" onClick={onAdd}>
              Add {noun}
            </button>
          </EmptyState>
        )}

        {rows !== undefined && matching === 0 && (search !== "" || filtered) && (
          <EmptyState message={`No ${noun}s match.`}>
            <button type="button" className="btn btn-secondary" onClick={clearSearch}>
              Clear search
            </button>
          </EmptyState>
        )}

        {rows === undefined && <div className="h-40" aria-busy="true" />}

        {matching > 0 && (
          <table className="w-full table-fixed border-separate border-spacing-0">
            <thead>
              <tr>
                {table.getHeaderGroups()[0].headers.map((header) => {
                  const column = cells.get(header.column.id)!;
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className={`h-9 px-2.5 text-[13px] font-semibold ${column.numeric ? "text-right" : "text-left"} ${column.width ?? ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(column.id)}
                        className={`inline-flex items-center gap-1 rounded ${column.numeric ? "flex-row-reverse" : ""}`}
                      >
                        {column.header}
                        {sorted === "asc" && <ArrowUp size={13} aria-hidden="true" />}
                        {sorted === "desc" && <ArrowDown size={13} aria-hidden="true" />}
                      </button>
                    </th>
                  );
                })}
                <th scope="col" className="w-[84px]">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => navigate(rowHref(row.original))}
                  className="group h-11 cursor-pointer hover:bg-page"
                >
                  {row.getAllCells().map((cell, index) => {
                    const column = cells.get(cell.column.id)!;
                    const shown = column.cell ? column.cell(row.original) : (column.value(row.original) ?? "");
                    return (
                      <td
                        key={cell.id}
                        className={`truncate px-2.5 first:rounded-l-[10px] ${column.numeric ? "num text-right text-[13px]" : ""}`}
                      >
                        {index === 0 ? (
                          <Link
                            to={rowHref(row.original)}
                            onClick={(event) => event.stopPropagation()}
                            className="block truncate rounded font-medium"
                          >
                            {shown}
                          </Link>
                        ) : (
                          shown
                        )}
                      </td>
                    );
                  })}
                  <td className="rounded-r-[10px] pr-1 text-right whitespace-nowrap">
                    <button
                      type="button"
                      aria-label={`Edit ${rowName(row.original)}`}
                      className="icon-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEdit(row.original);
                      }}
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${rowName(row.original)}`}
                      className="icon-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(row.original);
                      }}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {matching > PAGE_SIZE && (
          <div className="flex items-center justify-end gap-3 px-2.5 pt-2.5 pb-1">
            <span className="num text-[13px] text-muted">
              {first}-{Math.min(first + PAGE_SIZE - 1, matching)} of {matching}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page <= 1}
              onClick={() => table.previousPage()}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page >= lastPage}
              onClick={() => table.nextPage()}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
