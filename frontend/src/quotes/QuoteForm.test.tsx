import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { FormEvent } from "react";
import { MemoryRouter } from "react-router";
import { Toaster } from "sonner";
import { describe, expect, it } from "vitest";

import cases from "../../../shared/totals-cases.json";
import { api } from "../lib/api";
import { useNotify } from "../lib/notify";
import { queryDefaults } from "../lib/queryDefaults";
import { showSaveError } from "../lib/saveErrors";
import type { Product } from "../products/queries";
import { mockApi, user, type Call } from "../test-utils";
import type { QuoteLine } from "./queries";
import { LivePreview, QuoteForm, toRequest, useQuoteForm } from "./QuoteForm";

const PRODUCTS: Product[] = [
  { id: 1, name: "Standard license", description: "One named user", unit_price_cents: 48000, active: true },
  { id: 2, name: "Annual support plan", description: null, unit_price_cents: 360000, active: true },
  { id: 3, name: "Extra user seat", description: "Billed monthly", unit_price_cents: 4950, active: true },
  { id: 4, name: "Label printer", description: null, unit_price_cents: 28995, active: false },
];

const SETTINGS = {
  company: { name: "Plainsong Systems", address: null, email: null, phone: null },
  preparedFor: { organization: "Harbor & Pine", contact: null, email: null },
};

function line(id: number, quantity: number, unit_price_cents: number): QuoteLine {
  return {
    id,
    product_id: 1,
    name: `Line ${id}`,
    description: null,
    quantity,
    unit_price_cents,
    amount_cents: quantity * unit_price_cents,
  };
}

/** The form and its preview, saving the way the quote page does. */
function Harness({ lines }: { lines: QuoteLine[] }) {
  const { form } = useQuoteForm({ valid_until: "2026-12-05", lines }, "2026-11-05");
  const notify = useNotify();
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    await form.handleSubmit(async (values) => {
      try {
        await api("/quotes/4", { method: "PATCH", body: toRequest(values) });
      } catch (error) {
        showSaveError(error, { setError: form.setError, getValues: form.getValues, notify });
      }
    })(event);
  }
  return (
    <>
      <QuoteForm form={form} id="quote-form" onSubmit={onSubmit} />
      <button type="submit" form="quote-form">
        Save quote
      </button>
      <LivePreview
        control={form.control}
        look={{ design: "classic", accent: "#0E6B6B", logo: null, logoUrl: null }}
        number="QT-0004"
        quoteDate="2026-11-05"
        company={SETTINGS.company}
        preparedFor={SETTINGS.preparedFor}
        taxLabel="Sales tax"
        taxRate="8.875"
      />
    </>
  );
}

function show(lines: QuoteLine[] = [], saved: unknown = { body: {} }, products: unknown = PRODUCTS): Call[] {
  const calls = mockApi({ "GET /products": products, "PATCH /quotes/4": () => saved });
  const client = new QueryClient({ defaultOptions: queryDefaults });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Harness lines={lines} />
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return calls;
}

function preview() {
  return screen.getByRole("article", { name: "Preview" });
}

function theForm() {
  return within(document.getElementById("quote-form")!);
}

async function addProduct(name: string) {
  await user().click(screen.getByRole("button", { name: "Add product" }));
  await user().click(await screen.findByRole("option", { name: new RegExp(`^${name}`) }));
}

function boxes(index: number) {
  return {
    quantity: document.getElementById(`quote-line-${index}-quantity`) as HTMLInputElement,
    price: document.getElementById(`quote-line-${index}-price`) as HTMLInputElement,
    description: document.getElementById(`quote-line-${index}-description`) as HTMLTextAreaElement,
  };
}

async function retype(box: HTMLInputElement, text: string) {
  await user().clear(box);
  if (text) await user().type(box, text);
}

describe("adding a product", () => {
  it("lists only active products, each with its price (Q11)", async () => {
    show();
    await user().click(screen.getByRole("button", { name: "Add product" }));
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Standard license$480.00",
      "Annual support plan$3,600.00",
      "Extra user seat$49.50",
    ]);
  });

  it("finds a product by any part of its name", async () => {
    show();
    await user().click(screen.getByRole("button", { name: "Add product" }));
    await user().type(await screen.findByPlaceholderText("Search products"), "SEAT");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Extra user seat$49.50"]);
  });

  it("adds a line with the product's name, description and price, and a quantity of 1", async () => {
    show();
    await addProduct("Extra user seat");
    const added = boxes(0);
    expect(theForm().getByText("Extra user seat")).toBeTruthy();
    expect([added.description.value, added.quantity.value, added.price.value]).toEqual([
      "Billed monthly",
      "1",
      "49.50",
    ]);
    expect(within(preview()).getByText("Billed monthly")).toBeTruthy();
    expect(preview().textContent).toContain("Subtotal$49.50");
  });

  it("adds the same product twice as two lines", async () => {
    show();
    await addProduct("Standard license");
    await addProduct("Standard license");
    expect(screen.getAllByRole("button", { name: "Remove Standard license" })).toHaveLength(2);
  });

  it("says so when the price list can't be read, and tries again, keeping the lines (N6)", async () => {
    let failing = true;
    show([line(1, 3, 100)], undefined, () =>
      failing ? { status: 500, body: { detail: "Something went wrong." } } : { body: PRODUCTS },
    );
    await user().click(screen.getByRole("button", { name: "Add product" }));
    expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
    expect(screen.queryByRole("option")).toBeNull();

    failing = false;
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findAllByRole("option")).toHaveLength(3);
    expect(boxes(0).quantity.value).toBe("3");
  });
});

describe("the preview's sums", () => {
  it("change as a quantity or price is typed, as the backend works them out (Q15)", async () => {
    const [threeLines] = cases.filter((item) => item.why === "three lines");
    show(threeLines.lines.map(([quantity]: number[], index: number) => line(index + 1, quantity, 1)));
    for (const [index, [quantity, cents]] of threeLines.lines.entries()) {
      await retype(boxes(index).quantity, String(quantity));
      await retype(boxes(index).price, (cents / 100).toFixed(2));
    }
    const shown = preview().textContent!;
    const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    expect(shown).toContain(`Subtotal${money(threeLines.subtotal)}`);
    expect(shown).toContain(`Sales tax (8.875%)${money(threeLines.tax)}`);
    expect(shown).toContain(`Total${money(threeLines.total)}`);
  });

  it("show a line's amount beside it, and read 1,000 as a thousand", async () => {
    show([line(1, 1, 4950)]);
    await retype(boxes(0).quantity, "1,000");
    expect(theForm().getByText("$49,500.00")).toBeTruthy();
    expect(preview().textContent).toContain("Subtotal$49,500.00");
  });

  it("drop a removed line", async () => {
    show([line(1, 1, 4950), line(2, 2, 100)]);
    await user().click(screen.getByRole("button", { name: "Remove Line 1" }));
    expect(preview().textContent).toContain("Subtotal$2.00");
    expect(within(preview()).queryByText("Line 1")).toBeNull();
  });
});

describe("checks before saving", () => {
  it("put each box's message beside it, and send nothing", async () => {
    const calls = show([line(1, 1, 4950)]);
    await retype(boxes(0).quantity, "1.5");
    await retype(boxes(0).price, "49.505");
    fireEvent.change(screen.getByLabelText("Valid until"), { target: { value: "2026-11-04" } });
    await user().click(screen.getByRole("button", { name: "Save quote" }));
    expect(await screen.findByText("Enter a whole number from 1 to 1,000,000")).toBeTruthy();
    expect(screen.getByText("Enter a price in dollars and cents, such as 49.50")).toBeTruthy();
    expect(screen.getByText("Choose a date on or after the quote's date")).toBeTruthy();
    expect(calls.filter((call) => call.method === "PATCH")).toEqual([]);
  });

  it("refuse a 101st line", async () => {
    const calls = show(Array.from({ length: 100 }, (_, index) => line(index + 1, 1, 100)));
    await addProduct("Extra user seat");
    await user().click(screen.getByRole("button", { name: "Save quote" }));
    expect(await screen.findByText("Keep the quote to 100 lines or fewer")).toBeTruthy();
    expect(calls.filter((call) => call.method === "PATCH")).toEqual([]);
  });

  it("refuse a subtotal past $1 trillion", async () => {
    const calls = show([line(1, 1, 4950)]);
    await retype(boxes(0).quantity, "1,000,000");
    await retype(boxes(0).price, "1000000000");
    await user().click(screen.getByRole("button", { name: "Save quote" }));
    expect(await screen.findByText("Keep the subtotal to $1 trillion or less")).toBeTruthy();
    expect(calls.filter((call) => call.method === "PATCH")).toEqual([]);
  });

  it("send lines whole, by id or by product, with no amounts (Q12, Q15)", async () => {
    const calls = show([line(31, 12, 48000)]);
    await addProduct("Extra user seat");
    await retype(boxes(1).quantity, "1,000");
    await user().click(screen.getByRole("button", { name: "Save quote" }));
    await waitFor(() => expect(calls.some((call) => call.method === "PATCH")).toBe(true));
    expect(calls.find((call) => call.method === "PATCH")!.body).toEqual({
      valid_until: "2026-12-05",
      lines: [
        { id: 31, description: null, quantity: 12, unit_price_cents: 48000 },
        { product_id: 3, description: "Billed monthly", quantity: 1000, unit_price_cents: 4950 },
      ],
    });
  });
});

describe("the backend's refusal", () => {
  it("puts a line's message beside that line's box (Q19)", async () => {
    show([line(1, 1, 100), line(2, 1, 100), line(3, 1, 100)], {
      status: 422,
      body: { detail: "Check the form.", fields: { "lines.2.quantity": "Enter a whole number from 1 to 1,000,000" } },
    });
    await user().click(screen.getByRole("button", { name: "Save quote" }));
    const message = await screen.findByText("Enter a whole number from 1 to 1,000,000");
    expect(boxes(2).quantity.getAttribute("aria-invalid")).toBe("true");
    expect(boxes(2).quantity.getAttribute("aria-describedby")).toBe(message.id);
    expect(boxes(1).quantity.getAttribute("aria-invalid")).toBe("false");
  });

  it("puts an archived product's refusal beside its line, which has no box for the product (Q11, Q19)", async () => {
    const archived = "This product is archived. Choose another.";
    show([line(1, 1, 100)], {
      status: 422,
      body: { detail: "Check the form.", fields: { "lines.1.product_id": archived } },
    });
    await addProduct("Extra user seat");
    await user().click(screen.getByRole("button", { name: "Save quote" }));
    const [first, added] = theForm().getAllByRole("listitem");
    expect(await within(added).findByText(archived)).toBeTruthy();
    expect(within(first).queryByText(archived)).toBeNull();
  });
});
