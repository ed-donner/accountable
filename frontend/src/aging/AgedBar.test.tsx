import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgedBar, BAR } from "./AgedBar";
import type { AgedRow } from "./queries";
import { CUSTOMER_ROWS, WIDTH, row, sizeTheBars } from "./test-aged";

beforeEach(sizeTheBars);
afterEach(() => vi.unstubAllGlobals());

/** The rows as the page reads them: the sums as BigInts. */
function read(reply: ReturnType<typeof row>): AgedRow {
  return {
    id: reply.id,
    name: reply.name,
    parts: reply.parts.map((part) => ({ key: part.key, cents: BigInt(part.cents), count: part.count })),
    total: BigInt(reply.total_cents),
    items: [],
  };
}

const [BLUEBIRD, HARBOR, GREYFRIARS] = CUSTOMER_ROWS.map(read);
const LARGEST = Number(BLUEBIRD.total);

function show(one: AgedRow) {
  render(<AgedBar row={one} largest={LARGEST} noun="invoice" />);
  return screen.getByTestId(`bar-${one.id}`);
}

/** The drawn parts, left to right, with where each starts and its width. */
function parts(bar: HTMLElement) {
  return [...bar.querySelectorAll<SVGPathElement>("path.recharts-rectangle")]
    .map((path) => ({
      fill: path.getAttribute("fill"),
      x: Number(path.getAttribute("x")),
      width: Number(path.getAttribute("width")),
    }))
    .sort((a, b) => a.x - b.x);
}

describe("the bar", () => {
  it("draws only the parts with money in them, in order from calm to alarming colors", async () => {
    const bar = show(HARBOR);
    await waitFor(() => expect(parts(bar)).toHaveLength(2));
    expect(parts(bar).map((part) => part.fill)).toEqual(["var(--color-cerulean)", "var(--color-marigold)"]);
  });

  it("draws all five in their five colors", async () => {
    const bar = show(read(row(9, "Everything", [100, 100, 100, 100, 100])));
    await waitFor(() => expect(parts(bar)).toHaveLength(5));
    expect(parts(bar).map((part) => part.fill)).toEqual([
      "var(--color-cerulean)",
      "var(--color-marigold)",
      "var(--color-coral)",
      "var(--color-raspberry)",
      "var(--color-deep-raspberry)",
    ]);
  });

  it("is sized against the view's largest, so that one fills the column and a smaller one is shorter", async () => {
    const largest = show(BLUEBIRD);
    await waitFor(() => expect(parts(largest)).toHaveLength(1));
    expect(parts(largest)[0].width).toBeCloseTo(WIDTH, 0);
    document.body.innerHTML = "";
    const smaller = show(HARBOR);
    await waitFor(() => expect(parts(smaller)).toHaveLength(2));
    const drawn = parts(smaller).reduce((sum, part) => sum + part.width, 0);
    expect(drawn).toBeCloseTo((WIDTH * Number(HARBOR.total)) / LARGEST - BAR.gap, 0);
    expect(drawn).toBeLessThan(WIDTH);
  });

  it("draws a part too small to see 3px wide", async () => {
    const bar = show(GREYFRIARS);
    await waitFor(() => expect(parts(bar)).toHaveLength(2));
    expect(parts(bar)[1].width).toBeCloseTo(BAR.least, 5);
  });

  it("leaves a gap between two parts and draws nothing at all for no money", async () => {
    const bar = show(HARBOR);
    await waitFor(() => expect(parts(bar)).toHaveLength(2));
    const [first, second] = parts(bar);
    expect(second.x - (first.x + first.width)).toBeCloseTo(BAR.gap, 5);
    document.body.innerHTML = "";
    const empty = show(read(row(10, "Nobody", [0, 0, 0, 0, 0])));
    expect(parts(empty)).toHaveLength(0);
  });

  it("lists the parts behind the bar for a screen reader, by name and amount", () => {
    show(GREYFRIARS);
    const list = screen.getByRole("list", { name: "Greyfriars Property, by how late" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["31 to 60 days: $1,500.00, 1 invoice", "Over 90 days: $10.00, 1 invoice"]);
  });

  it("says in a tooltip which organization, part, amount and count a part pointed at is", async () => {
    const bar = show(HARBOR);
    await waitFor(() => expect(parts(bar)).toHaveLength(2));
    const second = bar.querySelectorAll("path.recharts-rectangle")[1]!;
    fireEvent.mouseOver(second);
    fireEvent.mouseMove(second, { clientX: 500, clientY: 5 });
    const tip = await waitFor(() => {
      const wrapper = bar.querySelector<HTMLElement>(".recharts-tooltip-wrapper");
      expect(wrapper?.textContent).toContain("1 to 30 days");
      return wrapper!;
    });
    expect(tip.textContent).toContain("$2,000.00");
    expect(tip.textContent).toContain("Harbor & Pine");
    expect(tip.textContent).toContain("1 invoice");
  });
});
