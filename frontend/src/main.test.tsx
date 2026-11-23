// The app starts in the page's root element, on the dashboard.
import { act, screen } from "@testing-library/react";
import { mockApi } from "./shared/test-utils";

afterEach(() => vi.unstubAllGlobals());

test("the app starts on the dashboard in the page's root element", async () => {
  mockApi({ "GET /dashboard": () => ({ status: 500, body: {} }) });
  const root = document.createElement("div");
  root.id = "root";
  document.body.append(root);
  await act(() => import("./main"));
  expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  expect(root).toContainElement(screen.getByRole("navigation", { name: "Sections" }));
});
