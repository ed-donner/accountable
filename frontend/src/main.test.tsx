import { act, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// The app's modules load with this file, so the test's own time is starting the app.
import "./App";
import { cashFlowReply } from "./cashflow/test-cash-flow";
import { META, mockApi, user } from "./test-utils";

describe("starting the app", () => {
  it("puts it in the page's root element, on the sign-in screen and then the Dashboard", async () => {
    mockApi({
      "GET /meta": META,
      "GET /me": { id: "alex", name: "Alex Rivera", email: "alex@accountable.example", initials: "AR" },
      "GET /local/teammates": [{ id: "alex", name: "Alex Rivera", email: "alex@accountable.example", initials: "AR" }],
      "POST /local/sign-in": { token: "alex-token" },
      "GET /cash-flow": cashFlowReply(),
      "GET /invoices/money": {
        owed: { cents: "0", count: 0 },
        overdue: { cents: "0", count: 0 },
        groups: [],
        payments: [
          { month: "2026-09", label: "Sep", cents: "0", count: 0 },
          { month: "2026-10", label: "Oct", cents: "0", count: 0 },
        ],
      },
      "GET /bills/dashboard": {
        today: "2026-10-31",
        owed: { total_cents: "0", count: 0 },
        overdue: { total_cents: "0", count: 0 },
        due: { total_cents: "0", count: 0, bills: [] },
        // The route always gives 12 months. The section reads the last two.
        months: ["Sep", "Oct"].map((label, index) => ({
          month: `2026-${index === 0 ? "09" : "10"}`,
          label,
          total_cents: "0",
          categories: { software: "0", contractors: "0", travel: "0", office: "0", marketing: "0", other: "0" },
        })),
      },
    });
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);

    await act(() => import("./main"));

    const page = within(root);
    expect((await page.findByRole("heading", { level: 1 })).textContent).toBe("Sign in");
    expect(page.queryByRole("navigation", { name: "Sections" })).toBeNull();

    await user().click(await page.findByRole("button", { name: /^Alex Rivera/ }));

    expect(await page.findByRole("heading", { level: 1, name: "Dashboard" })).toBeTruthy();
    expect(page.getByRole("navigation", { name: "Sections" })).toBeTruthy();
    const bar = within(page.getByRole("banner"));
    expect(bar.getByLabelText("Search organizations, contacts, deals and products")).toBeTruthy();
    expect(await bar.findByRole("button", { name: "Menu for Alex Rivera" })).toBeTruthy();
    const money = within(await page.findByRole("region", { name: "Money" }));
    expect(await money.findByRole("region", { name: "Cash flow" })).toBeTruthy();
    expect(await money.findByRole("region", { name: "Owed to us" })).toBeTruthy();
    expect(await money.findByRole("region", { name: "What we owe" })).toBeTruthy();
  });
});
