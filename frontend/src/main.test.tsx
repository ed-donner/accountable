import { act, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { META, mockApi } from "./test-utils";

describe("starting the app", () => {
  it("puts it in the page's root element, opening on the Dashboard", async () => {
    mockApi({ "GET /meta": META });
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);

    await act(() => import("./main"));

    const page = within(root);
    expect((await page.findByRole("heading", { level: 1 })).textContent).toBe("Dashboard");
    expect(page.getByRole("navigation", { name: "Sections" })).toBeTruthy();
  });
});
