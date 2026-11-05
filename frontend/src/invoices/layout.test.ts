import { describe, expect, it } from "vitest";

import cases from "../../../shared/invoice-layout-cases.json";
import { fieldMessage, lineNameMessage, named, unprintable } from "./characters";
import { day, layOut, money, quantity, taxText, wrap, type InvoiceValues, type Page } from "./layout";

function texts(pages: Page[]) {
  return pages.map((page) => page.flatMap((item) => (item.kind === "text" ? [item.text] : [])));
}

describe("the layout", () => {
  it.each(cases.cases.map((item) => [item.name, item] as const))(
    "gives the same lines on the same pages as the backend: %s",
    (_name, item) => {
      expect(texts(layOut(item.invoice as InvoiceValues))).toEqual(item.pages);
    },
  );

  it.each([
    ["one two three", 42, ["one two", "three"]],
    ["one two three", 41.9, ["one", "two", "three"]],
    ["one   two", 1000, ["one   two"]],
    ["   indented", 1000, ["   indented"]],
    ["trailing   ", 1000, ["trailing"]],
    ["a\n\nb", 1000, ["a", "", "b"]],
    ["abcdefghij", 24, ["abcd", "efgh", "ij"]],
    ["ab abcdefghij", 24, ["ab", "abcd", "efgh", "ij"]],
    ["W", 1, ["W"]],
    ["", 100, [""]],
  ])("breaks %j in %ipt as layout.py does", (text, width, lines) => {
    // JetBrains Mono at 10pt is 6pt a character, so 42pt holds seven and 41.9 six.
    expect(wrap(text, "mono", 10, width)).toEqual(lines);
  });

  it("writes figures and dates as layout.py does", () => {
    expect([0, 5, 4950, 125000, 10 ** 14].map(money)).toEqual([
      "$0.00",
      "$0.05",
      "$49.50",
      "$1,250.00",
      "$1,000,000,000,000.00",
    ]);
    expect([quantity(1_000_000), day("2026-01-05"), taxText(null, "8.875")]).toEqual([
      "1,000,000",
      "Jan 5, 2026",
      "Tax (8.875%)",
    ]);
  });

  it("measures a character no font has as a question mark, so a draft being typed still lays out", () => {
    const [invoice] = cases.cases.map((item) => item.invoice as InvoiceValues);
    expect(texts(layOut({ ...invoice, bill_to: "Acme 漢" }))[0]).toContain("Acme 漢");
  });
});

describe("the characters invoices can show", () => {
  it.each([..."AZaz09éÉñÑüßçøåŁłğşČž$€©®™£–—“”‘’…&<>% "])("include %j, as characters.py says", (character) => {
    expect(unprintable(character)).toEqual([]);
  });

  it.each(["\u{1F600}", "漢", "ي", "\t", "\r", "​", " ", "\u0007"])(
    "leave out %j, as characters.py does",
    (character) => {
      expect(unprintable(character)).toEqual([character]);
    },
  );

  it("keep a line break", () => {
    expect(unprintable("Harbor & Pine\nAttn: Sam")).toEqual([]);
  });

  it("name each one once, in the order they come, as characters.py does", () => {
    const found = unprintable("漢 Acme \u{1F600} 漢\t ي\t");
    expect(found).toEqual(["漢", "\u{1F600}", "\t", "ي"]);
    expect(fieldMessage(found)).toBe('Invoices can\'t show "漢", "\u{1F600}", a tab and "ي". Take them out to save');
    expect(fieldMessage(["漢"])).toBe('Invoices can\'t show "漢". Take it out to save');
    expect(lineNameMessage(["漢"])).toBe(
      'Invoices can\'t show "漢". Remove this line, rename the product and add it again',
    );
    expect(named(["​", "‌"])).toBe("an invisible character");
    expect(named([" "])).toBe("an unusual space");
  });
});
