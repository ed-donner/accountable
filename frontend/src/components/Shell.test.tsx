import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { queryDefaults } from "../lib/queryDefaults";
import { mockApi, user } from "../test-utils";
import { Shell, type Section } from "./Shell";

const PATHS = ["/", "/organizations", "/contacts", "/deals", "/pipeline", "/products"];
const LABELS = ["Dashboard", "Organizations", "Contacts", "Deals", "Pipeline", "Products"];
const SECTIONS: Section[] = PATHS.map((to, place) => ({
  to,
  label: LABELS[place],
  icon: <svg aria-hidden="true" data-testid={`${LABELS[place]} icon`} />,
}));

const MENU_LINKS = [{ label: "Reports", links: [{ label: "A report", to: "/reports/a" }] }];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 31, 12, 0) });
  mockApi({ "GET /me": { id: "alex", name: "Alex Rivera", email: "alex@accountable.example", initials: "AR" } });
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
          <Route
            element={
              <Shell sections={SECTIONS} search={<input aria-label="The search box" />} menuLinks={MENU_LINKS} />
            }
          >
            <Route path="/" element={<p>The dashboard page</p>} />
            <Route path="/organizations" element={<p>The organizations page</p>} />
            <Route path="/contacts" element={<p>The contacts page</p>} />
            <Route path="/deals" element={<p>The deals page</p>} />
            <Route path="/deals/:id" element={<p>One deal's page</p>} />
            <Route path="/pipeline" element={<p>The pipeline page</p>} />
            <Route path="/products" element={<p>The products page</p>} />
            <Route path="/settings" element={<p>The Company settings page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The names of these elements, in the order they come in the page. */
function inPageOrder(elements: Record<string, Element>) {
  const comesAfter = (a: Element, b: Element) =>
    Boolean(b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
  return Object.entries(elements)
    .sort(([, a], [, b]) => (comesAfter(a, b) ? 1 : -1))
    .map(([name]) => name);
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
  it("links to the sections it's given, in their order, each with its icon before its label", () => {
    openAt("/");
    const links = sections().getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(LABELS);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(PATHS);
    for (const link of links) {
      expect(within(link).getByTestId(`${link.textContent} icon`)).toBeTruthy();
    }
  });

  it("shows the app's name and today's date, which never wraps", () => {
    openAt("/");
    expect(screen.getByText("Accountable")).toBeTruthy();
    expect(screen.getByText("Oct 31, 2026").className).toContain("whitespace-nowrap");
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

  it("marks no section as current on the Company settings page, which isn't one of them", () => {
    openAt("/settings");
    expect(currentSections()).toEqual([]);
    expect(screen.getByRole("main").textContent).toBe("The Company settings page");
  });

  it.each(["/", "/organizations", "/contacts", "/deals", "/pipeline", "/products", "/deals/7", "/settings"])(
    "has the search box after the sections, then the date and the menu button, at %s",
    async (path) => {
      openAt(path);
      const bar = within(screen.getByRole("banner"));
      const menuButton = await bar.findByRole("button", { name: "Menu for Alex Rivera" });
      const parts = {
        sections: bar.getByRole("navigation", { name: "Sections" }),
        search: bar.getByRole("textbox", { name: "The search box" }),
        date: bar.getByText("Oct 31, 2026"),
        menu: menuButton,
      };
      expect(inPageOrder(parts)).toEqual(["sections", "search", "date", "menu"]);
      expect(menuButton.nextElementSibling).toBeNull();
      expect(bar.getAllByRole("button")).toEqual([menuButton]);
    },
  );

  it("gives the menu the groups of links it's handed, and the nine-section bar gains no link for them", async () => {
    openAt("/");
    expect(
      sections()
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(LABELS);
    await user().click(await screen.findByRole("button", { name: "Menu for Alex Rivera" }));

    const menu = within(screen.getByRole("menu"));
    expect(menu.getByText("Reports")).toBeTruthy();
    expect(menu.getByRole("menuitem", { name: "A report" })).toBeTruthy();
  });

  it("opens a section from the top bar, and keeps the bar there", async () => {
    openAt("/");
    expect(screen.getByRole("main").textContent).toBe("The dashboard page");

    await user().click(sections().getByRole("link", { name: "Pipeline" }));

    expect(screen.getByRole("main").textContent).toBe("The pipeline page");
    expect(currentSections()).toEqual(["Pipeline"]);

    await user().click(sections().getByRole("link", { name: "Products" }));

    expect(screen.getByRole("main").textContent).toBe("The products page");
    expect(currentSections()).toEqual(["Products"]);
  });
});
