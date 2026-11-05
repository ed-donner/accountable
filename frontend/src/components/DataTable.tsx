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
  type Header,
  type Row,
  type RowData,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, Pencil, Search, Trash2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { Link, useNavigate } from "react-router";

import { useAddress, type AddressChange } from "../lib/useAddress";
import { EmptyState } from "./EmptyState";
import { LoadFailed } from "./LoadFailed";

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

/** A row's own button after Edit, such as Archive, in place of Delete or before it. */
export type RowAction = {
  /** What it does, such as "Archive". Screen readers hear it with the row's name. */
  label: string;
  icon: ReactNode;
  onClick: () => void;
};

/** Rows that stay out of the table until a box beside the search shows them, such as archived products. */
export type HiddenRows<T> = {
  which: (row: T) => boolean;
  /** The address setting that keeps the box ticked, such as "archived". */
  param: string;
  /** The box's label, before its count, such as "Show archived". */
  label: string;
  /** What shows when every row is hidden, such as "Every product is archived." */
  allHidden: string;
  /** What's added when only hidden rows match a search, such as "2 archived products match." */
  hiddenMatch: (count: number) => string;
};

/**
 * A filter whose usual view leaves rows out, such as Bills under Unpaid (E15), so a table
 * with none under it says so and offers All, rather than inviting a first record.
 */
export type FilterNote<T> = {
  /** Every row, before the filter. */
  all: T[] | undefined;
  /** What shows when no row is under the filter, such as "No unpaid bills." */
  none: string;
  /** The filter's words for a search with no matches, such as "unpaid bills". */
  words: string;
  /** What's added when rows match the search under All, such as "4 bills match under All." */
  matchUnderAll: (count: number) => string;
  /** The address change that shows All. */
  showAll: AddressChange;
};

/** What a page can ask of its table. */
export type TableHandle = {
  /** Such as when a dialog's save took the row it was opened from out of the table (Q3). */
  focusSearch: () => void;
};

/**
 * Each row has Edit, then its own button, Delete, or both in that order. Or a table gives
 * its rows no buttons, as quotes, which only open their page (Q33).
 */
type RowButtons<T> =
  | { onEdit: (row: T) => void; onDelete: (row: T) => void; rowAction?: (row: T) => RowAction }
  | { onEdit: (row: T) => void; rowAction: (row: T) => RowAction; onDelete?: (row: T) => void }
  | { onEdit?: never; onDelete?: never; rowAction?: never };

/** What a table says with no rows, in place of its usual words, as the Quotes table does (Q35). */
export type EmptyWords = {
  /** With no rows at all, such as "No quotes yet. Add the first one from an open deal." */
  none: string;
  /** The Add button's label there, such as "New quote". */
  add: string;
  /** With only the filter narrowing them away, such as "No expired quotes.", and the button that shows them all. */
  filtered?: { message: string; showAll: string };
};

type Props<T extends RowData> = RowButtons<T> & {
  /** Singular and plural words for the messages, such as "organization". */
  noun: string;
  rows: T[] | undefined;
  /** Why rows is undefined, if reading them failed. */
  error?: unknown;
  onRetry?: () => void;
  columns: TableColumn<T>[];
  defaultSort: { id: string; desc: boolean };
  rowId: (row: T) => number;
  rowName: (row: T) => string;
  rowHref: (row: T) => string;
  onAdd: () => void;
  /** Filters that sit beside the search box, already applied to rows. */
  filters?: (update: (change: AddressChange) => void) => ReactNode;
  /** What sits above the search box, such as the Quotes table's figures, which also filter it (Q34). */
  summary?: (update: (change: AddressChange) => void) => ReactNode;
  /** True when rows is narrowed by those filters. */
  filtered?: boolean;
  /** Address settings to clear along with the search. */
  clearParams?: string[];
  hidden?: HiddenRows<T>;
  empty?: EmptyWords;
  /** For a filter that's leaving rows out, already applied to rows. */
  filterNote?: FilterNote<T>;
  ref?: Ref<TableHandle>;
};

function compare(a: string | number, b: string | number) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en", { sensitivity: "base", numeric: true });
}

function blankToUndefined<V>(value: V | null | undefined | ""): V | undefined {
  return value === null || value === "" ? undefined : (value as V | undefined);
}

/** The table's own search, matched as TanStack's includesString does, for rows the table isn't holding. */
function matchesSearch<T>(row: T, columns: TableColumn<T>[], search: string) {
  const wanted = search.toLowerCase();
  return columns.some(
    (column) =>
      column.searchable &&
      String(column.value(row) ?? "")
        .toLowerCase()
        .includes(wanted),
  );
}

type SearchBoxProps = {
  noun: string;
  /** The search in the address. */
  search: string;
  /** The newest address asked for, which may not have landed yet. */
  latest: RefObject<URLSearchParams>;
  onChange: (text: string) => void;
  /** Lets the table move focus here. */
  ref: Ref<Focusable>;
};

type Focusable = { focus: () => void };

function SearchBox({ noun, search, latest, onChange, ref }: SearchBoxProps) {
  // The box keeps its own text, because the address updates a moment later and a
  // box fed from it would drop whatever was typed in between. It follows the
  // address only when something else changed it: Clear search, back or forward.
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = box.current;
    if (input && input.value !== search && search === (latest.current.get("q") ?? "")) input.value = search;
  }, [search, latest]);
  useImperativeHandle(ref, () => ({ focus: () => box.current?.focus() }), []);

  return (
    <div className="relative w-[320px]">
      <Search size={16} aria-hidden="true" className="absolute top-[11px] left-3 text-muted" />
      <input
        ref={box}
        type="search"
        defaultValue={search}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`Search ${noun === "activity" ? "activities" : `${noun}s`}`}
        aria-label={`Search ${noun}s`}
        className="input bg-panel pl-9"
      />
    </div>
  );
}

function ShowHiddenBox({
  label,
  count,
  shown,
  onChange,
}: {
  label: string;
  count: number;
  shown: boolean;
  onChange: (shown: boolean) => void;
}) {
  // The box keeps its own tick, because the address updates a moment later and a box
  // fed from it would untick in between. It follows the address when something else
  // changes it, such as a button that shows the hidden rows, or back and forward.
  const [ticked, setTicked] = useState(shown);
  const [followed, setFollowed] = useState(shown);
  if (shown !== followed) {
    setFollowed(shown);
    setTicked(shown);
  }

  return (
    <label className="flex h-[38px] items-center gap-2 font-medium whitespace-nowrap">
      <input
        type="checkbox"
        className="tick"
        checked={ticked}
        onChange={(event) => {
          setTicked(event.target.checked);
          onChange(event.target.checked);
        }}
      />
      {`${label} (${count})`}
    </label>
  );
}

/** What a table with hidden rows says when they're all it would show. */
type HiddenNote = { allHidden: string; matching: string | null; showLabel: string; onShow: () => void };

/** What a table says when its filter leaves out every row it would show. */
type FilteredNote = {
  none: string;
  /** What a search with no matches says, or null with no search. */
  noMatch: string | null;
  /** How many match under All, or null if none do. */
  matching: string | null;
  showLabel: string;
  onShow: () => void;
};

type NoRowsProps = {
  noun: string;
  rows: unknown[] | undefined;
  error: unknown;
  matching: number;
  searching: boolean;
  /** True when a search or filter is narrowing the rows. */
  narrowed: boolean;
  hiddenNote: HiddenNote | null;
  filteredNote: FilteredNote | null;
  empty?: EmptyWords;
  onAdd: () => void;
  onClear: () => void;
};

function FilteredOut({ note, onClear }: { note: FilteredNote; onClear: () => void }) {
  const showAll = (
    <button type="button" className="btn btn-secondary" onClick={note.onShow}>
      {note.showLabel}
    </button>
  );
  if (!note.noMatch) return <EmptyState message={note.none}>{showAll}</EmptyState>;
  return (
    <EmptyState message={[note.noMatch, note.matching].filter(Boolean).join(" ")}>
      <div className="flex gap-2">
        <button type="button" className="btn btn-secondary" onClick={onClear}>
          Clear search
        </button>
        {note.matching && showAll}
      </div>
    </EmptyState>
  );
}

/** What shows in place of rows: a space while loading, an invitation, or that nothing matches. */
function NoRows({ noun, rows, error, matching, hiddenNote, filteredNote, empty, onAdd, ...narrowing }: NoRowsProps) {
  if (rows === undefined) return error ? null : <div className="h-40" aria-busy="true" />;
  if (matching > 0) return null;
  if (filteredNote) return <FilteredOut note={filteredNote} onClear={narrowing.onClear} />;
  if (narrowing.narrowed) return <NothingMatches noun={noun} hiddenNote={hiddenNote} empty={empty} {...narrowing} />;
  if (rows.length > 0) {
    return (
      hiddenNote && (
        <EmptyState message={hiddenNote.allHidden}>
          <ShowHidden note={hiddenNote} />
        </EmptyState>
      )
    );
  }
  return (
    <EmptyState message={empty?.none ?? `No ${noun}s yet. Add the first one.`}>
      <button type="button" className="btn btn-primary" onClick={onAdd}>
        {empty?.add ?? `Add ${noun}`}
      </button>
    </EmptyState>
  );
}

function ShowHidden({ note }: { note: HiddenNote }) {
  return (
    <button type="button" className="btn btn-secondary" onClick={note.onShow}>
      {note.showLabel}
    </button>
  );
}

type NothingMatchesProps = Pick<NoRowsProps, "noun" | "searching" | "hiddenNote" | "empty" | "onClear">;

/** A search or filter that leaves no rows. A filter alone can have the table's own words, such as "No expired quotes." */
function NothingMatches({ noun, searching, hiddenNote, empty, onClear }: NothingMatchesProps) {
  if (!searching && empty?.filtered) {
    return (
      <EmptyState message={empty.filtered.message}>
        <button type="button" className="btn btn-secondary" onClick={onClear}>
          {empty.filtered.showAll}
        </button>
      </EmptyState>
    );
  }
  return (
    <EmptyState message={[`No ${noun}s match.`, hiddenNote?.matching].filter(Boolean).join(" ")}>
      <div className="flex gap-2">
        <button type="button" className="btn btn-secondary" onClick={onClear}>
          Clear search
        </button>
        {hiddenNote?.matching && <ShowHidden note={hiddenNote} />}
      </div>
    </EmptyState>
  );
}

/**
 * Hidden rows stay out of what the table holds until the box is ticked, and their
 * matches for the search are counted, for when they're all that match (G6, G7).
 */
function useHiddenRows<T>(
  rows: T[] | undefined,
  hidden: HiddenRows<T> | undefined,
  params: URLSearchParams,
  columns: TableColumn<T>[],
  search: string,
) {
  const shown = hidden === undefined || params.has(hidden.param);
  const held = useMemo(
    () => (rows && hidden && !shown ? rows.filter((row) => !hidden.which(row)) : (rows ?? [])),
    [rows, hidden, shown],
  );
  const hiddenRows = useMemo(() => (rows && hidden ? rows.filter(hidden.which) : []), [rows, hidden]);
  const hiddenMatches = shown ? 0 : hiddenRows.filter((row) => matchesSearch(row, columns, search)).length;
  return { shown, held, hiddenCount: hiddenRows.length, hiddenMatches };
}

/**
 * What a filter that's leaving rows out says (E15), once there are rows under All to show.
 * With none at all, the table invites the first one as usual.
 */
function useFilteredNote<T>(
  filterNote: FilterNote<T> | undefined,
  noun: string,
  columns: TableColumn<T>[],
  search: string,
  update: (change: AddressChange) => void,
): FilteredNote | null {
  const all = filterNote?.all;
  const matchingAll = useMemo(
    () => (all && search ? all.filter((row) => matchesSearch(row, columns, search)).length : 0),
    [all, columns, search],
  );
  if (!filterNote || !all || all.length === 0) return null;
  return {
    none: filterNote.none,
    noMatch: search ? `No ${filterNote.words} match "${search}".` : null,
    matching: matchingAll > 0 ? filterNote.matchUnderAll(matchingAll) : null,
    showLabel: `Show all ${noun}s`,
    onShow: () =>
      update((address) => {
        filterNote.showAll(address);
        address.delete("page");
      }),
  };
}

type PagerProps = {
  page: number;
  lastPage: number;
  matching: number;
  onPrevious: () => void;
  onNext: () => void;
};

function Pager({ page, lastPage, matching, onPrevious, onNext }: PagerProps) {
  const first = (page - 1) * PAGE_SIZE + 1;
  return (
    <div className="flex items-center justify-end gap-3 px-2.5 pt-2.5 pb-1">
      <span className="num text-[13px] text-muted">
        {first}-{Math.min(first + PAGE_SIZE - 1, matching)} of {matching}
      </span>
      <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={onPrevious}>
        Previous
      </button>
      <button type="button" className="btn btn-secondary" disabled={page >= lastPage} onClick={onNext}>
        Next
      </button>
    </div>
  );
}

/** A row's Edit and the buttons after it, in order, such as Archive and Delete. */
type Buttons = { onEdit: () => void; after: RowAction[] };

/** Room for Edit and one more button, or for two more, or none for rows with no buttons. */
function actionsWidth(onEdit?: unknown, rowAction?: unknown, onDelete?: unknown) {
  if (!onEdit) return undefined;
  return rowAction && onDelete ? "w-[116px]" : "w-[84px]";
}

/** The row's own button, then Delete, after Edit. */
function rowButtons<T>(row: T, rowAction?: (row: T) => RowAction, onDelete?: (row: T) => void): RowAction[] {
  const buttons = rowAction ? [rowAction(row)] : [];
  if (onDelete)
    buttons.push({ label: "Delete", icon: <Trash2 size={16} aria-hidden="true" />, onClick: () => onDelete(row) });
  return buttons;
}

type TableRowProps<T extends RowData> = {
  row: Row<typeof features, T>;
  cells: Map<string, TableColumn<T>>;
  href: string;
  name: string;
  /** None on a table whose rows only open their page. */
  buttons: Buttons | null;
  /** Called if this row leaves the table while it has focus, so focus is never left on nothing (Q3). */
  onLeaveWithFocus: () => void;
};

function TableRow<T extends RowData>({ row, cells, href, name, buttons, onLeaveWithFocus }: TableRowProps<T>) {
  const navigate = useNavigate();
  const element = useRef<HTMLTableRowElement>(null);

  // Runs as the row leaves, such as when Archive hides it, while it's still on the page.
  useLayoutEffect(() => {
    const current = element.current;
    return () => {
      if (current?.contains(document.activeElement)) onLeaveWithFocus();
    };
  }, [onLeaveWithFocus]);

  return (
    <tr ref={element} onClick={() => navigate(href)} className="group h-11 cursor-pointer hover:bg-page">
      {row.getAllCells().map((cell, index) => {
        const column = cells.get(cell.column.id)!;
        const shown = column.cell ? column.cell(row.original) : (column.value(row.original) ?? "");
        return (
          <td
            key={cell.id}
            className={`truncate px-2.5 first:rounded-l-[10px] last:rounded-r-[10px] ${column.numeric ? "num text-right text-[13px]" : ""}`}
          >
            {index === 0 ? (
              <Link
                to={href}
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
      {buttons && <RowButtonsCell name={name} {...buttons} />}
    </tr>
  );
}

function RowButtonsCell({ name, onEdit, after }: Buttons & { name: string }) {
  return (
    <td className="rounded-r-[10px] pr-1 text-right whitespace-nowrap">
      <button
        type="button"
        aria-label={`Edit ${name}`}
        className="icon-btn"
        onClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
      >
        <Pencil size={16} aria-hidden="true" />
      </button>
      {/* Kept in place by position, so a button that changes, such as Mark paid to Mark unpaid, keeps focus. */}
      {after.map((button, place) => (
        <button
          key={place}
          type="button"
          aria-label={`${button.label} ${name}`}
          className="icon-btn"
          onClick={(event) => {
            event.stopPropagation();
            button.onClick();
          }}
        >
          {button.icon}
        </button>
      ))}
    </td>
  );
}

type HeadingRowProps<T extends RowData> = {
  headers: Header<typeof features, T, unknown>[];
  cells: Map<string, TableColumn<T>>;
  /** The width of the column over the rows' buttons, or none if the rows have no buttons. */
  buttonsWidth?: string;
  onSort: (id: string) => void;
};

/** The column headings, each sorting the table, and an empty heading over the rows' buttons. */
function HeadingRow<T extends RowData>({ headers, cells, buttonsWidth, onSort }: HeadingRowProps<T>) {
  return (
    <thead>
      <tr>
        {headers.map((header) => {
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
                onClick={() => onSort(column.id)}
                className={`inline-flex items-center gap-1 rounded ${column.numeric ? "flex-row-reverse" : ""}`}
              >
                {column.header}
                {sorted === "asc" && <ArrowUp size={13} aria-hidden="true" />}
                {sorted === "desc" && <ArrowDown size={13} aria-hidden="true" />}
              </button>
            </th>
          );
        })}
        {buttonsWidth && (
          <th scope="col" className={buttonsWidth}>
            <span className="sr-only">Actions</span>
          </th>
        )}
      </tr>
    </thead>
  );
}

export function DataTable<T extends RowData>({
  noun,
  rows,
  error,
  onRetry = () => undefined,
  columns,
  defaultSort,
  rowId,
  rowName,
  rowHref,
  onAdd,
  onEdit,
  onDelete,
  rowAction,
  filters,
  filtered = false,
  clearParams = [],
  hidden,
  empty,
  summary,
  filterNote,
  ref,
}: Props<T>) {
  const { params, latest, update } = useAddress();
  const searchBox = useRef<Focusable>(null);
  useImperativeHandle(ref, () => ({ focusSearch: () => searchBox.current?.focus() }), []);

  // Once the row has gone, and only if the table is still here and nothing else took focus.
  const focusSearchBox = useCallback(
    () =>
      queueMicrotask(() => {
        if (document.activeElement === document.body) searchBox.current?.focus();
      }),
    [],
  );

  function readSort(address: URLSearchParams) {
    const id = address.get("sort");
    return id && columns.some((column) => column.id === id) ? { id, desc: address.get("dir") === "desc" } : defaultSort;
  }

  function readPage(address: URLSearchParams) {
    return Math.max(1, Number.parseInt(address.get("page") ?? "1", 10) || 1);
  }

  const search = params.get("q") ?? "";
  const sort = readSort(params);
  const page = readPage(params);
  const { shown, held, hiddenCount, hiddenMatches } = useHiddenRows(rows, hidden, params, columns, search);

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
    update((next) => {
      if (value) next.set("q", value);
      else next.delete("q");
      next.delete("page");
    });
  }

  /** Leaves the hidden rows' box as it was, because ticking it only ever adds rows. */
  function clearSearch() {
    update((next) => {
      next.delete("q");
      next.delete("page");
      clearParams.forEach((name) => next.delete(name));
    });
  }

  function showHidden(on: boolean) {
    if (!hidden) return;
    update((next) => {
      if (on) next.set(hidden.param, "1");
      else next.delete(hidden.param);
      next.delete("page");
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

  const table = useTable({
    features,
    columns: columnDefs,
    data: held,
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

  // Deleting the last row on the last page, or an old link, can leave the address
  // past the end, where there'd be no rows and no paging to get back with.
  useEffect(() => {
    if (rows === undefined || page <= lastPage) return;
    update((address) => {
      if (lastPage > 1) address.set("page", String(lastPage));
      else address.delete("page");
    });
  });

  const cells = new Map(columns.map((column) => [column.id, column]));

  function buttonsFor(row: T): Buttons | null {
    if (!onEdit) return null;
    return { onEdit: () => onEdit(row), after: rowButtons(row, rowAction, onDelete) };
  }

  const hiddenNote: HiddenNote | null =
    hidden && !shown && hiddenCount > 0
      ? {
          allHidden: hidden.allHidden,
          matching: hiddenMatches > 0 ? hidden.hiddenMatch(hiddenMatches) : null,
          showLabel: `${hidden.label} ${noun}s`,
          onShow: () => showHidden(true),
        }
      : null;

  const filteredNote = useFilteredNote(filterNote, noun, columns, search, update);

  return (
    <div className="flex flex-col gap-2.5 px-5 pb-4">
      {summary?.(update)}
      <div className="flex items-center gap-3">
        <SearchBox noun={noun} search={search} latest={latest} onChange={setSearch} ref={searchBox} />
        {hidden && <ShowHiddenBox label={hidden.label} count={hiddenCount} shown={shown} onChange={showHidden} />}
        {filters?.(update)}
      </div>

      <div className="panel p-2">
        <LoadFailed keeping={rows !== undefined} error={error} onRetry={onRetry} />
        <NoRows
          noun={noun}
          rows={rows}
          error={error}
          matching={matching}
          searching={search !== ""}
          narrowed={search !== "" || filtered}
          hiddenNote={hiddenNote}
          filteredNote={filteredNote}
          empty={empty}
          onAdd={onAdd}
          onClear={clearSearch}
        />

        {matching > 0 && (
          <table className="w-full table-fixed border-separate border-spacing-0">
            <HeadingRow
              headers={table.getHeaderGroups()[0].headers}
              cells={cells}
              buttonsWidth={actionsWidth(onEdit, rowAction, onDelete)}
              onSort={toggleSort}
            />
            <tbody>
              {visible.map((row) => (
                <TableRow
                  key={row.id}
                  row={row}
                  cells={cells}
                  href={rowHref(row.original)}
                  name={rowName(row.original)}
                  buttons={buttonsFor(row.original)}
                  onLeaveWithFocus={focusSearchBox}
                />
              ))}
            </tbody>
          </table>
        )}

        {matching > PAGE_SIZE && (
          <Pager
            page={page}
            lastPage={lastPage}
            matching={matching}
            onPrevious={() => table.previousPage()}
            onNext={() => table.nextPage()}
          />
        )}
      </div>
    </div>
  );
}
