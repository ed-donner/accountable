// TF03 to TF07: the table's search, sort, paging, row actions and empty states.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "./DataTable";

type Row = { id: number; name: string; city: string; value: number };

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Name", enableGlobalFilter: true },
  { accessorKey: "city", header: "City", enableGlobalFilter: true },
  { accessorKey: "value", header: "Value", meta: { numeric: true } },
];

function rows(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Org ${String(i + 1).padStart(2, "0")}`,
    city: i % 2 ? "Leeds" : "York",
    value: (i * 37) % 100,
  }));
}

function setup(data: Row[], extra: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  const handlers = { onOpen: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onAdd: vi.fn() };
  render(
    <DataTable<Row>
      data={data}
      columns={columns}
      noun={["organization", "organizations"]}
      rowName={(r) => r.name}
      addLabel="Add organization"
      initialSort={[{ id: "name", desc: false }]}
      {...handlers}
      {...extra}
    />,
  );
  return handlers;
}

const bodyRows = () => screen.getAllByRole("row").slice(1);
const firstCells = () => bodyRows().map((r) => within(r).getAllByRole("cell")[0].textContent);

test("TF03 search filters as you type, across the searchable columns", async () => {
  setup(rows(6));
  const box = screen.getByRole("searchbox", { name: "Search organizations" });
  await userEvent.type(box, "org 0");
  expect(bodyRows()).toHaveLength(6);
  await userEvent.clear(box);
  await userEvent.type(box, "leeds");
  expect(firstCells()).toEqual(["Org 02", "Org 04", "Org 06"]);
  await userEvent.type(box, "x");
  expect(screen.queryAllByRole("row")).toHaveLength(0);
});

test("TF04 sort toggles and shows an arrow", async () => {
  setup(rows(3));
  const header = screen.getByRole("columnheader", { name: /Name/ });
  expect(header).toHaveAttribute("aria-sort", "ascending");
  await userEvent.click(within(header).getByRole("button"));
  expect(header).toHaveAttribute("aria-sort", "descending");
  expect(firstCells()).toEqual(["Org 03", "Org 02", "Org 01"]);
  const value = screen.getByRole("columnheader", { name: /Value/ });
  await userEvent.click(within(value).getByRole("button"));
  expect(value).toHaveAttribute("aria-sort", "ascending");
  expect(header).not.toHaveAttribute("aria-sort");
  const values = bodyRows().map((r) => Number(within(r).getAllByRole("cell")[2].textContent));
  expect(values).toEqual([...values].sort((a, b) => a - b));
  expect(value.querySelector("svg")).not.toBeNull();
});

test("TF05 25 rows a page with a count, and search goes back to page 1", async () => {
  setup(rows(60));
  expect(bodyRows()).toHaveLength(25);
  expect(screen.getByText("Showing 1 to 25 of 60")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(screen.getByText("Showing 26 to 50 of 60")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(screen.getByText("Showing 51 to 60 of 60")).toBeInTheDocument();
  expect(bodyRows()).toHaveLength(10);
  await userEvent.type(screen.getByRole("searchbox"), "york");
  expect(screen.getByText("Showing 1 to 25 of 30")).toBeInTheDocument();
});

test("TF06 row actions: edit, delete and open the record", async () => {
  const handlers = setup(rows(2));
  await userEvent.click(screen.getByRole("button", { name: "Edit Org 02" }));
  expect(handlers.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  await userEvent.click(screen.getByRole("button", { name: "Delete Org 01" }));
  expect(handlers.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  expect(handlers.onOpen).not.toHaveBeenCalled();
  await userEvent.click(screen.getByText("Leeds"));
  expect(handlers.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
});

test("TF07 an empty table offers the Add button", async () => {
  const handlers = setup([]);
  expect(screen.getByText("No organizations yet.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Add organization" }));
  expect(handlers.onAdd).toHaveBeenCalled();
});

test("TF07 a search with no results says so", async () => {
  setup(rows(3));
  await userEvent.type(screen.getByRole("searchbox"), "zebra");
  expect(screen.getByText("No organizations match “zebra”.")).toBeInTheDocument();
  expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
});
