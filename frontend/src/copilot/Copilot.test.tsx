import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { queryDefaults } from "../lib/queryDefaults";
import { user } from "../test-utils";
import { Copilot } from "./Copilot";
import { QUESTION, answered, mockCopilot, type ChatAnswer } from "./test-copilot";

const ASK = "Ask a question or for a change";
const ANSWER = "Three deals close this month.";

/** The Copilot beside a page with a button of its own, as the top bar puts it beside every page. */
function openCopilotBeside(chats: ChatAnswer[] = []) {
  const { requests } = mockCopilot({ chats });
  const onPage = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: queryDefaults })}>
      <MemoryRouter>
        <Copilot />
        <main>
          <button type="button" onClick={onPage}>
            On the page
          </button>
        </main>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { requests, onPage };
}

function copilotButton() {
  return screen.getByRole("button", { name: "Copilot" });
}

function panel() {
  return screen.queryByRole("region", { name: "Copilot" });
}

function messageBox() {
  return screen.getByRole("textbox", { name: ASK });
}

async function openPanel() {
  await user().click(copilotButton());
  expect(panel()).not.toBeNull();
}

describe("the Copilot", () => {
  it("opens its panel from the button with focus in the box, and closes it from the button", async () => {
    openCopilotBeside();
    expect(panel()).toBeNull();
    expect(copilotButton().getAttribute("aria-expanded")).toBe("false");

    await openPanel();
    expect(copilotButton().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(messageBox());

    await user().click(copilotButton());
    expect(panel()).toBeNull();
    expect(copilotButton().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(copilotButton());
  });

  it("puts focus back on the button when Close or Escape closes the panel", async () => {
    openCopilotBeside();
    await openPanel();
    await user().click(within(panel()!).getByRole("button", { name: "Close" }));
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(copilotButton());

    await openPanel();
    await user().keyboard("{Escape}");
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(copilotButton());
  });

  it("keeps the conversation while the panel is closed and opened again", async () => {
    const { requests } = openCopilotBeside([answered(ANSWER)]);
    await openPanel();
    await user().type(messageBox(), `${QUESTION}{Enter}`);
    expect(await screen.findByText(ANSWER)).toBeTruthy();

    await user().click(copilotButton());
    expect(panel()).toBeNull();
    await openPanel();

    const log = within(screen.getByRole("log"));
    expect(log.getByText(QUESTION)).toBeTruthy();
    expect(log.getByText(ANSWER)).toBeTruthy();
    expect(requests).toHaveLength(1);
  });

  it("leaves the page beside it usable, and stays open while the page is used", async () => {
    const { onPage } = openCopilotBeside();
    await openPanel();
    // userEvent's own setup checks pointer-events, as a page blocked by a modal panel would fail.
    const page = screen.getByRole("button", { name: "On the page" });
    await userEvent.setup().click(page);

    expect(onPage).toHaveBeenCalledOnce();
    expect(page.closest("[aria-hidden='true'], [inert]")).toBeNull();
    expect(document.activeElement).toBe(page);
    expect(panel()).not.toBeNull();
  });
});
