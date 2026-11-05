import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DealDetail, OrganizationDetail, Stage } from "../crm/queries";
import { queryDefaults } from "../lib/queryDefaults";
import { mockApi } from "../test-utils";
import { dealQuotesPanel, organizationQuotesPanel } from "./panels";
import type { QuoteRow } from "./queries";

function quote(id: number, changes: Partial<QuoteRow> = {}): QuoteRow {
  return {
    id,
    number: `QT-${String(id).padStart(4, "0")}`,
    status: "sent",
    deal_id: 12,
    deal_name: "Renewal and upgrade",
    deal_stage: "proposal",
    organization_id: 3,
    organization_name: "Harbor & Pine",
    quote_date: "2026-11-01",
    valid_until: "2026-12-01",
    subtotal_cents: 4_800_050,
    tax_cents: 0,
    total_cents: 4_800_050,
    ...changes,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 5, 12, 0) });
});

afterEach(() => {
  vi.useRealTimers();
});

function show(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: queryDefaults });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
  return within(screen.getByRole("region", { name: "Quotes" }));
}

function deal(stage: Stage) {
  return { id: 12, name: "Renewal and upgrade", stage } as DealDetail;
}

const DealPanel = dealQuotesPanel.Panel;
const OrganizationPanel = organizationQuotesPanel.Panel;

describe("a deal's Quotes panel", () => {
  it("lists its quotes, newest first, with their chips and values, each opening its quote (Q36)", async () => {
    const calls = mockApi({
      "GET /quotes?deal_id=12": [quote(4, { valid_until: "2026-11-04" }), quote(3, { status: "declined" })],
    });
    const panel = show(<DealPanel record={deal("proposal")} />);
    const links = await panel.findAllByRole("link", { name: /^QT-/ });
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["QT-0004", "/quotes/4"],
      ["QT-0003", "/quotes/3"],
    ]);
    const items = panel.getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual(["QT-0004$48,000.50Expired", "QT-0003$48,000.50Declined"]);
    expect(calls.map((call) => call.path)).toEqual(["/quotes?deal_id=12"]);
  });

  it("offers New quote on an open deal", async () => {
    mockApi({ "GET /quotes?deal_id=12": [] });
    const panel = show(<DealPanel record={deal("negotiation")} />);
    expect(await panel.findByText("No quotes yet.")).toBeTruthy();
    expect(panel.getByRole("link", { name: "New quote" }).getAttribute("href")).toBe("/quotes/new?deal=12");
  });

  it.each<Stage>(["won", "lost"])("has no New quote on a deal that's %s, and says why (Q8)", async (stage) => {
    mockApi({ "GET /quotes?deal_id=12": [quote(4, { status: "accepted" })] });
    const panel = show(<DealPanel record={deal(stage)} />);
    expect(await panel.findByText("QT-0004")).toBeTruthy();
    expect(panel.queryByRole("link", { name: "New quote" })).toBeNull();
    expect(panel.getByText("Quotes can be added while the deal is open.")).toBeTruthy();
  });
});

describe("an organization's Quotes panel", () => {
  it("lists the quotes on its deals with each deal's name, and no New quote (Q37)", async () => {
    mockApi({
      "GET /quotes?organization_id=3": [quote(5, { deal_name: "Kiosks", status: "draft" }), quote(4)],
    });
    const panel = show(<OrganizationPanel record={{ id: 3, name: "Harbor & Pine" } as OrganizationDetail} />);
    await panel.findByText("QT-0005");
    expect(panel.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "QT-0005Kiosks · $48,000.50Draft",
      "QT-0004Renewal and upgrade · $48,000.50Sent",
    ]);
    expect(panel.queryByRole("link", { name: "New quote" })).toBeNull();
  });

  it("says when there are none", async () => {
    mockApi({ "GET /quotes?organization_id=3": [] });
    const panel = show(<OrganizationPanel record={{ id: 3, name: "Harbor & Pine" } as OrganizationDetail} />);
    expect(await panel.findByText("No quotes yet.")).toBeTruthy();
  });
});
