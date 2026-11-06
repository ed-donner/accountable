import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { user } from "../test-utils";
import { ChangeCard } from "./ChangeCard";
import type { CardField, ChangeEntry } from "./queries";
import { EVENTS, changeEntry } from "./test-copilot";

function draw(entry: ChangeEntry) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const { container } = render(
    <MemoryRouter>
      <ChangeCard entry={entry} onConfirm={onConfirm} onCancel={onCancel} />
    </MemoryRouter>,
  );
  return { card: container.firstElementChild!, onConfirm, onCancel };
}

/** The card's fields, each as its line reads. */
function fieldLines(card: Element) {
  return [...card.querySelectorAll("dl > div")].map((line) => line.textContent);
}

const EDIT: CardField[] = [
  { name: "Value", now: "$40,000", after: "$48,000", kind: "money" },
  { name: "Close date", now: "Nov 30, 2026", after: "Dec 15, 2026", kind: "date" },
  { name: "Probability", now: "40%", after: "70%", kind: "percent" },
  { name: "Name", now: "Office move", after: "Office move, phase 2", kind: "text" },
];

function withFields(fields: CardField[]) {
  const entry = changeEntry();
  return changeEntry({ card: { ...entry.card, title: "Save Office move?", fields, note: null, button: "Save deal" } });
}

describe("a change card", () => {
  it("names the change and the record in its title", () => {
    draw(changeEntry());
    expect(screen.getByRole("heading", { name: "Move Harbor & Pine renewal to Won?" })).toBeTruthy();
  });

  it("gives each field's name, what it is now and what it will be", () => {
    const { card } = draw(changeEntry());
    expect(fieldLines(card)).toEqual(["Stage: from Negotiation to Won", "Probability: from 70% to 100%"]);
  });

  it("gives only what a field will be on a new record", () => {
    const { card } = draw(withFields([{ name: "Name", now: null, after: "Harbor & Pine", kind: "text" }]));
    expect(fieldLines(card)).toEqual(["Name: Harbor & Pine"]);
  });

  it("puts each field's name in muted ink and its values in ink", () => {
    const { card } = draw(changeEntry());
    expect(screen.getByText("Stage:").classList.contains("text-muted")).toBe(true);
    for (const value of ["Negotiation", "Won", "70%", "100%"]) {
      expect(screen.getByText(value).closest(".text-muted")).toBeNull();
    }
    expect(card.querySelectorAll("dd")).toHaveLength(2);
  });

  it("shows money, dates and percentages in JetBrains Mono, and text in the body font", () => {
    const { card } = draw(withFields(EDIT));
    expect(fieldLines(card)).toEqual([
      "Value: from $40,000 to $48,000",
      "Close date: from Nov 30, 2026 to Dec 15, 2026",
      "Probability: from 40% to 70%",
      "Name: from Office move to Office move, phase 2",
    ]);
    const inMono = (text: string) => screen.getByText(text).classList.contains("num");
    for (const value of ["$40,000", "$48,000", "Nov 30, 2026", "Dec 15, 2026", "40%", "70%"]) {
      expect(inMono(value)).toBe(true);
    }
    expect(inMono("Office move")).toBe(false);
    expect(inMono("Value:")).toBe(false);
  });

  it("adds what else changes by S1", () => {
    draw(changeEntry());
    expect(screen.getByText("The close date becomes today, and Sam Carter becomes a customer.")).toBeTruthy();
  });

  it("adds nothing when nothing else changes", () => {
    const { card } = draw(withFields(EDIT));
    expect(card.querySelectorAll(":scope > p")).toHaveLength(0);
  });
});

describe("a change card's buttons", () => {
  it("are the change's own button and Cancel while it waits", async () => {
    const { onConfirm, onCancel } = draw(changeEntry());
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Move deal", "Cancel"]);

    await user().click(screen.getByRole("button", { name: "Move deal" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    await user().click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("are both off while the change runs", async () => {
    const { onConfirm, onCancel } = draw(changeEntry({ state: "running" }));
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => (button as HTMLButtonElement).disabled)).toEqual([true, true]);
    for (const button of buttons) await user().click(button);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("give way to what happened once it's answered, with a link to the record", () => {
    const { card } = draw(
      changeEntry({ state: "answered", outcome: { words: EVENTS.outcome.words, link: "/deals/12" } }),
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    const link = screen.getByRole("link", { name: "Moved Harbor & Pine renewal to Won." });
    expect(link.getAttribute("href")).toBe("/deals/12");
    expect(fieldLines(card)).toEqual(["Stage: from Negotiation to Won", "Probability: from 70% to 100%"]);
  });

  it("give way to Cancelled, with no link, once it's cancelled", () => {
    draw(changeEntry({ state: "answered", outcome: { words: "Cancelled. Nothing was changed.", link: null } }));
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("Cancelled. Nothing was changed.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
