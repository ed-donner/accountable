import { act, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// The app's modules load with this file, so the test's own time is starting the app.
import "./App";
import { META, mockApi, user } from "./test-utils";

describe("starting the app", () => {
  it("puts it in the page's root element, on the sign-in screen and then the Dashboard", async () => {
    mockApi({
      "GET /meta": META,
      "GET /me": { id: "alex", name: "Alex Rivera", email: "alex@accountable.example", initials: "AR" },
      "GET /local/teammates": [{ id: "alex", name: "Alex Rivera", email: "alex@accountable.example", initials: "AR" }],
      "POST /local/sign-in": { token: "alex-token" },
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
  });
});
