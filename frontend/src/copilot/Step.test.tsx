import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import type { StepEntry } from "./queries";
import { Step } from "./Step";
import { stepEntry } from "./test-copilot";

function draw(step: StepEntry) {
  return render(
    <MemoryRouter>
      <Step step={step} />
    </MemoryRouter>,
  ).container;
}

/** The icon's classes that make it move. */
function animations(icon: Element) {
  return (icon.getAttribute("class") ?? "").split(/\s+/).filter((name) => name.includes("animate-"));
}

describe("a step", () => {
  it("shows a turning loader and the backend's words while it runs", () => {
    const line = draw(stepEntry());
    expect(line.textContent).toBe('Searching for "harbor"');
    expect(animations(screen.getByRole("img", { name: "Running" }))).not.toEqual([]);
  });

  it("keeps the loader still under reduced motion", () => {
    draw(stepEntry());
    // jsdom has no media queries, so this reads the class: it turns only when motion is allowed.
    expect(animations(screen.getByRole("img", { name: "Running" }))).toEqual(["motion-safe:animate-spin"]);
  });

  it("shows a check once it's done, with its own words", () => {
    const line = draw(stepEntry({ state: "done", words: 'Searched for "harbor"' }));
    expect(line.textContent).toBe('Searched for "harbor"');
    expect(screen.getByRole("img", { name: "Done" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Running" })).toBeNull();
  });

  it("shows an alert icon in Raspberry text when it fails, with the reason after it", () => {
    const reason = "Couldn't read this. This deal no longer exists.";
    const line = draw(stepEntry({ state: "failed", words: reason }));
    const icon = screen.getByRole("img", { name: "Failed" });
    expect(icon.classList.contains("text-raspberry-text")).toBe(true);
    expect(line.textContent).toBe(reason);
    expect(icon.compareDocumentPosition(screen.getByText(reason)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("is a line in muted ink", () => {
    const line = draw(stepEntry());
    expect(line.firstElementChild!.classList.contains("text-muted")).toBe(true);
  });

  it("links its words to the record it read or changed", () => {
    draw(stepEntry({ state: "done", words: "Read Harbor & Pine renewal", link: "/deals/12" }));
    expect(screen.getByRole("link", { name: "Read Harbor & Pine renewal" }).getAttribute("href")).toBe("/deals/12");
  });

  it("has no link when there's no record", () => {
    draw(stepEntry({ state: "done", words: "Read the dashboard", link: null }));
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Read the dashboard")).toBeTruthy();
  });

  it.each(["https://example.com/deals/12", "//example.com/deals/12", "/\\example.com", "javascript:alert(1)"])(
    "never links outside the app, as to %s",
    (link) => {
      draw(stepEntry({ state: "done", words: "Read Harbor & Pine renewal", link }));
      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.getByText("Read Harbor & Pine renewal")).toBeTruthy();
    },
  );
});
