import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DataTable, NameLink, type TableColumn } from "./DataTable";

type Thing = { id: number; name: string; city: string; value: number };

const columns: TableColumn<Thing>[] = [
  { id: "name", header: "Name", cell: (t) => <NameLink to={`/things/${t.id}`}>{t.name}</NameLink>, sortValue: (t) => t.name },
  { id: "city", header: "City", cell: (t) => t.city, sortValue: (t) => t.city },
  { id: "value", header: "Value", cell: (t) => `$${t.value}`, sortValue: (t) => t.value, numeric: true },
];

const THINGS: Thing[] = [
  { id: 1, name: "bluefin Logistics", city: "Portland", value: 300 },
  { id: 2, name: "Cedar Health", city: "Smithville", value: 100 },
  { id: 3, name: "Alder & Co", city: "Boston", value: 200 },
];

function Opened() {
  return <p>Opened {useParams().id}</p>;
}

function setup(rows: Thing[] | undefined = THINGS, extra: Partial<Parameters<typeof DataTable<Thing>>[0]> = {}) {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  render(
    <MemoryRouter>
      <TooltipProvider>
        <Routes>
          <Route
            path="/"
            element={
              <DataTable
                rows={rows}
                columns={columns}
                searchFields={(t) => [t.name, t.city]}
                searchLabel="Search things"
                noun="thing"
                initialSort={{ id: "name", desc: false }}
                hrefOf={(t) => `/things/${t.id}`}
                nameOf={(t) => t.name}
                onEdit={onEdit}
                onDelete={onDelete}
                emptyAction={<button type="button">Add thing</button>}
                {...extra}
              />
            }
          />
          <Route path="/things/:id" element={<Opened />} />
        </Routes>
      </TooltipProvider>
    </MemoryRouter>,
  );
  return { onEdit, onDelete, user: userEvent.setup() };
}

function names() {
  const body = screen.getAllByRole("rowgroup")[1];
  return within(body)
    .getAllByRole("row")
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
}

describe("DataTable", () => {
  it("searches any part of the listed fields, ignoring capitals (TBL-1)", async () => {
    const { user } = setup();
    await user.type(screen.getByRole("searchbox", { name: "Search things" }), "SMITH");
    expect(names()).toEqual(["Cedar Health"]);
    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "lue");
    expect(names()).toEqual(["bluefin Logistics"]);
  });

  it("sorts by a heading, and a second click reverses it (TBL-2)", async () => {
    const { user } = setup();
    const nameHeader = screen.getByRole("columnheader", { name: /Name/ });
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
    expect(names()).toEqual(["Alder & Co", "bluefin Logistics", "Cedar Health"]);

    await user.click(within(nameHeader).getByRole("button"));
    expect(nameHeader).toHaveAttribute("aria-sort", "descending");
    expect(names()).toEqual(["Cedar Health", "bluefin Logistics", "Alder & Co"]);

    const valueHeader = screen.getByRole("columnheader", { name: /Value/ });
    await user.click(within(valueHeader).getByRole("button"));
    expect(valueHeader).toHaveAttribute("aria-sort", "ascending");
    expect(nameHeader).toHaveAttribute("aria-sort", "none");
    expect(names()).toEqual(["Cedar Health", "Alder & Co", "bluefin Logistics"]);
    await user.click(within(valueHeader).getByRole("button"));
    expect(names()).toEqual(["bluefin Logistics", "Alder & Co", "Cedar Health"]);
  });

  it("shows the count line, and pages from row 51 (TBL-6)", async () => {
    const many = Array.from({ length: 53 }, (_, i) => ({
      id: i + 1,
      name: `Thing ${String(i + 1).padStart(2, "0")}`,
      city: i % 2 ? "Odd" : "Even",
      value: i,
    }));
    const { user } = setup(many);
    expect(screen.getByText("53 things")).toBeInTheDocument();
    expect(names()).toHaveLength(50);
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Previous/ })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Next/ }));
    expect(names()).toEqual(["Thing 51", "Thing 52", "Thing 53"]);

    await user.type(screen.getByRole("searchbox"), "odd");
    expect(screen.getByText("26 of 53 things")).toBeInTheDocument();
    // A new search starts from the first page, and fits on one.
    expect(names()).toHaveLength(26);
    expect(screen.queryByRole("button", { name: /Next/ })).not.toBeInTheDocument();
  });

  it("says why it's empty (TBL-7)", async () => {
    setup([]);
    expect(screen.getByText("No things yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add thing" })).toBeInTheDocument();
  });

  it("says when a search finds nothing (TBL-7)", async () => {
    const { user } = setup();
    await user.type(screen.getByRole("searchbox"), "smyth");
    expect(screen.getByText('No things match "smyth"')).toBeInTheDocument();
    expect(screen.getByText("0 of 3 things")).toBeInTheDocument();
  });

  it("works with another filter (CON-2)", () => {
    setup(THINGS, { filter: (t) => t.value >= 200 });
    expect(names()).toEqual(["Alder & Co", "bluefin Logistics"]);
    expect(screen.getByText("2 of 3 things")).toBeInTheDocument();
  });

  it("opens a row when it's clicked (TBL-5)", async () => {
    const { user } = setup();
    await user.click(screen.getByText("Portland"));
    expect(screen.getByText("Opened 1")).toBeInTheDocument();
  });

  it("doesn't open the row for Edit and Delete (TBL-4)", async () => {
    const { user, onEdit, onDelete } = setup();
    await user.click(screen.getByRole("button", { name: "Edit Cedar Health" }));
    expect(onEdit).toHaveBeenCalledWith(THINGS[1]);
    await user.click(screen.getByRole("button", { name: "Delete Cedar Health" }));
    expect(onDelete).toHaveBeenCalledWith(THINGS[1]);
    expect(screen.queryByText(/Opened/)).not.toBeInTheDocument();
  });

  it("shows placeholder rows while loading", () => {
    setup(undefined);
    expect(screen.queryByText("No things yet")).not.toBeInTheDocument();
    expect(screen.getAllByRole("row").length).toBeGreaterThan(1);
  });
});
