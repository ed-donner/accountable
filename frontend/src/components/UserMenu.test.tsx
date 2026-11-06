import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { ACCOUNTING_LINKS } from "../books/links";
import { queryDefaults } from "../lib/queryDefaults";
import { useSession } from "../lib/session";
import { THEME_KEY } from "../lib/theme";
import { mockApi, startSignedIn, user } from "../test-utils";
import { UserMenu } from "./UserMenu";

const ALEX = { id: "alex", name: "Alex Rivera", email: "alex@accountable.example", initials: "AR" };
const ROBIN = { id: "robin", name: "robin@accountable.example", email: "robin@accountable.example", initials: "R" };

const root = document.documentElement;
const ACCOUNTING = ["Profit and loss", "Balance sheet", "Journal", "Aged balances"];

/** Where the app is and whether anyone is signed in, as the rest of the page would see them. */
function Surroundings() {
  const { pathname } = useLocation();
  const { status } = useSession();
  return (
    <p>
      At {pathname}, {status}
    </p>
  );
}

function openMenuAt(path = "/") {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: queryDefaults })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <UserMenu groups={[ACCOUNTING_LINKS]} />
                <Surroundings />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function menuButton() {
  return screen.findByRole("button", { name: "Menu for Alex Rivera" });
}

function menu() {
  return within(screen.getByRole("menu"));
}

/** The menu's plain items, in order, after the themes. */
function items() {
  return menu()
    .getAllByRole("menuitem")
    .map((item) => item.textContent);
}

function themes() {
  return menu()
    .getAllByRole("menuitemradio")
    .map((item) => `${item.textContent}${item.getAttribute("aria-checked") === "true" ? " (checked)" : ""}`);
}

/** Stands in for the device's light or dark setting, which jsdom doesn't have. */
function standInDevice(dark: boolean) {
  vi.stubGlobal("matchMedia", () => ({ matches: dark, addEventListener() {}, removeEventListener() {} }));
}

describe("the menu button", () => {
  it("shows the initials, and is labeled with the person's name", async () => {
    mockApi({ "GET /me": ALEX });
    openMenuAt();
    expect((await menuButton()).textContent).toBe("AR");
  });

  it("still opens the menu, with the themes, Company settings and Sign out, when the backend can't say who's signed in", async () => {
    mockApi({});
    openMenuAt();
    await user().click(screen.getByRole("button", { name: "Menu" }));
    expect(themes()).toEqual(["Light (checked)", "Dark", "System"]);
    expect(items()).toEqual([...ACCOUNTING, "Company settings", "Sign out"]);
  });
});

describe("the menu", () => {
  it("shows the name and email, the three themes with a check by the current one, Company settings and Sign out", async () => {
    mockApi({ "GET /me": ALEX });
    openMenuAt();
    await user().click(await menuButton());

    expect(menu().getByText("Alex Rivera")).toBeTruthy();
    expect(menu().getByText("alex@accountable.example")).toBeTruthy();
    expect(menu().getByText("Theme")).toBeTruthy();
    expect(within(menu().getByRole("group", { name: "Theme" })).getAllByRole("menuitemradio")).toHaveLength(3);
    expect(themes()).toEqual(["Light (checked)", "Dark", "System"]);
    expect(items()).toEqual([...ACCOUNTING, "Company settings", "Sign out"]);
  });

  it("shows the email once for someone with no display name", async () => {
    mockApi({ "GET /me": ROBIN });
    openMenuAt();
    const button = await screen.findByRole("button", { name: "Menu for robin@accountable.example" });
    expect(button.textContent).toBe("R");

    await user().click(button);

    expect(menu().getAllByText("robin@accountable.example")).toHaveLength(1);
  });

  it("checks the theme saved in this browser", async () => {
    localStorage.setItem(THEME_KEY, "system");
    mockApi({ "GET /me": ALEX });
    openMenuAt();
    await user().click(await menuButton());
    expect(themes()).toEqual(["Light", "Dark", "System (checked)"]);
  });

  it("applies a theme as soon as it's chosen, saves it and closes", async () => {
    mockApi({ "GET /me": ALEX });
    openMenuAt();
    const clicks = user();
    await clicks.click(await menuButton());

    await clicks.click(menu().getByRole("menuitemradio", { name: "Dark" }));

    expect(root.dataset.mode).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(screen.queryByRole("menu")).toBeNull();

    await clicks.click(await menuButton());
    expect(themes()).toEqual(["Light", "Dark (checked)", "System"]);
  });

  it("shows the device's mode once System is chosen", async () => {
    standInDevice(true);
    mockApi({ "GET /me": ALEX });
    openMenuAt();
    const clicks = user();
    await clicks.click(await menuButton());

    await clicks.click(menu().getByRole("menuitemradio", { name: "System" }));

    expect(root.dataset.mode).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("system");
  });

  it("works by keyboard: Enter opens it, the arrow keys move, Enter chooses and Escape closes", async () => {
    mockApi({ "GET /me": ALEX });
    openMenuAt();
    const button = await menuButton();
    const keys = user();
    await keys.tab();
    expect(document.activeElement).toBe(button);

    await keys.keyboard("{Enter}");
    expect(document.activeElement?.textContent).toBe("Light");
    await keys.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Dark");
    await keys.keyboard("{Enter}");

    expect(root.dataset.mode).toBe("dark");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);

    await keys.keyboard("{Enter}");
    expect(screen.getByRole("menu")).toBeTruthy();
    await keys.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it.each([
    ["with the person", { "GET /me": ALEX }, "Menu for Alex Rivera"],
    ["without the person", {}, "Menu"],
  ])("opens the Company settings page and closes, %s", async (_case, routes, button) => {
    startSignedIn();
    mockApi(routes);
    openMenuAt("/deals/7");
    const clicks = user();
    await clicks.click(await screen.findByRole("button", { name: button }));

    await clicks.click(menu().getByRole("menuitem", { name: "Company settings" }));

    expect(await screen.findByText("At /settings, signed-in")).toBeTruthy();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("has Accounting as a label in muted ink between the themes and Company settings, over its four links", async () => {
    mockApi({ "GET /me": ALEX });
    openMenuAt();
    await user().click(await menuButton());

    const label = menu().getByText("Accounting");
    expect(label.className).toContain("text-muted");
    const group = menu().getByRole("group", { name: "Accounting" });
    expect(
      within(group)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(ACCOUNTING);
    const order = [
      menu().getByRole("group", { name: "Theme" }),
      group,
      menu().getByRole("menuitem", { name: "Company settings" }),
    ];
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(menu().queryAllByRole("img")).toEqual([]);
  });

  it.each([
    ["with the person", { "GET /me": ALEX }, "Menu for Alex Rivera"],
    ["without the person", {}, "Menu"],
  ])("opens an Accounting page and closes the menu on choosing its link, %s", async (_case, routes, button) => {
    startSignedIn();
    mockApi(routes);
    openMenuAt("/deals/7");
    const clicks = user();
    await clicks.click(await screen.findByRole("button", { name: button }));

    await clicks.click(menu().getByRole("menuitem", { name: "Journal" }));

    expect(await screen.findByText("At /accounting/journal, signed-in")).toBeTruthy();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("moves through the Accounting links with the arrow keys and closes with Escape, focus back on the button", async () => {
    mockApi({ "GET /me": ALEX });
    openMenuAt();
    const button = await menuButton();
    const keys = user();
    await keys.tab();
    await keys.keyboard("{Enter}");
    await keys.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Profit and loss");
    await keys.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Balance sheet");

    await keys.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("signs out to the sign-in screen at the Dashboard's address", async () => {
    startSignedIn();
    mockApi({ "GET /me": ALEX });
    openMenuAt("/deals/7");
    expect(screen.getByText("At /deals/7, signed-in")).toBeTruthy();
    const clicks = user();
    await clicks.click(await menuButton());

    await clicks.click(menu().getByRole("menuitem", { name: "Sign out" }));

    expect(await screen.findByText("At /, signed-out")).toBeTruthy();
  });
});
