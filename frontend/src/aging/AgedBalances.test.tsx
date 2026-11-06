import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { queryDefaults } from "../lib/queryDefaults";
import { mockApi, user, type Call } from "../test-utils";
import { AgedBalances } from "./AgedBalances";
import { TODAY, customersReply, sizeTheBars, suppliersReply } from "./test-aged";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: TODAY });
  sizeTheBars();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const REPLIES = {
  "GET /aged-balances/customers": customersReply(),
  "GET /aged-balances/suppliers": suppliersReply(),
  "GET /aged-balances/customers?on=2026-10-31": customersReply("2026-10-31"),
  "GET /aged-balances/suppliers?on=2026-10-31": suppliersReply("2026-10-31"),
};

function open(address = "/accounting/aged-balances", routes: Record<string, unknown> = REPLIES) {
  const calls = mockApi(routes);
  const router = createMemoryRouter([{ path: "/accounting/aged-balances", element: <AgedBalances /> }], {
    initialEntries: [address],
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: queryDefaults })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { calls, router };
}

function reads(calls: Call[]) {
  return calls.filter((call) => call.path.startsWith("/aged-balances")).map((call) => call.path);
}

function picker() {
  return screen.getByLabelText("Balances as of") as HTMLInputElement;
}

function searchOf(router: ReturnType<typeof open>["router"]) {
  return router.state.location.search;
}

describe("the page", () => {
  it("opens on Customers and today, with the title, the picker and the report", async () => {
    const { calls } = open();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Aged balances");
    expect(await screen.findByRole("link", { name: "Bluebird Bakery" })).toBeTruthy();
    expect(reads(calls)).toEqual(["/aged-balances/customers"]);
    expect(picker().value).toBe("2026-11-05");
    expect(picker().max).toBe("2026-11-05");
    expect(screen.getByText("Money customers owe on issued invoices, by how late it is.")).toBeTruthy();
    expect(screen.queryByText(/Balances as of Nov/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Back to today" })).toBeNull();
    expect(document.title).toBe("Aged balances | Accountable");
  });

  it("shows placeholders while the view loads", () => {
    open();
    expect(screen.getAllByTestId("placeholder-row").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Aged balances" }).getAttribute("aria-busy")).toBe("true");
  });

  it("reads the view and the day from the address", async () => {
    const { calls } = open("/accounting/aged-balances?view=suppliers&on=2026-10-31");
    expect(await screen.findByRole("link", { name: "Wayfarer Travel" })).toBeTruthy();
    expect(reads(calls)).toEqual(["/aged-balances/suppliers?on=2026-10-31"]);
    expect(picker().value).toBe("2026-10-31");
    expect(screen.getByText("Money the business owes on bills, by how late it is.")).toBeTruthy();
    expect(screen.getByText("Balances as of Oct 31, 2026")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to today" })).toBeTruthy();
  });

  it.each(["soon", "2026-02-30", "2026-11-05", "2026-11-06", "2099-01-01"])(
    "drops an on of %s from the address and shows today",
    async (on) => {
      const { calls, router } = open(`/accounting/aged-balances?on=${on}`);
      await waitFor(() => expect(searchOf(router)).toBe(""));
      expect(await screen.findByRole("link", { name: "Bluebird Bakery" })).toBeTruthy();
      expect(reads(calls)).toEqual(["/aged-balances/customers"]);
      expect(picker().value).toBe("2026-11-05");
    },
  );

  it("keeps a day picked in the address, and reads it", async () => {
    const { calls, router } = open();
    await screen.findByRole("link", { name: "Bluebird Bakery" });

    fireEvent.change(picker(), { target: { value: "2026-10-31" } });

    expect(await screen.findByText("Balances as of Oct 31, 2026")).toBeTruthy();
    expect(searchOf(router)).toBe("?on=2026-10-31");
    expect(reads(calls)).toEqual(["/aged-balances/customers", "/aged-balances/customers?on=2026-10-31"]);
  });

  it("keeps the table on screen while another day is read", async () => {
    const { router } = open();
    await screen.findByRole("link", { name: "Bluebird Bakery" });
    fireEvent.change(picker(), { target: { value: "2026-10-31" } });
    expect(screen.getByRole("link", { name: "Bluebird Bakery" })).toBeTruthy();
    await waitFor(() => expect(searchOf(router)).toBe("?on=2026-10-31"));
  });

  it("doesn't write today to the address, and Back to today takes the day out", async () => {
    const { router } = open("/accounting/aged-balances?view=suppliers&on=2026-10-31");
    await screen.findByRole("link", { name: "Wayfarer Travel" });

    await user().click(screen.getByRole("button", { name: "Back to today" }));

    await waitFor(() => expect(searchOf(router)).toBe("?view=suppliers"));
    expect(picker().value).toBe("2026-11-05");
    fireEvent.change(picker(), { target: { value: "2026-10-31" } });
    await waitFor(() => expect(searchOf(router)).toBe("?view=suppliers&on=2026-10-31"));
    fireEvent.change(picker(), { target: { value: "2026-11-05" } });
    await waitFor(() => expect(searchOf(router)).toBe("?view=suppliers"));
  });

  it("ignores a cleared picker", async () => {
    const { router } = open("/accounting/aged-balances?on=2026-10-31");
    await screen.findByRole("link", { name: "Bluebird Bakery" });
    fireEvent.change(picker(), { target: { value: "" } });
    expect(searchOf(router)).toBe("?on=2026-10-31");
  });
});

describe("the two views", () => {
  it("switch by mouse, keeping the day, and Customers leaves the address clean", async () => {
    const { router } = open("/accounting/aged-balances?on=2026-10-31");
    await screen.findByRole("link", { name: "Bluebird Bakery" });
    const clicks = user();

    await clicks.click(screen.getByRole("radio", { name: "Suppliers" }));

    expect(await screen.findByRole("link", { name: "Northwind Software" })).toBeTruthy();
    expect(searchOf(router)).toBe("?on=2026-10-31&view=suppliers");
    await clicks.click(screen.getByRole("radio", { name: "Customers" }));
    expect(await screen.findByRole("link", { name: "Bluebird Bakery" })).toBeTruthy();
    expect(searchOf(router)).toBe("?on=2026-10-31");
  });

  it("move with the arrow keys, and pressing the chosen one leaves it chosen", async () => {
    const { router } = open();
    await screen.findByRole("link", { name: "Bluebird Bakery" });
    const clicks = user();
    const customers = screen.getByRole("radio", { name: "Customers" });
    expect(customers.getAttribute("aria-checked")).toBe("true");

    customers.focus();
    await clicks.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Suppliers" }));
    await clicks.keyboard(" ");

    expect(await screen.findByRole("link", { name: "Wayfarer Travel" })).toBeTruthy();
    expect(searchOf(router)).toBe("?view=suppliers");
    await clicks.click(screen.getByRole("radio", { name: "Suppliers" }));
    expect(screen.getByRole("radio", { name: "Suppliers" }).getAttribute("aria-checked")).toBe("true");
    expect(searchOf(router)).toBe("?view=suppliers");
  });

  it("start with nothing open when the view changes", async () => {
    open();
    const clicks = user();
    await clicks.click(await screen.findByRole("button", { name: "Invoices of Harbor & Pine" }));
    expect(screen.getByRole("list", { name: "Invoices" })).toBeTruthy();
    await clicks.click(screen.getByRole("radio", { name: "Suppliers" }));
    await clicks.click(await screen.findByRole("button", { name: "Bills of Wayfarer Travel" }));
    await clicks.click(screen.getByRole("radio", { name: "Customers" }));
    await screen.findByRole("link", { name: "Bluebird Bakery" });
    expect(screen.queryByRole("list", { name: "Invoices" })).toBeNull();
  });
});

describe("when a read fails", () => {
  it("says so with Try again, keeping the picker usable, and reads again on it", async () => {
    let failing = true;
    const { calls } = open("/accounting/aged-balances", {
      "GET /aged-balances/customers": () =>
        failing ? { status: 500, body: { detail: "Something went wrong." } } : { body: customersReply() },
    });
    expect(await screen.findByText("Couldn't load this.")).toBeTruthy();
    expect(picker().disabled).toBe(false);
    failing = false;

    await user().click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("link", { name: "Bluebird Bakery" })).toBeTruthy();
    expect(reads(calls).length).toBeGreaterThan(1);
  });
});

describe("the day passing", () => {
  function passMidnight() {
    act(() => {
      vi.setSystemTime(new Date(2026, 10, 6, 0, 5));
      window.dispatchEvent(new Event("focus"));
    });
  }

  it("moves a report on today to the new day and reads it again", async () => {
    const { calls } = open();
    await screen.findByRole("link", { name: "Bluebird Bakery" });

    passMidnight();

    await waitFor(() => expect(picker().max).toBe("2026-11-06"));
    expect(picker().value).toBe("2026-11-06");
    await waitFor(() => expect(reads(calls)).toEqual(["/aged-balances/customers", "/aged-balances/customers"]));
  });

  it("leaves a day that was chosen alone, and reads nothing again", async () => {
    const { calls } = open("/accounting/aged-balances?on=2026-10-31");
    await screen.findByRole("link", { name: "Bluebird Bakery" });

    passMidnight();

    await waitFor(() => expect(picker().max).toBe("2026-11-06"));
    expect(picker().value).toBe("2026-10-31");
    await act(async () => {});
    expect(reads(calls)).toEqual(["/aged-balances/customers?on=2026-10-31"]);
  });
});
