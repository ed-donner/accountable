import { describe, expect, it } from "vitest";

import { niceTop } from "./axes";

describe("the top of a money axis", () => {
  it.each([
    [42_000, 50_000],
    [100_000, 100_000],
    [130_000, 200_000],
    [210_000, 250_000],
    [2_600, 5_000],
    [7_200_000, 10_000_000],
    [1, 1],
  ])("is the first round step at or above %i: %i", (highest, top) => {
    expect(niceTop(highest)).toBe(top);
  });
});
