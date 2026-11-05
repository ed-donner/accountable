import { screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { holdSaves, mockApi, renderApp, user, type Call } from "../test-utils";
import { ProductForm } from "./ProductForm";
import type { ProductDetail } from "./queries";

const PRICE_MESSAGE = "Enter a price in dollars and cents, such as 49.50";
const TAKEN = "A product with this name already exists";
const ARCHIVED_TAKEN = "An archived product has this name. Restore it or choose another.";

const SURVEY: ProductDetail = {
  id: 7,
  name: "Rooftop survey",
  description: "Drone and ladder.\nWritten report within a week.",
  unit_price_cents: 125000,
  active: true,
  created_at: "2026-10-12T12:00:00Z",
  created_by: { id: "alex", name: "Alex Rivera" },
  updated_at: "2026-10-12T12:00:00Z",
  updated_by: { id: "alex", name: "Alex Rivera" },
};

function box(label: string) {
  return screen.getByLabelText<HTMLInputElement>(label);
}

function invalid(label: string) {
  return box(label).getAttribute("aria-invalid") === "true";
}

async function openAdd(routes: Record<string, unknown> = {}) {
  const calls = mockApi({ "POST /products": SURVEY, ...routes });
  const onClose = vi.fn();
  renderApp(<ProductForm onClose={onClose} />);
  await screen.findByRole("dialog", { name: "Add product" });
  return { calls, onClose };
}

async function openEdit(routes: Record<string, unknown> = {}, record = SURVEY) {
  const calls = mockApi({ [`PATCH /products/${record.id}`]: record, ...routes });
  const onClose = vi.fn();
  renderApp(<ProductForm record={record} onClose={onClose} />);
  await screen.findByRole("dialog", { name: "Edit product" });
  return { calls, onClose };
}

async function fill(name: string, price: string, description = "") {
  await user().type(box("Name"), name);
  if (description) await user().type(box("Description"), description);
  if (price) await user().type(box("Unit price"), price);
}

function save() {
  return user().click(screen.getByRole("button", { name: "Save product" }));
}

function writes(calls: Call[]) {
  return calls.filter((call) => call.method !== "GET");
}

describe("adding a product", () => {
  it("sends the name, the description and the price in whole cents, then closes", async () => {
    const saved = vi.spyOn(toast, "success");
    const { calls, onClose } = await openAdd();
    await fill("Rooftop survey", "1,250.5", "Drone and ladder.");
    await save();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(writes(calls)).toEqual([
      {
        method: "POST",
        path: "/products",
        body: { name: "Rooftop survey", description: "Drone and ladder.", unit_price_cents: 125050 },
      },
    ]);
    expect(saved).toHaveBeenCalledWith("Product saved.");
  });

  it.each([
    ["$49.50", 4950],
    ["49.5", 4950],
    ["0.29", 29],
    ["1.10", 110],
    ["1000", 100000],
  ])("sends %j as %i cents", async (typed, cents) => {
    const { calls, onClose } = await openAdd();
    await fill("Seat", typed);
    await save();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(writes(calls)[0].body).toEqual({ name: "Seat", description: null, unit_price_cents: cents });
  });

  it("shows $ before the price box, and the box has no Active setting beside it", async () => {
    await openAdd();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("$");
    expect(screen.queryByLabelText(/Active/)).toBeNull();
    expect(box("Description").tagName).toBe("TEXTAREA");
  });
});

describe("editing a product", () => {
  it("starts from the product, with its price to two figures after the point", async () => {
    await openEdit();
    expect(box("Name").value).toBe("Rooftop survey");
    expect(box("Description").value).toBe("Drone and ladder.\nWritten report within a week.");
    expect(box("Unit price").value).toBe("1250.00");
  });

  it("sends what's changed along with the rest, in cents", async () => {
    const { calls, onClose } = await openEdit();
    await user().clear(box("Unit price"));
    await user().type(box("Unit price"), "1,300");
    await user().clear(box("Description"));
    await save();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(writes(calls)).toEqual([
      {
        method: "PATCH",
        path: "/products/7",
        body: { name: "Rooftop survey", description: null, unit_price_cents: 130000 },
      },
    ]);
  });
});

describe("what the form refuses", () => {
  it.each(["49.505", "-1", "12a", "1,25", ""])(
    "stops %j before sending, with the message beside the box",
    async (typed) => {
      const { calls } = await openAdd();
      await fill("Seat", typed);
      await save();

      expect(await screen.findByText(PRICE_MESSAGE)).toBeTruthy();
      expect(invalid("Unit price")).toBe(true);
      expect(writes(calls)).toEqual([]);
    },
  );

  it("needs a name", async () => {
    const { calls } = await openAdd();
    await user().type(box("Unit price"), "10");
    await save();
    expect(await screen.findByText("Enter a name")).toBeTruthy();
    expect(invalid("Name")).toBe(true);
    expect(writes(calls)).toEqual([]);
  });

  it("shows a taken name from the API beside the name when adding", async () => {
    const { onClose } = await openAdd({
      "POST /products": () => ({ status: 422, body: { detail: "Check the form.", fields: { name: TAKEN } } }),
    });
    await fill("ROOFTOP SURVEY", "10");
    await save();

    expect(await screen.findByText(TAKEN)).toBeTruthy();
    expect(invalid("Name")).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a name an archived product has beside the name when editing", async () => {
    const { onClose } = await openEdit({
      "PATCH /products/7": () => ({
        status: 422,
        body: { detail: "Check the form.", fields: { name: ARCHIVED_TAKEN } },
      }),
    });
    await user().clear(box("Name"));
    await user().type(box("Name"), "Label printer");
    await save();

    expect(await screen.findByText(ARCHIVED_TAKEN)).toBeTruthy();
    expect(invalid("Name")).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the API's message about the price beside the price box", async () => {
    await openAdd({
      "POST /products": () => ({
        status: 422,
        body: { detail: "Check the form.", fields: { unit_price_cents: PRICE_MESSAGE } },
      }),
    });
    await fill("Seat", "10");
    await save();

    expect(await screen.findByText(PRICE_MESSAGE)).toBeTruthy();
    expect(invalid("Unit price")).toBe(true);
  });
});

describe("saving", () => {
  it("sends once, however quickly Save is pressed", async () => {
    const { calls, onClose } = await openAdd();
    await fill("Seat", "10");
    const release = holdSaves();
    await user().dblClick(screen.getByRole("button", { name: "Save product" }));
    release();

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(writes(calls)).toHaveLength(1);
  });

  it("stays open with what was typed if the save fails, and says so", async () => {
    const failure = vi.spyOn(toast, "error");
    const { onClose } = await openAdd({
      "POST /products": () => ({ status: 500, body: { detail: "Something went wrong." } }),
    });
    await fill("Seat", "1,250.5", "For one");
    await save();

    await waitFor(() => expect(failure).toHaveBeenCalledWith("Something went wrong."));
    expect(onClose).not.toHaveBeenCalled();
    expect([box("Name").value, box("Description").value, box("Unit price").value]).toEqual([
      "Seat",
      "For one",
      "1,250.5",
    ]);
  });
});
