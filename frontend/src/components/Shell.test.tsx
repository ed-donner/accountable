import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { queryDefaults } from "../App";
import { user } from "../test-utils";
import { Shell } from "./Shell";

const SECTIONS = ["Dashboard", "Organizations", "Contacts", "Deals", "Pipeline"];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 31, 12, 0) });
});

afterEach(() => {
  vi.useRealTimers();
});

/** The shell around a page per section, opened at one address. */
function openAt(path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: queryDefaults })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<p>The dashboard page</p>} />
            <Route path="/organizations" element={<p>The organizations page</p>} />
            <Route path="/contacts" element={<p>The contacts page</p>} />
            <Route path="/deals" element={<p>The deals page</p>} />
            <Route path="/deals/:id" element={<p>One deal's page</p>} />
            <Route path="/pipeline" element={<p>The pipeline page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function sections() {
  return within(screen.getByRole("navigation", { name: "Sections" }));
}

function currentSections() {
  return sections()
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent);
}

describe("the top bar", () => {
  it("links to the five sections, in order", () => {
    openAt("/");
    const links = sections().getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(SECTIONS);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/",
      "/organizations",
      "/contacts",
      "/deals",
      "/pipeline",
    ]);
  });

  it("shows the app's name and today's date", () => {
    openAt("/");
    expect(screen.getByText("Accountable")).toBeTruthy();
    expect(screen.getByText("Oct 31, 2026")).toBeTruthy();
  });

  it("marks the Dashboard as the section you're in on the Dashboard only", () => {
    openAt("/");
    expect(currentSections()).toEqual(["Dashboard"]);
  });

  it("marks a record's section while one of its records is open", () => {
    openAt("/deals/7");
    expect(currentSections()).toEqual(["Deals"]);
    expect(screen.getByRole("main").textContent).toBe("One deal's page");
  });

  it("opens a section from the top bar, and keeps the bar there", async () => {
    openAt("/");
    expect(screen.getByRole("main").textContent).toBe("The dashboard page");

    await user().click(sections().getByRole("link", { name: "Pipeline" }));

    expect(screen.getByRole("main").textContent).toBe("The pipeline page");
    expect(currentSections()).toEqual(["Pipeline"]);
  });
});
