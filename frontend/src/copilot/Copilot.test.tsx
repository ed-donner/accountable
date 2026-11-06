import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { queryDefaults } from "../lib/queryDefaults";
import { user } from "../test-utils";
import { Copilot } from "./Copilot";
import { PANEL_ID } from "./CopilotPanel";
import { QUESTION, answered, mockCopilot, type ChatAnswer } from "./test-copilot";

const ASK = "Ask a question or for a change";
const ANSWER = "Three deals close this month.";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Whether the panel is open, kept outside the Copilot as the shell keeps it. */
function WithItsPanelState() {
  const [open, setOpen] = useState(false);
  return <Copilot open={open} onOpenChange={setOpen} />;
}

/** The Copilot beside a page with a button of its own, as the top bar puts it beside every page. */
function openCopilotBeside(chats: ChatAnswer[] = []) {
  const { requests } = mockCopilot({ chats });
  const onPage = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: queryDefaults })}>
      <MemoryRouter>
        <WithItsPanelState />
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

describe("the panel's slide", () => {
  /** The panel element itself, which a closed panel still is while it slides out, though inert. */
  function panelElement() {
    return document.getElementById(PANEL_ID);
  }

  /** The browser's view of the panel's animation, which jsdom has none of, as under reduced motion. */
  function slidingAs(animationName: string) {
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) =>
      element.id === PANEL_ID
        ? ({ ...real(element, pseudo), animationName } as CSSStyleDeclaration)
        : real(element, pseudo),
    );
  }

  /** An animation's end, as the browser sends it. jsdom has no AnimationEvent, so the name is set by hand. */
  function animationEnds(element: Element, animationName: string) {
    const ended = new Event("animationend", { bubbles: true });
    Object.defineProperty(ended, "animationName", { value: animationName });
    fireEvent(element, ended);
  }

  it("slides in as it opens, and with no slide to wait for, as under reduced motion, goes at once as it closes", async () => {
    openCopilotBeside();
    await openPanel();
    expect(panelElement()!.className).toContain("animate-slide-in");
    expect(panelElement()!.hasAttribute("inert")).toBe(false);

    await user().click(copilotButton());
    expect(panelElement()).toBeNull();
  });

  it("stays in the page while it slides out, inert, and goes once the slide has ended", async () => {
    openCopilotBeside();
    await openPanel();
    slidingAs("slide-out");
    await user().click(copilotButton());

    const leaving = panelElement()!;
    expect(leaving.className).toContain("animate-slide-out");
    expect(leaving.hasAttribute("inert")).toBe(true);
    expect(copilotButton().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(copilotButton());

    // Only the panel's own slide counts, not one inside it that bubbles up, nor its slide in.
    animationEnds(within(leaving).getByRole("log", { hidden: true }), "slide-out");
    animationEnds(leaving, "slide-in");
    expect(panelElement()).toBe(leaving);
    animationEnds(leaving, "slide-out");
    expect(panelElement()).toBeNull();
  });

  it("opened again while it slides out, starts afresh, with nothing typed and focus in the box", async () => {
    openCopilotBeside();
    await openPanel();
    await user().type(messageBox(), "Half a question");
    slidingAs("slide-out");
    await user().click(copilotButton());
    expect(panelElement()!.hasAttribute("inert")).toBe(true);

    await user().click(copilotButton());
    expect(document.querySelectorAll(`#${PANEL_ID}`)).toHaveLength(1);
    expect(panelElement()!.hasAttribute("inert")).toBe(false);
    expect(panelElement()!.className).toContain("animate-slide-in");
    expect((messageBox() as HTMLTextAreaElement).value).toBe("");
    expect(document.activeElement).toBe(messageBox());
  });
});
