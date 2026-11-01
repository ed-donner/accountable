import { describe, expect, it } from "vitest";

import { isEmail, isWebsite } from "./validate";

describe("isEmail", () => {
  it.each(["sam@example.com", "sam.carter+crm@mail.example.co"])("accepts %s", (value) => {
    expect(isEmail(value)).toBe(true);
  });

  it.each(["sam", "sam@", "@example.com", "sam@example", "sam smith@example.com"])("refuses %s", (value) => {
    expect(isEmail(value)).toBe(false);
  });
});

describe("isWebsite", () => {
  it.each(["example.com", "www.example.com/about", "http://example.com", "HTTPS://example.com", "example.com:8080"])(
    "accepts %s",
    (value) => {
      expect(isWebsite(value)).toBe(true);
    },
  );

  it.each(["ftp://example.com", "mailto:sam@example.com", "javascript:alert(1)", "https://", "two words"])(
    "refuses %s",
    (value) => {
      expect(isWebsite(value)).toBe(false);
    },
  );
});
