import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { Toaster } from "sonner";
import { describe, expect, it } from "vitest";

import { queryDefaults } from "../../lib/queryDefaults";
import { holdSaves, mockApi, user, type Call } from "../../test-utils";
import type { ProductDetail } from "../queries";
import { Product } from "./Product";

const ALEX = { id: "alex", name: "Alex Rivera" };
const DANA = { id: "dana", name: "Dana Whitfield" };
const ADDED = "2026-10-12T12:00:00Z";
const CHANGED = "2026-10-30T12:00:00Z";

const SUPPORT: ProductDetail = {
  id: 5,
  name: "Premium support plan",
  description: "Phone support around the clock.\nA named account manager.",
  unit_price_cents: 780000,
  active: true,
  created_at: ADDED,
  created_by: ALEX,
  updated_at: ADDED,
  updated_by: ALEX,
};

const ARCHIVED: ProductDetail = {
  ...SUPPORT,
  active: false,
  updated_at: CHANGED,
  updated_by: DANA,
};

const FAILED = { status: 500, body: { detail: "Something went wrong." } };

function Address() {
  return <output data-testid="address">{useLocation().pathname}</output>;
}

function show(address: string) {
  const client = new QueryClient({ defaultOptions: queryDefaults });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[address]}>
        <Routes>
          <Route path="/products/:id" element={<Product />} />
          <Route path="*" element={<Address />} />
        </Routes>
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

/** A backend holding this product, whose saves change what the next read gets. */
function backend(product: ProductDetail, routes: Record<string, unknown> = {}) {
  let held = product;
  return mockApi({
    [`GET /products/${product.id}`]: () => ({ body: held }),
    [`PATCH /products/${product.id}`]: (body: unknown) => {
      held = { ...held, ...(body as Partial<ProductDetail>) };
      return { body: held };
    },
    ...routes,
  });
}

async function showProduct(product = SUPPORT, routes: Record<string, unknown> = {}) {
  const calls = backend(product, routes);
  const client = show(`/products/${product.id}`);
  await screen.findByRole("heading", { level: 1, name: product.name });
  return { calls, client };
}

function panel(name: string) {
  return within(screen.getByRole("region", { name }));
}

function whoLines() {
  return panel("Details")
    .queryAllByText(/^(Added|Last changed)\b/)
    .map((line) => line.textContent);
}

/** The page title, with its chip and buttons. */
function header() {
  return within(screen.getByRole("heading", { level: 1 }).parentElement!);
}

function writes(calls: Call[]) {
  return calls.filter((call) => call.method !== "GET").map(({ method, path, body }) => ({ method, path, body }));
}

describe("a product's page", () => {
  it("names the product", async () => {
    await showProduct();
    expect(document.title).toBe("Premium support plan | Accountable");
  });

  it("shows the price with its cents, in the figures' typeface", async () => {
    await showProduct();
    const price = panel("Details").getByText("$7,800.00");
    expect(price.className).toContain("num");
  });

  it("says it's active, with no Archived chip", async () => {
    await showProduct();
    expect(panel("Details").getByText("Active")).toBeTruthy();
    expect(screen.queryByText("Archived")).toBeNull();
  });

  it("shows the description with its line breaks", async () => {
    await showProduct();
    const description = panel("Description").getByText(/^Phone support around the clock/);
    expect(description.textContent).toBe("Phone support around the clock.\nA named account manager.");
    expect(description.className).toContain("whitespace-pre-wrap");
  });

  it("says when there's no description", async () => {
    await showProduct({ ...SUPPORT, description: null });
    expect(panel("Description").getByText("No description.")).toBeTruthy();
  });

  it("says who added it, and who last changed it once someone has", async () => {
    await showProduct();
    expect(whoLines()).toEqual(["Added by Alex Rivera on Oct 12, 2026"]);
  });

  it("has no timeline", async () => {
    await showProduct();
    expect(screen.queryByRole("region", { name: "Timeline" })).toBeNull();
  });

  it("Edit opens its form, with the price to the cent", async () => {
    await showProduct();
    await user().click(screen.getByRole("button", { name: "Edit" }));
    const form = within(await screen.findByRole("dialog", { name: "Edit product" }));
    expect((form.getByLabelText("Unit price") as HTMLInputElement).value).toBe("7800.00");
  });
});

describe("an archived product's page", () => {
  it("shows the Archived chip and Restore, and who archived it", async () => {
    await showProduct(ARCHIVED);
    expect(header().getByText("Archived")).toBeTruthy();
    expect(panel("Details").getByText("Archived")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(whoLines()).toEqual([
      "Added by Alex Rivera on Oct 12, 2026",
      "Last changed by Dana Whitfield on Oct 30, 2026",
    ]);
  });

  it("restores it, staying on the page", async () => {
    const { calls } = await showProduct(ARCHIVED);
    await user().click(screen.getByRole("button", { name: "Restore" }));

    expect(await screen.findByText("Product restored.")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Archive" })).toBeTruthy();
    expect(writes(calls)).toEqual([{ method: "PATCH", path: "/products/5", body: { active: true } }]);
    expect(screen.getByRole("heading", { level: 1, name: "Premium support plan" })).toBeTruthy();
  });
});

describe("archiving from a product's page", () => {
  it("stays on the page, once however quickly Archive is pressed", async () => {
    const { calls } = await showProduct();
    const release = holdSaves();
    await user().dblClick(screen.getByRole("button", { name: "Archive" }));
    release();

    expect(await screen.findByText("Product archived.")).toBeTruthy();
    expect(await header().findByRole("button", { name: "Restore" })).toBeTruthy();
    expect(writes(calls)).toEqual([{ method: "PATCH", path: "/products/5", body: { active: false } }]);
    expect(screen.getByRole("heading", { level: 1, name: "Premium support plan" })).toBeTruthy();
  });

  it("says so when it fails, and leaves the product active", async () => {
    await showProduct(SUPPORT, { "PATCH /products/5": () => FAILED });
    await user().click(screen.getByRole("button", { name: "Archive" }));
    expect(await screen.findByText("Something went wrong.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Archive" })).toBeTruthy();
    expect(panel("Details").getByText("Active")).toBeTruthy();
  });
});

describe("a product that can't be shown", () => {
  it("says so when it no longer exists, with a link back to Products", async () => {
    mockApi({});
    show("/products/99");
    expect(await screen.findByRole("heading", { name: "This product no longer exists" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Products" }).getAttribute("href")).toBe("/products");
  });

  it.each(["/products/abc", "/products/0", "/products/2147483648"])(
    "says so for %s, which couldn't be a product, without asking the backend",
    (address) => {
      const calls = mockApi({});
      show(address);
      expect(screen.getByRole("heading", { name: "This product no longer exists" })).toBeTruthy();
      expect(calls).toEqual([]);
    },
  );

  it("says when it couldn't be loaded, and Try again loads it", async () => {
    let broken = true;
    mockApi({ "GET /products/5": () => (broken ? FAILED : { body: SUPPORT }) });
    show("/products/5");
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load this.");

    broken = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Premium support plan" })).toBeTruthy();
  });

  it("keeps showing the product when a refresh fails", async () => {
    let broken = false;
    const { client } = await showProduct(SUPPORT, {
      "GET /products/5": () => (broken ? FAILED : { body: SUPPORT }),
    });

    broken = true;
    await act(() => client.invalidateQueries({ queryKey: ["products", 5], exact: true }));
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't refresh this");
    expect(screen.getByText("$7,800.00")).toBeTruthy();

    broken = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
