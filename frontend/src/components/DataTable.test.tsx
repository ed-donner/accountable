import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router";

import { ApiError } from "../lib/api";
import { user } from "../test-utils";
import { DataTable, type TableColumn } from "./DataTable";

type Row = { id: number; name: string; city: string | null; stage: string; amount: number | null };

const STAGE_ORDER = ["new", "qualified", "won"];

const COLUMNS: TableColumn<Row>[] = [
  { id: "name", header: "Name", value: (row) => row.name, searchable: true },
  { id: "city", header: "City", value: (row) => row.city, searchable: true },
  {
    id: "stage",
    header: "Stage",
    value: (row) => row.stage,
    searchable: true,
    sortValue: (row) => STAGE_ORDER.indexOf(row.stage),
  },
  { id: "amount", header: "Amount", value: (row) => row.amount, numeric: true },
];

const ROWS: Row[] = [
  { id: 1, name: "Bravo", city: "Oslo", stage: "won", amount: 30 },
  { id: 2, name: "alpha", city: null, stage: "new", amount: 10 },
  { id: 3, name: "Charlie", city: "Lima", stage: "qualified", amount: null },
];

function many(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Row ${String(index + 1).padStart(3, "0")}`,
    city: index === 74 ? "Quito" : "Oslo",
    stage: "new",
    amount: index,
  }));
}

function Address() {
  const location = useLocation();
  return <output data-testid="address">{location.search}</output>;
}

function show(rows: Row[] | undefined, address = "/", extra = {}) {
  const handlers = { onAdd: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() };
  render(
    <MemoryRouter initialEntries={[address]}>
      <DataTable
        noun="thing"
        rows={rows}
        columns={COLUMNS}
        defaultSort={{ id: "name", desc: false }}
        rowId={(row) => row.id}
        rowName={(row) => row.name}
        rowHref={(row) => `/things/${row.id}`}
        {...handlers}
        {...extra}
      />
      <Address />
    </MemoryRouter>,
  );
  return handlers;
}

function names() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
}

function address() {
  return screen.getByTestId("address").textContent;
}

async function sortBy(header: string) {
  await user().click(screen.getByRole("button", { name: header }));
}

describe("search", () => {
  it("ignores case", async () => {
    show(ROWS);
    await user().type(screen.getByRole("searchbox"), "BRAV");
    expect(names()).toEqual(["Bravo"]);
  });

  it("matches any text column", async () => {
    show(ROWS);
    await user().type(screen.getByRole("searchbox"), "lima");
    expect(names()).toEqual(["Charlie"]);
  });

  it("leaves out columns that aren't text", async () => {
    show(ROWS, "/?q=30");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("covers every row, not just the current page", async () => {
    show(many(120));
    await user().type(screen.getByRole("searchbox"), "quito");
    expect(names()).toEqual(["Row 075"]);
  });

  it("says when nothing matches and offers to clear it", async () => {
    show(ROWS, "/?q=zzz");
    expect(screen.getByText("No things match.")).toBeTruthy();
    await user().click(screen.getByRole("button", { name: "Clear search" }));
    expect(names()).toHaveLength(3);
    expect(address()).toBe("");
  });
});

describe("sort", () => {
  it("starts on the default sort, ignoring case", () => {
    show(ROWS);
    expect(names()).toEqual(["alpha", "Bravo", "Charlie"]);
  });

  it("goes ascending, then descending, and a third click doesn't clear it", async () => {
    show(ROWS);
    await sortBy("Amount");
    expect(names()).toEqual(["alpha", "Bravo", "Charlie"]);
    await sortBy("Amount");
    expect(names()).toEqual(["Bravo", "alpha", "Charlie"]);
    await sortBy("Amount");
    expect(names()).toEqual(["alpha", "Bravo", "Charlie"]);
    expect(address()).toContain("dir=asc");
  });

  it("counts two clicks that land before the table has redrawn", () => {
    show(ROWS);
    const heading = screen.getByRole("button", { name: "Amount" });
    act(() => {
      heading.click();
      heading.click();
    });
    expect(address()).toContain("dir=desc");
    expect(names()).toEqual(["Bravo", "alpha", "Charlie"]);
  });

  it("puts blanks last both ways", async () => {
    show(ROWS);
    await sortBy("City");
    expect(names()).toEqual(["Charlie", "Bravo", "alpha"]);
    await sortBy("City");
    expect(names()).toEqual(["Bravo", "Charlie", "alpha"]);
  });

  it("uses a column's own order", async () => {
    show(ROWS);
    await sortBy("Stage");
    expect(names()).toEqual(["alpha", "Charlie", "Bravo"]);
    await sortBy("Stage");
    expect(names()).toEqual(["Bravo", "Charlie", "alpha"]);
  });

  it("marks the sorted heading", async () => {
    show(ROWS);
    expect(screen.getByRole("columnheader", { name: /Name/ }).getAttribute("aria-sort")).toBe("ascending");
  });

  it("covers every row, not just the current page", async () => {
    show(many(120));
    await sortBy("Name");
    expect(names()[0]).toBe("Row 120");
  });
});

describe("paging", () => {
  it("shows 50 rows a page", () => {
    show(many(120));
    expect(names()).toHaveLength(50);
    expect(screen.getByText("1-50 of 120")).toBeTruthy();
  });

  it("moves between pages", async () => {
    show(many(120));
    await user().click(screen.getByRole("button", { name: "Next" }));
    expect(names()[0]).toBe("Row 051");
    expect(address()).toBe("?page=2");
    await user().click(screen.getByRole("button", { name: "Previous" }));
    expect(names()[0]).toBe("Row 001");
    expect(address()).toBe("");
  });

  it("shows no paging controls for a single page", () => {
    show(many(50));
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });

  it("stops at the last page", () => {
    show(many(120), "/?page=3");
    expect(names()).toHaveLength(20);
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("an address past the end", () => {
  function table(rows: Row[] | undefined, start: string) {
    const element = (current: Row[] | undefined) => (
      <MemoryRouter initialEntries={[start]}>
        <DataTable
          noun="thing"
          rows={current}
          columns={COLUMNS}
          defaultSort={{ id: "name", desc: false }}
          rowId={(row) => row.id}
          rowName={(row) => row.name}
          rowHref={(row) => `/things/${row.id}`}
          onAdd={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
        <Address />
      </MemoryRouter>
    );
    const view = render(element(rows));
    return { update: (next: Row[] | undefined) => view.rerender(element(next)) };
  }

  it("goes back a page when the only row on the last page is deleted", async () => {
    const { update } = table(many(51), "/?page=2");
    expect(names()).toEqual(["Row 051"]);
    update(many(50));
    await waitFor(() => expect(names()).toHaveLength(50));
    expect(address()).toBe("");
  });

  it("goes to the new last page when more than one page remains", async () => {
    const { update } = table(many(101), "/?page=3");
    update(many(100));
    await waitFor(() => expect(names()[0]).toBe("Row 051"));
    expect(address()).toBe("?page=2");
    expect(screen.getByText("51-100 of 100")).toBeTruthy();
  });

  it("goes to the last page for an old link", async () => {
    show(many(75), "/?page=9");
    await waitFor(() => expect(names()[0]).toBe("Row 051"));
    expect(address()).toBe("?page=2");
  });

  it("counts only the rows a search leaves", async () => {
    show(many(120), "/?q=quito&page=3");
    await waitFor(() => expect(names()).toEqual(["Row 075"]));
    expect(address()).toBe("?q=quito");
  });

  it("keeps other settings when it moves", async () => {
    show(many(75), "/?page=9&status=lead&sort=amount&dir=desc");
    await waitFor(() => expect(address()).toBe("?page=2&status=lead&sort=amount&dir=desc"));
  });

  it("invites the first record once every row is gone", async () => {
    const { update } = table(many(51), "/?page=2");
    update([]);
    expect(await screen.findByText("No things yet. Add the first one.")).toBeTruthy();
    await waitFor(() => expect(address()).toBe(""));
  });

  it("keeps the page while the rows are still loading, so coming back still works", async () => {
    const { update } = table(undefined, "/?page=2");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(address()).toBe("?page=2");
    update(many(75));
    await waitFor(() => expect(names()[0]).toBe("Row 051"));
    expect(address()).toBe("?page=2");
  });
});

describe("an address that makes no sense", () => {
  it.each(["abc", "0", "-1", ""])("reads page %j as the first page", (page) => {
    show(many(75), `/?page=${page}`);
    expect(names()[0]).toBe("Row 001");
  });

  it("ignores a sort on a column that doesn't exist", () => {
    show(ROWS, "/?sort=nothing&dir=desc");
    expect(names()).toEqual(["alpha", "Bravo", "Charlie"]);
  });

  it("reads an unknown direction as ascending", () => {
    show(ROWS, "/?sort=name&dir=sideways");
    expect(names()).toEqual(["alpha", "Bravo", "Charlie"]);
  });
});

describe("a failed read", () => {
  it("says so and offers to try again", async () => {
    const onRetry = vi.fn();
    show(undefined, "/", { error: new ApiError("server", "Something went wrong."), onRetry });
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load this.");
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("doesn't invite a first record, as if the table were empty", () => {
    show(undefined, "/", { error: new ApiError("server", "Something went wrong.") });
    expect(screen.queryByText("No things yet. Add the first one.")).toBeNull();
  });

  it("leaves a lost connection to the message across the top", () => {
    show(undefined, "/", { error: new ApiError("connection", "Can't reach Accountable.") });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the rows it has when a later read fails, and says so", async () => {
    const onRetry = vi.fn();
    show(ROWS, "/", { error: new ApiError("server", "Something went wrong."), onRetry });
    expect(names()).toHaveLength(3);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't refresh this, so it may be out of date.");
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("leaves a lost connection to the message across the top when it has rows too", () => {
    show(ROWS, "/", { error: new ApiError("connection", "Can't reach Accountable.") });
    expect(names()).toHaveLength(3);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("the address", () => {
  it("restores search, sort and page", () => {
    show(many(120), "/?sort=amount&dir=desc&page=2&q=Row");
    expect(names()[0]).toBe("Row 070");
  });

  it("gets the search, and going back to page one", async () => {
    show(many(120), "/?page=2");
    await user().type(screen.getByRole("searchbox"), "x");
    expect(address()).toBe("?q=x");
  });

  it("gets the sort, and going back to page one", async () => {
    show(many(120), "/?page=2");
    await sortBy("Amount");
    expect(address()).toBe("?sort=amount&dir=asc");
  });

  it("keeps other settings, such as a status filter", async () => {
    show(ROWS, "/?status=lead");
    await sortBy("City");
    expect(address()).toContain("status=lead");
  });
});

describe("changes that land before the table has redrawn", () => {
  it("keeps a sort when the search changes straight after it", () => {
    show(ROWS);
    act(() => {
      screen.getByRole("button", { name: "Amount" }).click();
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "a" } });
    });
    expect(address()).toContain("sort=amount");
    expect(address()).toContain("q=a");
  });

  it("keeps a descending sort when the search changes straight after it", () => {
    show(ROWS);
    const heading = screen.getByRole("button", { name: "Amount" });
    act(() => {
      heading.click();
      heading.click();
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "a" } });
    });
    expect(address()).toContain("dir=desc");
    expect(address()).toContain("q=a");
  });

  it("counts two clicks on Next", () => {
    show(many(120));
    const next = screen.getByRole("button", { name: "Next" });
    act(() => {
      next.click();
      next.click();
    });
    expect(address()).toBe("?page=3");
  });

  it("keeps a search when the page changes straight after it", () => {
    show(many(120));
    act(() => {
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Row" } });
      screen.getByRole("button", { name: "Next" }).click();
    });
    expect(address()).toContain("q=Row");
    expect(address()).toContain("page=2");
  });
});

describe("empty and loading", () => {
  it("invites the first record", async () => {
    const { onAdd } = show([]);
    expect(screen.getByText("No things yet. Add the first one.")).toBeTruthy();
    await user().click(screen.getByRole("button", { name: "Add thing" }));
    expect(onAdd).toHaveBeenCalled();
  });

  it("doesn't invite a first record while loading", () => {
    show(undefined);
    expect(screen.queryByText("No things yet. Add the first one.")).toBeNull();
  });

  it("offers to clear a filter that leaves nothing", () => {
    show([], "/?status=lead", { filtered: true, clearParams: ["status"] });
    expect(screen.getByRole("button", { name: "Clear search" })).toBeTruthy();
  });
});

describe("rows", () => {
  it("has Edit and Delete on every row, naming the record", async () => {
    const { onEdit, onDelete } = show(ROWS);
    await user().click(screen.getByRole("button", { name: "Edit Bravo" }));
    expect(onEdit).toHaveBeenCalledWith(ROWS[0]);
    await user().click(screen.getByRole("button", { name: "Delete alpha" }));
    expect(onDelete).toHaveBeenCalledWith(ROWS[1]);
  });

  it("links each row to its record", () => {
    show(ROWS);
    expect(screen.getByRole("link", { name: "Bravo" }).getAttribute("href")).toBe("/things/1");
  });
});
