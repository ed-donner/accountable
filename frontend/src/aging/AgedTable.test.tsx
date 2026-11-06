import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderApp, user } from "../test-utils";
import { AgedTable, PAGE } from "./AgedTable";
import { readAged, type View } from "./queries";
import { agedReply, customersReply, row, sizeTheBars, suppliersReply } from "./test-aged";

beforeEach(sizeTheBars);
afterEach(() => vi.unstubAllGlobals());

function show(reply = customersReply(), view: View = "customers") {
  return renderApp(<AgedTable aged={readAged(reply)} view={view} />);
}

function rows() {
  return within(screen.getByRole("table")).getAllByRole("row");
}

describe("the table", () => {
  it("has a legend naming the five parts, and the columns of the design", () => {
    show();
    const legend = within(screen.getByRole("list", { name: "Parts" })).getAllByRole("listitem");
    expect(legend.map((item) => item.textContent)).toEqual([
      "Not yet due",
      "1 to 30 days",
      "31 to 60 days",
      "61 to 90 days",
      "Over 90 days",
    ]);
    const headings = within(screen.getByRole("table")).getAllByRole("columnheader");
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Organization",
      "How it is spread by how late",
      "Not yet due",
      "1 to 30 days",
      "31 to 60 days",
      "61 to 90 days",
      "Over 90 days",
      "Total owed",
    ]);
  });

  it("lists each organization in the order given, with its parts and total in cents", () => {
    show();
    const [, bluebird, harbor] = rows();
    expect(within(bluebird).getByRole("link", { name: "Bluebird Bakery" }).getAttribute("href")).toBe(
      "/organizations/1",
    );
    expect([...bluebird.querySelectorAll("td")].slice(2).map((cell) => cell.textContent)).toEqual([
      "$0.00",
      "$0.00",
      "$0.00",
      "$0.00",
      "$5,000.00",
      "$5,000.00",
    ]);
    expect([...harbor.querySelectorAll("td")].slice(2).map((cell) => cell.textContent)).toEqual([
      "$1,000.00",
      "$2,000.00",
      "$0.00",
      "$0.00",
      "$0.00",
      "$3,000.00",
    ]);
  });

  it("shows an amount in the number font, an empty part in muted ink and the total in semibold ink", () => {
    show();
    const cells = [...rows()[2].querySelectorAll("td")].slice(2);
    expect(cells[0].querySelector("span")!.className).toBe("num ");
    expect(cells[2].querySelector("span")!.className).toContain("text-muted");
    expect(cells[2].querySelector("span")!.className).toContain("num");
    expect(cells[5].querySelector("span")!.className).toContain("font-semibold");
  });

  it("ends in a totals row for every organization, with no bar", () => {
    show();
    const all = rows();
    const total = all[all.length - 1];
    expect(within(total).getByRole("rowheader").textContent).toBe("Total");
    expect([...total.querySelectorAll("td")].slice(1).map((cell) => cell.textContent)).toEqual([
      "$1,000.00",
      "$2,000.00",
      "$1,500.00",
      "$0.00",
      "$5,010.00",
      "$9,510.00",
    ]);
    expect(total.querySelector("[data-testid^=bar-]")).toBeNull();
  });

  it("says nothing is owed, in the view's words, with the legend still there", () => {
    show(agedReply([]), "customers");
    expect(screen.getByText("Nothing owed.")).toBeTruthy();
    expect(screen.getByText("Customers owe nothing on this day.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("list", { name: "Parts" })).toBeTruthy();
  });

  it("says it in the suppliers' words too", () => {
    show(agedReply([]), "suppliers");
    expect(screen.getByText("The business owes nothing on this day.")).toBeTruthy();
  });
});

describe("opening a row", () => {
  it("shows its open invoices on a click, and hides them on the next", async () => {
    show();
    const clicks = user();
    const opener = screen.getByRole("button", { name: "Invoices of Harbor & Pine" });
    expect(opener.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list", { name: "Invoices" })).toBeNull();

    await clicks.click(opener);

    expect(opener.getAttribute("aria-expanded")).toBe("true");
    const items = within(screen.getByRole("list", { name: "Invoices" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "INV-20Nov 15, 2026Not yet dueNot yet due$1,000.00",
      "INV-21Oct 24, 202612 days1 to 30 days$2,000.00",
    ]);
    await clicks.click(opener);
    expect(opener.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list", { name: "Invoices" })).toBeNull();
  });

  it("opens from anywhere in the row, but not from the organization's own link", async () => {
    show();
    const clicks = user();
    await clicks.click(screen.getByText("$3,000.00"));
    expect(screen.getByRole("button", { name: "Invoices of Harbor & Pine" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    await clicks.click(screen.getByRole("link", { name: "Bluebird Bakery" }));
    expect(screen.getByRole("button", { name: "Invoices of Bluebird Bakery" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it.each(["{Enter}", " "])("opens with the keyboard on %j", async (key) => {
    show();
    const clicks = user();
    await clicks.tab();
    const opener = screen.getByRole("button", { name: "Invoices of Bluebird Bakery" });
    expect(document.activeElement).toBe(opener);
    await clicks.keyboard(key);
    expect(opener.getAttribute("aria-expanded")).toBe("true");
    await clicks.keyboard(key);
    expect(opener.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps several open at once", async () => {
    show();
    const clicks = user();
    await clicks.click(screen.getByRole("button", { name: "Invoices of Harbor & Pine" }));
    await clicks.click(screen.getByRole("button", { name: "Invoices of Bluebird Bakery" }));
    expect(screen.getAllByRole("list", { name: "Invoices" })).toHaveLength(2);
  });

  it("links each invoice's number to the invoice, and each bill's to the bill", async () => {
    show();
    const clicks = user();
    await clicks.click(screen.getByRole("button", { name: "Invoices of Harbor & Pine" }));
    expect(screen.getByRole("link", { name: "INV-21" }).getAttribute("href")).toBe("/invoices/21");
  });

  it("opens bills in the suppliers' view, with the supplier's own numbers", async () => {
    show(suppliersReply(), "suppliers");
    await user().click(screen.getByRole("button", { name: "Bills of Wayfarer Travel" }));
    const link = screen.getByRole("link", { name: "WT-81" });
    expect(link.getAttribute("href")).toBe("/bills/81");
    expect(within(screen.getByRole("list", { name: "Bills" })).getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("showing more", () => {
  const MANY = Array.from({ length: PAGE + 5 }, (_, place) => row(place + 1, `Org ${place + 1}`, [0, 1000, 0, 0, 0]));

  it("shows the first 25, then the next on the button, above the totals row", async () => {
    show(agedReply(MANY));
    expect(screen.getAllByRole("link", { name: /^Org / })).toHaveLength(PAGE);
    const last = rows();
    expect(within(last[last.length - 1]).getByRole("rowheader").textContent).toBe("Total");
    expect(within(last[last.length - 2]).getByRole("button", { name: "Show 5 more" })).toBeTruthy();

    await user().click(screen.getByRole("button", { name: "Show 5 more" }));

    expect(screen.getAllByRole("link", { name: /^Org / })).toHaveLength(PAGE + 5);
    expect(screen.queryByRole("button", { name: /Show/ })).toBeNull();
  });

  it("says 25 more when at least that many are left, and totals every organization, not the ones on screen", () => {
    show(agedReply([...MANY, ...MANY.map((one) => ({ ...one, id: one.id + 100 }))]));
    expect(screen.getByRole("button", { name: "Show 25 more" })).toBeTruthy();
    const all = rows();
    expect(all[all.length - 1].textContent).toContain("$600.00");
  });
});
