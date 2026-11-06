import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { user } from "../test-utils";
import { CopilotPanel, PANEL_ID } from "./CopilotPanel";
import type { Conversation } from "./queries";
import {
  NO_KEY_LOCAL,
  NO_KEY_SHARED,
  QUESTION,
  answerEntry,
  changeEntry,
  conversation,
  messageEntry,
  problemEntry,
  sampleEntries,
  stepEntry,
} from "./test-copilot";

const ASK = "Ask a question or for a change";
const CAN_DO =
  "The Copilot can look up anything in Accountable, and add or change organizations, contacts, deals and activities. It asks before changing anything.";
const WHERE_IT_GOES =
  "Questions, and the records the Copilot reads to answer them, go to openrouter/free through OpenRouter. It can get things wrong, so check anything important on its page.";
const EXAMPLES = ["Which deals close this month?", "What do customers owe us?", "Move a deal to Negotiation"];

function inPanel(given: Conversation, onClose: () => void) {
  return (
    <MemoryRouter>
      <button type="button">On the page</button>
      <CopilotPanel conversation={given} onClose={onClose} />
    </MemoryRouter>
  );
}

/** Opens the panel on a Conversation with these changes, its actions mocks. */
function openPanel(changes: Partial<Conversation> = {}) {
  const given = conversation(changes);
  const onClose = vi.fn();
  const view = render(inPanel(given, onClose));
  const redraw = (more: Partial<Conversation>) => view.rerender(inPanel({ ...given, ...more }, onClose));
  return { conversation: given, onClose, redraw };
}

function messageBox() {
  return screen.getByRole("textbox", { name: ASK }) as HTMLTextAreaElement;
}

function sendButton() {
  return screen.getByRole("button", { name: "Send" }) as HTMLButtonElement;
}

function log() {
  return screen.getByRole("log");
}

describe("the panel", () => {
  it("is a region headed Copilot, with New conversation and Close named and as tooltips", () => {
    openPanel();
    const panel = screen.getByRole("region", { name: "Copilot" });
    expect(panel.id).toBe(PANEL_ID);
    expect(within(panel).getByRole("heading", { level: 2 }).textContent).toBe("Copilot");
    for (const name of ["New conversation", "Close"]) {
      expect(within(panel).getByRole("button", { name }).getAttribute("title")).toBe(name);
    }
  });

  it("puts focus in the message box as it opens", () => {
    openPanel();
    expect(document.activeElement).toBe(messageBox());
  });

  it("closes with Close", async () => {
    const { onClose } = openPanel();
    await user().click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes with Escape from the box, or from anything else inside it", async () => {
    const { onClose } = openPanel({ entries: [changeEntry()] });
    await user().type(messageBox(), "Half a question");
    await user().keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    screen.getByRole("button", { name: "Move deal" }).focus();
    await user().keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("leaves Escape on the page beside it alone", async () => {
    const { onClose } = openPanel();
    screen.getByRole("button", { name: "On the page" }).focus();
    await user().keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("clears the conversation with New conversation, leaving focus in the box", async () => {
    const { conversation: given } = openPanel({ entries: sampleEntries() });
    await user().click(screen.getByRole("button", { name: "New conversation" }));
    expect(given.clear).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(messageBox());
  });
});

describe("before the first message", () => {
  it("says what the Copilot can do and where questions go, naming the backend's model", () => {
    openPanel();
    expect(screen.getByText(CAN_DO)).toBeTruthy();
    expect(screen.getByText(/^Questions, and the records/).textContent).toBe(WHERE_IT_GOES);
  });

  it("names whichever model the backend uses", () => {
    openPanel({ status: { model: "anthropic/claude-sonnet-4.5", problem: null } });
    expect(screen.getByText(/^Questions, and the records/).textContent).toContain(
      "go to anthropic/claude-sonnet-4.5 through OpenRouter.",
    );
  });

  it("leaves the model out until the backend has said which it is", () => {
    openPanel({ status: undefined });
    expect(screen.getByText(CAN_DO)).toBeTruthy();
    expect(screen.queryByText(/through OpenRouter/)).toBeNull();
  });

  it("offers three examples, each filling the box without sending it", async () => {
    const { conversation: given } = openPanel();
    const examples = within(log()).getAllByRole("button");
    expect(examples.map((example) => example.textContent)).toEqual(EXAMPLES);

    await user().click(screen.getByRole("button", { name: "What do customers owe us?" }));
    expect(messageBox().value).toBe("What do customers owe us?");
    expect(document.activeElement).toBe(messageBox());
    expect(given.send).not.toHaveBeenCalled();
  });

  it("gives way to the conversation once it has begun", () => {
    openPanel({ entries: [messageEntry()] });
    expect(screen.queryByText(CAN_DO)).toBeNull();
    expect(screen.queryByRole("button", { name: EXAMPLES[0] })).toBeNull();
  });
});

describe("the message box", () => {
  it("is in the page color, with its placeholder", () => {
    openPanel();
    expect(messageBox().placeholder).toBe(ASK);
    expect(messageBox().classList.contains("input")).toBe(true);
  });

  it("sends with Enter, and empties itself", async () => {
    const { conversation: given } = openPanel();
    await user().type(messageBox(), `${QUESTION}{Enter}`);
    expect(given.send).toHaveBeenCalledExactlyOnceWith(QUESTION);
    expect(messageBox().value).toBe("");
  });

  it("starts a new line with Shift+Enter", async () => {
    const { conversation: given } = openPanel();
    await user().type(messageBox(), "Which deals close this month?{Shift>}{Enter}{/Shift}Only the open ones");
    expect(messageBox().value).toBe("Which deals close this month?\nOnly the open ones");
    expect(given.send).not.toHaveBeenCalled();
  });

  it("sends with Send, without the spaces and lines around it, and keeps focus in the box", async () => {
    const { conversation: given } = openPanel();
    await user().type(messageBox(), `  ${QUESTION}{Shift>}{Enter}{/Shift}`);
    await user().click(sendButton());
    expect(given.send).toHaveBeenCalledExactlyOnceWith(QUESTION);
    expect(document.activeElement).toBe(messageBox());
  });

  it("keeps Send off while the box is empty or holds only spaces", async () => {
    const { conversation: given } = openPanel();
    expect(sendButton().disabled).toBe(true);
    await user().type(messageBox(), "   {Enter}");
    expect(sendButton().disabled).toBe(true);
    expect(given.send).not.toHaveBeenCalled();
    await user().type(messageBox(), "?");
    expect(sendButton().disabled).toBe(false);
  });

  it("takes up to 2,000 characters", async () => {
    openPanel();
    messageBox().focus();
    await user().paste("a".repeat(2001));
    expect(messageBox().value).toBe("a".repeat(2000));
  });

  it("turns Send into Stop while the Copilot works, which stops it", async () => {
    const { conversation: given } = openPanel({ entries: [messageEntry(), stepEntry()], working: true });
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    await user().click(screen.getByRole("button", { name: "Stop" }));
    expect(given.stop).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(messageBox());
  });

  it("sends nothing with Enter while the Copilot works", async () => {
    const { conversation: given } = openPanel({ entries: [messageEntry()], working: true });
    await user().type(messageBox(), "And the next one{Enter}");
    expect(given.send).not.toHaveBeenCalled();
    expect(messageBox().value).toBe("And the next one");
  });

  it("doesn't stop for the second click of a double click on Send, which lands on Stop", () => {
    const { conversation: given } = openPanel({ entries: [messageEntry()], working: true });
    fireEvent.click(screen.getByRole("button", { name: "Stop" }), { detail: 2 });
    expect(given.stop).not.toHaveBeenCalled();
  });
});

describe("the conversation", () => {
  it("shows the person's message, the steps, the card and the answer, in order", () => {
    openPanel({ entries: sampleEntries() });
    const shown = [...log().children].map((entry) => entry.textContent);
    expect(shown).toEqual([
      "Move Harbor & Pine renewal to Won",
      'Searched for "harbor"',
      expect.stringMatching(/^Move Harbor & Pine renewal to Won\?Stage: from Negotiation to Won/),
      "Done. Harbor & Pine renewal is now Won, and Sam Carter is a customer.",
    ]);
    expect(within(log()).getByText("Harbor & Pine renewal").tagName).toBe("STRONG");
  });

  it("puts the person's message at the right, in the page color", () => {
    openPanel({ entries: [messageEntry()] });
    const message = within(log()).getByText(QUESTION);
    expect([...message.classList]).toEqual(expect.arrayContaining(["ml-auto", "bg-page", "max-w-[85%]"]));
  });

  it("is a log, so screen readers hear each step and the answer as they arrive", () => {
    const { redraw } = openPanel({ entries: [messageEntry()], working: true });
    redraw({ entries: [messageEntry(), stepEntry()] });
    expect(within(log()).getByText('Searching for "harbor"')).toBeTruthy();
    redraw({ entries: [messageEntry(), stepEntry({ state: "done" }), answerEntry()], working: false });
    expect(within(log()).getByText(/is now Won/)).toBeTruthy();
  });

  it("answers a waiting card through the conversation, leaving focus in the box", async () => {
    const { conversation: given } = openPanel({ entries: [messageEntry(), changeEntry()] });
    await user().click(screen.getByRole("button", { name: "Move deal" }));
    expect(given.confirm).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(messageBox());

    await user().click(screen.getByRole("button", { name: "Cancel" }));
    expect(given.cancel).toHaveBeenCalledTimes(1);
    expect(given.confirm).toHaveBeenCalledTimes(1);
  });

  it("keeps the newest in view as entries arrive, unless the person has scrolled up", () => {
    const { redraw } = openPanel({ entries: [messageEntry()], working: true });
    const scroller = log();
    let height = 1000;
    Object.defineProperty(scroller, "scrollHeight", { get: () => height });
    Object.defineProperty(scroller, "clientHeight", { get: () => 400 });

    redraw({ entries: [messageEntry(), stepEntry()] });
    expect(scroller.scrollTop).toBe(1000);

    scroller.scrollTop = 300;
    fireEvent.scroll(scroller);
    height = 1200;
    redraw({ entries: [messageEntry(), stepEntry(), answerEntry()], working: false });
    expect(scroller.scrollTop).toBe(300);

    scroller.scrollTop = 790;
    fireEvent.scroll(scroller);
    height = 1400;
    redraw({ entries: [messageEntry(), stepEntry(), answerEntry(), messageEntry()] });
    expect(scroller.scrollTop).toBe(1400);
  });

  it("brings the newest back into view when the person sends a message", async () => {
    const { redraw } = openPanel({ entries: [messageEntry(), answerEntry()] });
    const scroller = log();
    Object.defineProperty(scroller, "scrollHeight", { get: () => 1000 });
    Object.defineProperty(scroller, "clientHeight", { get: () => 400 });
    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);

    await user().type(messageBox(), "And next month?{Enter}");
    redraw({ entries: [messageEntry(), answerEntry(), messageEntry("And next month?")], working: true });
    expect(scroller.scrollTop).toBe(1000);
  });
});

describe("a problem", () => {
  it("shows the backend's words after an alert icon, with Try again sending the message again", async () => {
    const { conversation: given } = openPanel({ entries: [messageEntry(), problemEntry()] });
    expect(
      within(log()).getByText(
        "The Copilot has reached OpenRouter's limit for this minute. Wait a minute and try again.",
      ),
    ).toBeTruthy();
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(given.retry).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(messageBox());
  });

  it("offers no Try again where it can't help", () => {
    openPanel({ entries: [messageEntry(), problemEntry({ canRetry: false })] });
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("offers Try again on the last problem only, and not while the Copilot works", () => {
    const { redraw } = openPanel({
      entries: [messageEntry(), problemEntry(), messageEntry("Something else"), answerEntry()],
    });
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    redraw({ entries: [messageEntry(), problemEntry()], working: true });
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

describe("with no key", () => {
  it.each([
    ["the local copy", NO_KEY_LOCAL],
    ["the shared app", NO_KEY_SHARED],
  ])("says so as the panel opens, in %s's words, without Try again, and keeps Send off", async (_, status) => {
    const { conversation: given } = openPanel({ status });
    expect(screen.getByRole("alert").textContent).toBe(status.problem!.words);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();

    await user().type(messageBox(), `${QUESTION}{Enter}`);
    expect(sendButton().disabled).toBe(true);
    expect(given.send).not.toHaveBeenCalled();
  });
});
