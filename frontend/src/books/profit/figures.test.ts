import { describe, expect, it } from "vitest";

import { change, margin, sum } from "./figures";

describe("a sum", () => {
  it("has its cents and a minus sign before the currency", () => {
    expect(sum("4825000")).toBe("$48,250.00");
    expect(sum("0")).toBe("$0.00");
    expect(sum("-1250050")).toBe("-$12,500.50");
  });

  it("is exact past what a JavaScript number holds", () => {
    expect(sum("9007199254740993")).toBe("$90,071,992,547,409.93");
    expect(sum("-9200000000000001")).toBe("-$92,000,000,000,000.01");
  });
});

describe("the margin", () => {
  it("is tenths as a percentage with one decimal place", () => {
    expect(margin(234)).toBe("23.4%");
    expect(margin(1000)).toBe("100.0%");
    expect(margin(0)).toBe("0.0%");
    expect(margin(5)).toBe("0.5%");
  });

  it("has a minus sign for a loss, even below one percent", () => {
    expect(margin(-80)).toBe("-8.0%");
    expect(margin(-3)).toBe("-0.3%");
  });

  it("is a dash with no revenue", () => {
    expect(margin(null)).toBe("–");
  });
});

describe("a change", () => {
  it("is a percentage with a plus or minus sign, and 0% for none", () => {
    expect(change({ kind: "percent", value: 12 })).toBe("+12%");
    expect(change({ kind: "percent", value: -8 })).toBe("-8%");
    expect(change({ kind: "percent", value: 0 })).toBe("0%");
    expect(change({ kind: "percent", value: 1250 })).toBe("+1250%");
  });

  it("is New from nothing and a dash for nothing to nothing", () => {
    expect(change({ kind: "new", value: null })).toBe("New");
    expect(change({ kind: "none", value: null })).toBe("–");
  });

  it("is points to one decimal place for the margin", () => {
    expect(change({ kind: "points", value: 21 })).toBe("+2.1 pts");
    expect(change({ kind: "points", value: -4 })).toBe("-0.4 pts");
    expect(change({ kind: "points", value: 0 })).toBe("0.0 pts");
    expect(change({ kind: "points", value: -125 })).toBe("-12.5 pts");
  });
});
