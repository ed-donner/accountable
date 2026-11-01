import { describe, expect, it } from "vitest";

import { capitalize, plural } from "./words";

describe("plural", () => {
  it.each([
    [0, "deal", "0 deals"],
    [1, "deal", "1 deal"],
    [2, "deal", "2 deals"],
    [1, "activity", "1 activity"],
    [2, "activity", "2 activities"],
    [0, "activity", "0 activities"],
    [1, "stage-change entry", "1 stage-change entry"],
    [3, "stage-change entry", "3 stage-change entries"],
    [1, "open deal", "1 open deal"],
    [1, "follow-up", "1 follow-up"],
    [6, "follow-up", "6 follow-ups"],
  ])("%i %s", (count, noun, expected) => {
    expect(plural(count, noun)).toBe(expected);
  });
});

describe("capitalize", () => {
  it("raises the first letter only", () => {
    expect(capitalize("qualified")).toBe("Qualified");
  });

  it("copes with nothing", () => {
    expect(capitalize("")).toBe("");
  });
});
