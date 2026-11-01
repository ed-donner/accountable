import { describe, expect, it } from "vitest";

import cases from "../../../shared/website-cases.json";
import { isEmail, isWebsite, recordId } from "./validate";

describe("isEmail", () => {
  it.each(["sam@example.com", "sam.carter+crm@mail.example.co"])("accepts %s", (value) => {
    expect(isEmail(value)).toBe(true);
  });

  it.each(["sam", "sam@", "@example.com", "sam@example", "sam smith@example.com"])("refuses %s", (value) => {
    expect(isEmail(value)).toBe(false);
  });
});

describe("isWebsite", () => {
  // The backend's tests read the same file, so the two can't drift apart.
  it.each(cases.accepted)("accepts %j", (value) => {
    expect(isWebsite(value)).toBe(true);
  });

  it.each(cases.refused)("refuses %j", (value) => {
    expect(isWebsite(value)).toBe(false);
  });
});

describe("recordId", () => {
  it.each([["1", 1], ["42", 42], ["9007199254740991", 9007199254740991]])("reads %s", (text, id) => {
    expect(recordId(text)).toBe(id);
  });

  it.each([undefined, "", "abc", "0", "-1", "1.5", "1e3", "0x10", " 1", "1 ", "01", "99999999999999999999", "Infinity", "NaN"])(
    "refuses %j",
    (text) => {
      expect(recordId(text)).toBeNull();
    },
  );
});
