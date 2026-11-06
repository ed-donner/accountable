import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { user } from "../../test-utils";
import { Statement } from "./Statement";
import { figuresOf, pageReply } from "./test-profit";
import type { ShownPeriod } from "./queries";

function show(period: Partial<ShownPeriod> = {}) {
  const onOpen = vi.fn();
  const reply = pageReply({ period });
  render(
    <Statement
      period={reply.period}
      previousLabel="February 2026"
      switcher={<span>switch</span>}
      onOpen={onOpen}
      register={() => undefined}
    />,
  );
  return { onOpen, reply };
}

function rows() {
  return within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((row) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent));
}

describe("the statement", () => {
  it("has the rows in order, all six categories, each with its amount and change", () => {
    show();
    expect(rows()).toEqual([
      ["Revenue", "$9,500.00", "+12%"],
      ["Software", "$1,200.00", "-8%"],
      ["Contractors", "$0.00", "–"],
      ["Travel", "$300.00", "0%"],
      ["Office", "$0.00", "New"],
      ["Marketing", "$0.00", "–"],
      ["Other", "$0.00", "–"],
      ["Total expenses", "$1,500.00", "+4%"],
      ["Profit", "$8,000.00", "+19%"],
      ["Profit margin", "84.2%", "+2.1 pts"],
    ]);
  });

  it("names the earlier period in the change heading, and shows the switch beside it", () => {
    show();
    expect(screen.getByText("Change from February 2026")).toBeTruthy();
    expect(screen.getByText("switch")).toBeTruthy();
  });

  it("shows a category with nothing in it in muted ink", () => {
    show();
    const cell = screen.getByRole("button", { name: /^Contractors, \$0\.00/ }).closest("td")!;
    expect(cell.className).toContain("text-muted");
    expect(screen.getByRole("button", { name: /^Software, \$1,200\.00/ }).closest("td")!.className).not.toContain(
      "text-muted",
    );
  });

  it("makes every amount a button that opens its figure, and the changes plain text", async () => {
    const { onOpen } = show();
    const clicks = user();
    await clicks.click(screen.getByRole("button", { name: /^Revenue, / }));
    await clicks.click(screen.getByRole("button", { name: /^Travel, / }));
    await clicks.click(screen.getByRole("button", { name: /^Total expenses, / }));
    await clicks.click(screen.getByRole("button", { name: /^Profit, / }));
    expect(onOpen.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ["revenue", "Revenue"],
      ["expense_travel", "Travel"],
      ["expenses", "Total expenses"],
      ["profit", "Profit"],
    ]);
    expect(screen.queryByRole("button", { name: /\+12%/ })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(10);
  });

  it("opens Profit's entries from the margin", async () => {
    const { onOpen } = show();
    await user().click(screen.getByRole("button", { name: /^Profit margin, 84\.2%/ }));
    expect(onOpen.mock.calls[0].slice(0, 2)).toEqual(["profit", "Profit"]);
  });

  it("shows a loss with its minus sign and the margin as a dash with no revenue", () => {
    show({ ...figuresOf(0, { software: 5_000 }), changes: pageReply().period.changes });
    expect(rows()[8]).toEqual(["Profit", "-$50.00", "+19%"]);
    expect(rows()[9][1]).toBe("–");
  });

  it("works nothing out: a profit that isn't revenue less expenses is drawn as it came", () => {
    show({ profit_cents: "123", expenses_cents: "777", revenue_cents: "5" });
    expect(rows()[0][1]).toBe("$0.05");
    expect(rows()[7][1]).toBe("$7.77");
    expect(rows()[8][1]).toBe("$1.23");
  });

  it("sends the backend's own sums past 2^53 cents to the cent", () => {
    show({ revenue_cents: "9007199254740993" });
    expect(rows()[0][1]).toBe("$90,071,992,547,409.93");
  });

  it("has no previous period at the start of time", () => {
    const reply = pageReply();
    render(
      <Statement
        period={reply.period}
        previousLabel={null}
        switcher={null}
        onOpen={vi.fn()}
        register={() => undefined}
      />,
    );
    expect(screen.getByText("Change", { selector: "p" })).toBeTruthy();
  });
});
