import { describe, expect, it } from "vitest";

import cases from "../../../shared/accent-cases.json";
import { ACCENT_FORMAT_MESSAGE, ACCENT_LIGHT_MESSAGE, accentProblem, contrastWithWhite, keptAccent } from "./accent";

const MESSAGES: Record<string, string> = { format: ACCENT_FORMAT_MESSAGE, light: ACCENT_LIGHT_MESSAGE };

describe("the accent color", () => {
  it.each(cases.accepted)("accepts %j and keeps it as %s, as the backend does", (typed, kept) => {
    expect(accentProblem(typed)).toBeUndefined();
    expect(keptAccent(typed)).toBe(kept);
  });

  it.each(cases.refused)("refuses %j as %s, as the backend does", (typed, reason) => {
    expect(accentProblem(typed)).toBe(MESSAGES[reason]);
  });

  it("measures contrast by WCAG's formula", () => {
    expect(contrastWithWhite("#767676")).toBeCloseTo(4.54, 2);
    expect(contrastWithWhite("#777777")).toBeCloseTo(4.48, 2);
    expect(contrastWithWhite("#000000")).toBeCloseTo(21, 5);
  });
});
