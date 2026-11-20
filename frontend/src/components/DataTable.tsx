import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import {
  createPaginatedRowModel,
  createSortedRowModel,
  FlexRender,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Pencil, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState, Placeholder } from "@/components/states";
import { countLine, pluralNoun } from "@/lib/format";
import { cn } from "@/lib/utils";

export const PAGE_SIZE = 50;

export type TableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** What the column sorts by. Text sorts ignoring capitals. */
  sortValue: (row: T) => string | number | null;
  /** Money, percentages and dates: right-aligned in JetBrains Mono (spec 2.5). */
  numeric?: boolean;
  className?: string;
};

type DataTableProps<T extends { id: number }> = {
  rows: T[] | undefined;
  columns: TableColumn<T>[];
  /** The fields the search box matches, any part, ignoring capitals (TBL-1). */
  searchFields: (row: T) => (string | null | undefined)[];
  searchLabel: string;
  /** A singular noun for the count line, such as "contact". */
  noun: string;
  initialSort: { id: string; desc: boolean };
  /** The record's page, for the name link and row clicks (TBL-5). */
  hrefOf: (row: T) => string;
  nameOf: (row: T) => string;
  onEdit: (row: T) => void;
  onDelete: (row: T) => void;
  /** Another filter that works with the search, such as the contact status (CON-2). */
  filter?: (row: T) => boolean;
  /** Shown above the table, beside the search box. */
  filters?: ReactNode;
  /** The Add button shown when there are no records at all (TBL-7). */
  emptyAction?: ReactNode;
};

function compare(a: string | number | null, b: string | number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en", { sensitivity: "base", numeric: true });
}

const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
});

/** One table for Organizations, Contacts and Deals (spec 1.2). */
export function DataTable<T extends { id: number }>({
  rows,
  columns,
  searchFields,
  searchLabel,
  noun,
  initialSort,
  hrefOf,
  nameOf,
  onEdit,
  onDelete,
  filter,
  filters,
  emptyAction,
}: DataTableProps<T>) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([initialSort]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZE });

  const all = useMemo(() => rows ?? [], [rows]);
  const needle = search.trim().toLowerCase();
  const shown = useMemo(
    () =>
      all.filter((row) => {
        if (filter && !filter(row)) return false;
        if (!needle) return true;
        return searchFields(row).some((value) => value?.toLowerCase().includes(needle));
      }),
    [all, filter, needle, searchFields],
  );

  // A new search or filter starts again from the first page. Resetting while
  // rendering, rather than in an effect, saves a render of the old page.
  const [pagedFor, setPagedFor] = useState({ needle, filter });
  if (pagedFor.needle !== needle || pagedFor.filter !== filter) {
    setPagedFor({ needle, filter });
    setPagination((current) => (current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }));
  }

  const columnDefs = useMemo<ColumnDef<typeof features, T, unknown>[]>(
    () =>
      columns.map((column) => ({
        id: column.id,
        accessorFn: (row: T) => column.sortValue(row),
        header: column.header,
        sortFn: (a, b) => compare(column.sortValue(a.original), column.sortValue(b.original)),
        cell: (info) => column.cell(info.row.original),
      })),
    [columns],
  );

  const table = useTable({
    features,
    columns: columnDefs,
    data: shown,
    state: { sorting, pagination },
    onSortingChange: (updater) => setSorting((old) => (typeof updater === "function" ? updater(old) : updater)),
    onPaginationChange: (updater) => setPagination((old) => (typeof updater === "function" ? updater(old) : updater)),
    // A heading click sorts by that column; a second click reverses it (TBL-2).
    enableSortingRemoval: false,
    sortDescFirst: false,
    getRowId: (row) => String(row.id),
  });

  const pageRows = table.getRowModel().rows;
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const loading = rows === undefined;

  function openRow(event: MouseEvent, row: T) {
    if ((event.target as HTMLElement).closest("a, button, input, [role=checkbox]")) return;
    navigate(hrefOf(row));
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-[320px]">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden
          />
          <Input
            type="search"
            aria-label={searchLabel}
            placeholder={searchLabel}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        {filters}
        <p className="ml-auto text-[13px] text-ink-muted" aria-live="polite">
          {loading ? " " : countLine(shown.length, all.length, noun)}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-panel shadow-soft">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b border-line">
                {group.headers.map((header) => {
                  const column = columns.find((c) => c.id === header.column.id)!;
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                      className={cn(
                        "h-12 px-4 text-[12px] font-medium text-ink-muted",
                        column.numeric ? "text-right" : "text-left",
                      )}
                    >
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          "inline-flex items-center gap-1 rounded hover:text-ink",
                          column.numeric && "flex-row-reverse",
                          sorted && "text-ink",
                        )}
                      >
                        <FlexRender header={header} />
                        {sorted === "asc" && <ArrowUp className="size-3.5" aria-hidden />}
                        {sorted === "desc" && <ArrowDown className="size-3.5" aria-hidden />}
                        {!sorted && <span className="size-3.5" aria-hidden />}
                      </button>
                    </th>
                  );
                })}
                <th className="w-24 px-4">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            ))}
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }, (_, index) => (
                <tr key={index} className="h-[52px] border-b border-line last:border-b-0">
                  {columns.map((column) => (
                    <td key={column.id} className="px-4">
                      <Placeholder className="h-4 w-3/4" />
                    </td>
                  ))}
                  <td />
                </tr>
              ))}
            {!loading &&
              pageRows.map((row) => (
                <tr
                  key={row.id}
                  onClick={(event) => openRow(event, row.original)}
                  className="h-[52px] cursor-pointer border-b border-line transition-colors duration-150 last:border-b-0 hover:bg-[#F5F8F9]"
                >
                  {row.getAllCells().map((cell) => {
                    const column = columns.find((c) => c.id === cell.column.id)!;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          "px-4 py-2 text-ink",
                          column.numeric && "text-right font-mono text-[13px] tabular",
                          column.className,
                        )}
                      >
                        <FlexRender cell={cell} />
                      </td>
                    );
                  })}
                  <td className="px-2 text-right whitespace-nowrap">
                    <RowButton label={`Edit ${nameOf(row.original)}`} onClick={() => onEdit(row.original)}>
                      <Pencil />
                    </RowButton>
                    <RowButton label={`Delete ${nameOf(row.original)}`} onClick={() => onDelete(row.original)}>
                      <Trash2 />
                    </RowButton>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        {!loading && all.length === 0 && <EmptyState title={`No ${pluralNoun(2, noun)} yet`}>{emptyAction}</EmptyState>}
        {!loading && all.length > 0 && shown.length === 0 && (
          <EmptyState
            title={
              needle
                ? `No ${pluralNoun(2, noun)} match "${search.trim()}"`
                : `No ${pluralNoun(2, noun)} match this filter`
            }
          />
        )}
      </div>

      {shown.length > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-3 text-[13px] text-ink-muted">
          <span>
            Page {pagination.pageIndex + 1} of {pageCount}
          </span>
          <Button
            variant="second"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft /> Previous
          </Button>
          <Button variant="second" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}

/** An icon button with a tooltip and a name for screen readers (TBL-4). */
function RowButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="icon" size="icon" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label.split(" ")[0]}</TooltipContent>
    </Tooltip>
  );
}

/** The record's name as a link, so a keyboard user can reach it (TBL-5). */
export function NameLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-medium text-ink hover:text-cerulean-text hover:underline">
      {children}
    </Link>
  );
}
