import { describe, expect, it } from "vitest";
import cases from "./rules-cases.json";
import { expectedValue, inClosedWindow, isLate, safeHref, STAGES, USUAL_PROBABILITY, type Stage } from "./rules";

// The same cases as backend/tests/test_rules.py, so the browser and the server agree.

describe("the shared rule cases", () => {
  it.each(cases.expected_value)("expected value of $value at $probability%", ({ value, probability, expected }) => {
    expect(expectedValue(value, probability)).toBe(expected);
  });

  it.each(cases.late)("$stage closing $close_date late: $late", ({ stage, close_date, late }) => {
    expect(isLate(stage as Stage, close_date, cases.today)).toBe(late);
  });

  it.each(cases.closed_window)("closed on $close_date shown: $in", ({ close_date, in: shown }) => {
    expect(inClosedWindow(close_date, cases.today)).toBe(shown);
  });

  it("has the six usual probabilities in stage order", () => {
    expect(USUAL_PROBABILITY).toEqual(cases.usual_probability);
    expect(Object.keys(USUAL_PROBABILITY)).toEqual([...STAGES]);
  });
});

describe("safeHref", () => {
  it("adds https:// when there's no scheme", () => {
    expect(safeHref("bluefin.example")).toBe("https://bluefin.example/");
    expect(safeHref("  bluefin.example/about ")).toBe("https://bluefin.example/about");
    expect(safeHref("localhost:3000")).toBe("https://localhost:3000/");
  });

  it("keeps http and https addresses", () => {
    expect(safeHref("http://bluefin.example")).toBe("http://bluefin.example/");
    expect(safeHref("HTTPS://bluefin.example/x")).toBe("https://bluefin.example/x");
  });

  it("refuses other schemes and empty values", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("JavaScript:alert(1)")).toBeNull();
    expect(safeHref("ftp://bluefin.example")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
    expect(safeHref("//bluefin.example")).toBeNull();
    expect(safeHref("")).toBeNull();
    expect(safeHref(null)).toBeNull();
  });
});
