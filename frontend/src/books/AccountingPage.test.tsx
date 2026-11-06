import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { AgedBalances } from "./pages/AgedBalances";
import { Journal } from "./pages/Journal";
import { Shell, type Section } from "../components/Shell";
import { queryDefaults } from "../lib/queryDefaults";
import { mockApi } from "../test-utils";
import { ACCOUNTING_LINKS } from "./links";

const SECTIONS: Section[] = Array.from({ length: 9 }, (_, place) => ({
  to: `/section-${place}`,
  label: `Section ${place}`,
  icon: <svg aria-hidden="true" />,
}));

const PAGES = [
  [
    "/accounting/journal",
    Journal,
    "Journal",
    "Every entry in the books, newest first, each linking to the invoice, payment or bill it came from.",
  ],
  [
    "/accounting/aged-balances",
    AgedBalances,
    "Aged balances",
    "What customers owe and what the business owes, grouped by how late each amount is.",
  ],
] as const;

function openAt(address: string) {
  const calls = mockApi({});
  const router = createMemoryRouter(
    [
      {
        element: <Shell sections={SECTIONS} search={null} menuLinks={[ACCOUNTING_LINKS]} />,
        children: PAGES.map(([path, Page]) => ({ path, element: <Page /> })),
      },
    ],
    { initialEntries: [address] },
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: queryDefaults })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return calls;
}

describe("the Accounting pages", () => {
  it.each(PAGES)("%s says its report is coming, and what it will show", (address, _page, title, words) => {
    openAt(address);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title);
    expect(screen.getByText("This report is coming soon.").className).toContain("font-semibold");
    expect(screen.getByText(words).className).toContain("text-muted");
    expect(document.title).toBe(`${title} | Accountable`);
  });

  it.each(PAGES)("%s has an Info icon in Cerulean and no button, figure or table", (address) => {
    openAt(address);
    const main = screen.getByRole("main");
    expect(main.querySelector("svg.lucide-info")?.getAttribute("class")).toContain("text-cerulean");
    expect(main.querySelectorAll("button, table, figure, input, a")).toHaveLength(0);
  });

  it.each(PAGES)("%s reads nothing from the backend", (address) => {
    const calls = openAt(address);
    expect(screen.getByText("This report is coming soon.")).toBeTruthy();
    expect(calls.filter((call) => !call.path.startsWith("/me"))).toEqual([]);
  });

  it.each(PAGES)("%s marks no section as current and leaves the bar its nine", (address) => {
    openAt(address);
    const bar = screen.getByRole("navigation", { name: "Sections" });
    expect(bar.querySelectorAll("a")).toHaveLength(9);
    expect(bar.querySelector('[aria-current="page"]')).toBeNull();
  });
});
