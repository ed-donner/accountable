import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App, queryClient } from "./App";
import { META, mockApi, user } from "./test-utils";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 31, 12, 0) });
  // Every other read fails, which each page handles in its own way.
  mockApi({ "GET /meta": META });
});

afterEach(() => {
  vi.useRealTimers();
  queryClient.clear();
});

/** Goes to an address the way the browser's back and forward buttons do. */
function visit(path: string) {
  act(() => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

function heading() {
  return screen.findByRole("heading", { level: 1 });
}

function topBar() {
  return within(screen.getByRole("navigation", { name: "Sections" }));
}

describe("the app", () => {
  it("opens on the Dashboard, with the top bar", async () => {
    visit("/");
    render(<App />);
    expect((await heading()).textContent).toBe("Dashboard");
    expect(topBar().getAllByRole("link")).toHaveLength(5);
  });

  it.each([
    ["/organizations", "Organizations"],
    ["/contacts", "Contacts"],
    ["/deals", "Deals"],
    ["/pipeline", "Pipeline"],
  ])("gives %s its own address", async (path, title) => {
    render(<App />);
    visit(path);
    expect((await heading()).textContent).toBe(title);
    expect(window.location.pathname).toBe(path);
  });

  it.each([
    ["/organizations/abc", "This organization no longer exists", "Back to Organizations"],
    ["/contacts/abc", "This contact no longer exists", "Back to Contacts"],
    ["/deals/abc", "This deal no longer exists", "Back to Deals"],
  ])("says %s couldn't be a record, with a link back to its section", async (path, title, back) => {
    render(<App />);
    visit(path);
    expect((await heading()).textContent).toBe(title);
    expect(screen.getByRole("link", { name: back })).toBeTruthy();
  });

  it("says an unknown address no longer exists, links to the Dashboard and keeps the top bar", async () => {
    render(<App />);
    visit("/no/such/page");
    expect((await heading()).textContent).toBe("This page no longer exists");
    expect(topBar().getAllByRole("link")).toHaveLength(5);

    await user().click(screen.getByRole("link", { name: "Back to Dashboard" }));

    expect((await heading()).textContent).toBe("Dashboard");
    expect(window.location.pathname).toBe("/");
  });

  it("goes to a section from the top bar", async () => {
    visit("/");
    render(<App />);
    await heading();

    await user().click(topBar().getByRole("link", { name: "Contacts" }));

    expect((await heading()).textContent).toBe("Contacts");
    expect(window.location.pathname).toBe("/contacts");
  });
});
