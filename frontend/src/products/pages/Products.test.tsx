import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { Toaster, toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { SignedIn } from "../../components/SignIn";
import { queryDefaults } from "../../lib/queryDefaults";
import { signOut } from "../../lib/session";
import { holdSaves, mockApi, startSignedIn, user, type Call } from "../../test-utils";
import type { ProductRow } from "../queries";
import { Products } from "./Products";

function product(id: number, name: string, unit_price_cents: number, extra: Partial<ProductRow> = {}): ProductRow {
  return { id, name, description: null, unit_price_cents, active: true, ...extra };
}

const SEAT = product(1, "Extra user seat", 4950, { description: "Billed monthly" });
const TRAINING = product(2, "Training day", 125000, { description: "Up to 12 people.\nTravel is extra." });
const PRINTER = product(3, "Label printer", 28995, { active: false, description: "Thermal" });
const KIOSK = product(4, "Front desk kiosk", 114999);
const PRODUCTS = [TRAINING, SEAT, PRINTER, KIOSK];

const FAILED = { status: 500, body: { detail: "Something went wrong." } };

function Address() {
  const location = useLocation();
  return <output data-testid="address">{location.pathname + location.search}</output>;
}

/** A backend holding these products, whose saves change what the next read gets. */
function backend(rows: ProductRow[], routes: Record<string, unknown> = {}) {
  let held = rows;
  const saving = (id: number) => (body: unknown) => {
    held = held.map((row) => (row.id === id ? { ...row, ...(body as Partial<ProductRow>) } : row));
    return { body: held.find((row) => row.id === id) };
  };
  return mockApi({
    "GET /products": () => ({ body: held }),
    ...Object.fromEntries(rows.map((row) => [`PATCH /products/${row.id}`, saving(row.id)])),
    ...routes,
  });
}

async function showProducts(rows: ProductRow[] = PRODUCTS, address = "/products", routes = {}) {
  const calls = backend(rows, routes);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: queryDefaults })}>
      <MemoryRouter initialEntries={[address]}>
        <Products />
        <Address />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { level: 1, name: "Products" });
  return calls;
}

function names() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
}

async function rowOf(name: string) {
  return within(await screen.findByRole("row", { name: new RegExp(name) }));
}

function showArchived() {
  return screen.getByRole<HTMLInputElement>("checkbox", { name: /^Show archived/ });
}

function writes(calls: Call[]) {
  return calls.filter((call) => call.method !== "GET").map(({ method, path, body }) => ({ method, path, body }));
}

describe("the products table", () => {
  it("lists active products by name, each linking to its page", async () => {
    await showProducts();
    await screen.findByRole("link", { name: "Extra user seat" });
    expect(document.title).toBe("Products | Accountable");
    expect(names()).toEqual(["Extra user seat", "Front desk kiosk", "Training day"]);
    expect(screen.getByRole("link", { name: "Training day" }).getAttribute("href")).toBe("/products/2");
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Name",
      "Description",
      "Unit price",
      "Actions",
    ]);
  });

  it("shows each price with its cents", async () => {
    await showProducts();
    expect((await rowOf("Extra user seat")).getByText("$49.50")).toBeTruthy();
    expect((await rowOf("Training day")).getByText("$1,250.00")).toBeTruthy();
    expect((await rowOf("Front desk kiosk")).getByText("$1,149.99")).toBeTruthy();
  });

  it("keeps each description to one line", async () => {
    await showProducts();
    const description = (await rowOf("Training day")).getByText(/^Up to 12 people/);
    expect(description.className).toContain("truncate");
  });

  it("sorts by unit price by amount", async () => {
    await showProducts();
    await user().click(await screen.findByRole("button", { name: "Unit price" }));
    expect(names()).toEqual(["Extra user seat", "Front desk kiosk", "Training day"]);
    await user().click(screen.getByRole("button", { name: "Unit price" }));
    expect(names()).toEqual(["Training day", "Front desk kiosk", "Extra user seat"]);
  });

  it("finds products by description as well as name", async () => {
    await showProducts();
    await user().type(await screen.findByRole("searchbox", { name: "Search products" }), "travel");
    expect(names()).toEqual(["Training day"]);
  });
});

describe("archived products", () => {
  it("are hidden until Show archived is ticked, then show with the chip and Restore", async () => {
    await showProducts();
    await screen.findByRole("link", { name: "Extra user seat" });
    expect(screen.queryByRole("link", { name: /Label printer/ })).toBeNull();
    expect(showArchived().parentElement?.textContent).toBe("Show archived (1)");

    await user().click(showArchived());

    expect(names()).toEqual(["Extra user seat", "Front desk kiosk", "Label printerArchived", "Training day"]);
    const printer = await rowOf("Label printer");
    expect(printer.getByText("Archived")).toBeTruthy();
    expect(printer.getByRole("button", { name: "Restore Label printer" })).toBeTruthy();
    expect(printer.queryByRole("button", { name: "Archive Label printer" })).toBeNull();
    expect(screen.getByTestId("address").textContent).toBe("/products?archived=1");
  });

  it("can be restored from their row", async () => {
    const calls = await showProducts(PRODUCTS, "/products?archived=1");
    await user().click(await screen.findByRole("button", { name: "Restore Label printer" }));

    expect(await screen.findByText("Product restored.")).toBeTruthy();
    expect(writes(calls)).toEqual([{ method: "PATCH", path: "/products/3", body: { active: true } }]);
    expect(await screen.findByRole("button", { name: "Archive Label printer" })).toBeTruthy();
  });

  it("say so when every product is archived, with a button that shows them", async () => {
    await showProducts([PRINTER]);
    expect(await screen.findByText("Every product is archived.")).toBeTruthy();
    await user().click(screen.getByRole("button", { name: "Show archived products" }));
    expect(names()).toEqual(["Label printerArchived"]);
  });

  it("are counted when only they match a search", async () => {
    await showProducts(PRODUCTS, "/products?q=thermal");
    expect(await screen.findByText("No products match. 1 archived product matches.")).toBeTruthy();
    await user().click(screen.getByRole("button", { name: "Show archived products" }));
    expect(names()).toEqual(["Label printerArchived"]);
  });
});

describe("archiving from the table", () => {
  it("sends active false once however quickly it's pressed, says so, and moves focus to the search box", async () => {
    const calls = await showProducts();
    const archive = await screen.findByRole("button", { name: "Archive Training day" });
    const release = holdSaves();
    await user().dblClick(archive);
    release();

    expect(await screen.findByText("Product archived.")).toBeTruthy();
    expect(names()).toEqual(["Extra user seat", "Front desk kiosk"]);
    expect(writes(calls)).toEqual([{ method: "PATCH", path: "/products/2", body: { active: false } }]);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("searchbox")));
    expect(showArchived().parentElement?.textContent).toBe("Show archived (2)");
  });

  it("says so with a Restore button that brings it back", async () => {
    const calls = await showProducts();
    await user().click(await screen.findByRole("button", { name: "Archive Training day" }));
    expect(await screen.findByText("Product archived.")).toBeTruthy();

    await user().click(screen.getByRole("button", { name: "Restore" }));

    expect(await screen.findByText("Product restored.")).toBeTruthy();
    expect(await screen.findByRole("link", { name: "Training day" })).toBeTruthy();
    expect(writes(calls)).toEqual([
      { method: "PATCH", path: "/products/2", body: { active: false } },
      { method: "PATCH", path: "/products/2", body: { active: true } },
    ]);
  });

  it("keeps its message up for 10 seconds, so Restore can be reached with Tab", async () => {
    const success = vi.spyOn(toast, "success");
    await showProducts();
    await user().click(await screen.findByRole("button", { name: "Archive Training day" }));
    expect(await screen.findByText("Product archived.")).toBeTruthy();
    expect(success).toHaveBeenCalledWith("Product archived.", expect.objectContaining({ duration: 10_000 }));
  });

  it("says so when it fails, and leaves the product", async () => {
    await showProducts(PRODUCTS, "/products", { "PATCH /products/2": () => FAILED });
    await user().click(await screen.findByRole("button", { name: "Archive Training day" }));
    expect(await screen.findByText("Something went wrong.")).toBeTruthy();
    expect(names()).toContain("Training day");
  });
});

describe("archiving, then signing out", () => {
  /** The page in the real SignedIn, with the messages inside it as Shell has them, so each session mounts its own. */
  async function showSignedIn(calls: Call[] = backend(PRODUCTS)) {
    startSignedIn("alex-token");
    render(
      <MemoryRouter initialEntries={["/products"]}>
        <SignedIn>
          <Products />
          <Toaster />
        </SignedIn>
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Archive Training day" });
    return calls;
  }

  /** Alex signs out, and Dana signs in and sees her products. */
  async function changeHands() {
    await act(() => signOut());
    act(() => startSignedIn("dana-token"));
    await screen.findByRole("button", { name: "Archive Extra user seat" });
  }

  it("leaves no message, and no Restore on one, for whoever signs in next", async () => {
    const calls = await showSignedIn();
    await user().click(screen.getByRole("button", { name: "Archive Training day" }));
    expect(await screen.findByText("Product archived.")).toBeTruthy();

    await changeHands();

    expect(screen.queryByText("Product archived.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
    expect(writes(calls)).toEqual([{ method: "PATCH", path: "/products/2", body: { active: false } }]);
  });

  it("says nothing to whoever signs in next when the reply comes after sign-out", async () => {
    const calls = await showSignedIn();
    const release = holdSaves();
    await user().click(screen.getByRole("button", { name: "Archive Training day" }));

    await changeHands();
    act(() => release());
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(screen.queryByText("Product archived.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
  });
});

describe("adding and editing from the products table", () => {
  it("invites the first product when there are none, and Add product opens an empty form", async () => {
    await showProducts([]);
    expect(await screen.findByText("No products yet. Add the first one.")).toBeTruthy();
    expect(showArchived().parentElement?.textContent).toBe("Show archived (0)");
    await user().click(screen.getAllByRole("button", { name: "Add product" })[0]);
    const form = within(await screen.findByRole("dialog", { name: "Add product" }));
    expect((form.getByLabelText("Name") as HTMLInputElement).value).toBe("");
  });

  it("Edit opens the product's form, with its price to the cent", async () => {
    await showProducts();
    await user().click(await screen.findByRole("button", { name: "Edit Front desk kiosk" }));
    const form = within(await screen.findByRole("dialog", { name: "Edit product" }));
    expect((form.getByLabelText("Unit price") as HTMLInputElement).value).toBe("1149.99");
  });
});

describe("a products table that can't be read", () => {
  it("says so, and Try again reads it", async () => {
    let broken = true;
    await showProducts(PRODUCTS, "/products", {
      "GET /products": () => (broken ? FAILED : { body: PRODUCTS }),
    });
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load this.");
    expect(screen.queryByRole("table")).toBeNull();

    broken = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Training day" })).toBeTruthy();
  });
});
