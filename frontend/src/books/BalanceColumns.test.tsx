import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { figures } from "./balance";
import { BalanceColumns } from "./BalanceColumns";
import { balancesReply } from "./test-balance";

function show(changes: Record<string, string> = {}, ready = true) {
  const onOpen = vi.fn();
  render(
    <BalanceColumns figures={ready ? figures(balancesReply("2026-10-31", changes).accounts) : null} onOpen={onOpen} />,
  );
  return onOpen;
}

const column = (name: string) => within(screen.getByRole("region", { name }));
const OWNS = "What the business owns";
const OWES = "What it owes and what's the owner's";

describe("BalanceColumns", () => {
  it("has the two columns, each with its accounts in order and its total", () => {
    show();
    expect(
      column(OWNS)
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual(["Cash$62,300.00", "Receivable$27,100.00"]);
    expect(
      column(OWES)
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual(["Payable$9,100.00", "Tax payable$1,800.00", "Owner's equity$40,000.00", "Profit to date$38,500.00"]);
    expect(column(OWNS).getByText("Total").parentElement?.textContent).toBe("Total$89,400.00");
    expect(column(OWES).getByText("Total").parentElement?.textContent).toBe("Total$89,400.00");
  });

  it("makes each account's figure a button and neither total one", () => {
    show();
    expect(screen.getAllByRole("button")).toHaveLength(6);
    expect(screen.queryByRole("button", { name: /Total/ })).toBeNull();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "$62,300.00",
      "$27,100.00",
      "$9,100.00",
      "$1,800.00",
      "$40,000.00",
      "$38,500.00",
    ]);
  });

  it("opens the figure clicked, with the button to give focus back to", async () => {
    const onOpen = show();
    await userEvent.click(screen.getByRole("button", { name: "Profit to date: $38,500.00" }));
    expect(onOpen).toHaveBeenCalledOnce();
    const [figure, opener] = onOpen.mock.calls[0];
    expect(figure.id).toBe("profit");
    expect(opener).toBe(screen.getByRole("button", { name: "Profit to date: $38,500.00" }));
  });

  it("shows a figure below zero with its minus sign, counted in the total at that value", () => {
    show({
      cash: "-425000",
      payable: "0",
      tax_payable: "0",
      owners_equity: "0",
      revenue: "0",
      expense_other: "0",
      expense_software: "0",
      expense_contractors: "0",
      expense_travel: "0",
      expense_office: "0",
      expense_marketing: "0",
    });
    expect(screen.getByRole("button", { name: "Cash: -$4,250.00" }).textContent).toBe("-$4,250.00");
    expect(column(OWNS).getByText("Total").parentElement?.textContent).toBe("Total$22,850.00");
  });

  it("says the two sides are equal with a Sea Green chip when they are", () => {
    show();
    const mark = screen.getByText("The two sides are equal.");
    expect(mark.className).toContain("bg-sea-green");
    expect(mark.className).toContain("text-midnight");
    expect(screen.queryByText("Out of balance")).toBeNull();
  });

  it("says out of balance with the difference when the owned side is higher", () => {
    show({ cash: "6242000" });
    const chip = screen.getByText("Out of balance");
    expect(chip.className).toContain("bg-chip-alert");
    expect(screen.getByRole("alert").textContent).toBe(
      "Out of balanceWhat the business owns is $120.00 more than what it owes and what belongs to the owner.",
    );
    expect(screen.queryByText("The two sides are equal.")).toBeNull();
  });

  it("says so the other way when the owed side is higher", () => {
    show({ cash: "6218000" });
    expect(screen.getByRole("alert").textContent).toBe(
      "Out of balanceWhat it owes and what belongs to the owner is $120.00 more than what the business owns.",
    );
  });

  it("shows a difference of one cent", () => {
    show({ cash: "6230001" });
    expect(screen.getByRole("alert").textContent).toContain("$0.01 more");
  });

  it("shows only the names and no mark before the first read has arrived", () => {
    show({}, false);
    expect(screen.getByText("Cash")).toBeTruthy();
    expect(screen.getByText("Profit to date")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/\$/)).toBeNull();
    expect(screen.queryByText("The two sides are equal.")).toBeNull();
  });

  it("shows each account's swatch in its color", () => {
    show();
    const swatches = [...document.querySelectorAll("li > span[aria-hidden]")].map((span) => span.className);
    expect(swatches.map((names) => names.split(" ").find((name) => name.startsWith("bg-")))).toEqual([
      "bg-sea-green",
      "bg-marigold",
      "bg-coral",
      "bg-cerulean",
      "bg-ink",
      "bg-bar-soft",
    ]);
  });
});
