import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, useNavigate } from "react-router";

import { user } from "../test-utils";
import { DataTable, type TableColumn } from "./DataTable";

type Row = { id: number; name: string };

const COLUMNS: TableColumn<Row>[] = [{ id: "name", header: "Name", value: (row) => row.name, searchable: true }];

const ROWS: Row[] = [
  { id: 1, name: "Bravo" },
  { id: 2, name: "Alpha" },
];

/** Changes the address the way the rest of the app and the browser do. */
function Elsewhere() {
  const navigate = useNavigate();
  return (
    <>
      <Link to="/?q=brav">Search for brav</Link>
      <button type="button" onClick={() => navigate(-1)}>
        Back
      </button>
    </>
  );
}

function show(address = "/") {
  render(
    <MemoryRouter initialEntries={[address]}>
      <DataTable
        noun="thing"
        rows={ROWS}
        columns={COLUMNS}
        defaultSort={{ id: "name", desc: false }}
        rowId={(row) => row.id}
        rowName={(row) => row.name}
        rowHref={(row) => `/things/${row.id}`}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
      <Elsewhere />
    </MemoryRouter>,
  );
  return screen.getByRole<HTMLInputElement>("searchbox");
}

describe("the search box", () => {
  it("starts with the search in the address", () => {
    expect(show("/?q=brav").value).toBe("brav");
  });

  it("keeps everything typed into it", async () => {
    const box = show();
    await user().type(box, "bravo");
    expect(box.value).toBe("bravo");
  });

  it("empties when Clear search is pressed", async () => {
    const box = show();
    await user().type(box, "zzz");
    await user().click(await screen.findByRole("button", { name: "Clear search" }));
    expect(box.value).toBe("");
  });

  it("follows the address when a link or going back changes it", async () => {
    const box = show();
    await user().type(box, "alp");
    await user().click(screen.getByRole("link", { name: "Search for brav" }));
    expect(box.value).toBe("brav");
    await user().click(screen.getByRole("button", { name: "Back" }));
    expect(box.value).toBe("alp");
  });
});
