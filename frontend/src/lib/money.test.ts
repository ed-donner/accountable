import { describe, expect, it } from "vitest";

import { MAX_CENTS, money, parsePrice, parseSignedPrice, price, priceText, shortMoney } from "./money";

describe("money", () => {
  it("shows whole dollars with the currency and separators", () => {
    expect(money(48000)).toBe("$48,000");
    expect(money(1240000)).toBe("$1,240,000");
  });

  it("shows zero with its currency", () => {
    expect(money(0)).toBe("$0");
  });

  it("handles large values", () => {
    expect(money(12500000)).toBe("$12,500,000");
  });
});

describe("shortMoney", () => {
  it("shortens thousands", () => {
    expect(shortMoney(40000)).toBe("$40k");
    expect(shortMoney(100000)).toBe("$100k");
    expect(shortMoney(12500)).toBe("$12.5k");
  });

  it("shortens millions", () => {
    expect(shortMoney(1200000)).toBe("$1.2M");
    expect(shortMoney(2000000)).toBe("$2M");
  });

  it("leaves small values and zero alone, with the currency", () => {
    expect(shortMoney(0)).toBe("$0");
    expect(shortMoney(950)).toBe("$950");
  });
});

describe("price", () => {
  it.each([
    [0, "$0.00"],
    [7, "$0.07"],
    [4950, "$49.50"],
    [125000, "$1,250.00"],
    [114999, "$1,149.99"],
    [MAX_CENTS, "$1,000,000,000,000.00"],
  ])("shows %i cents as %s", (cents, shown) => {
    expect(price(cents)).toBe(shown);
  });

  it("shows a sum past what a JavaScript number holds to the cent, from a BigInt", () => {
    expect(price(9_200_000_000_000_001n)).toBe("$92,000,000,000,000.01");
    expect(price(7n)).toBe("$0.07");
    expect(price(0n)).toBe("$0.00");
  });
});

describe("priceText", () => {
  it("shows two figures after the point and no commas, for editing", () => {
    expect(priceText(125000)).toBe("1250.00");
    expect(priceText(4950)).toBe("49.50");
    expect(priceText(7)).toBe("0.07");
    expect(priceText(MAX_CENTS)).toBe("1000000000000.00");
  });
});

describe("parsePrice", () => {
  it.each(["49.50", "49.5", "$49.50", " 49.50 ", "$49.5"])("reads %j as 4950 cents", (text) => {
    expect(parsePrice(text)).toBe(4950);
  });

  it.each([
    ["1,250", 125000],
    ["$1,250.00", 125000],
    ["1250", 125000],
    ["49", 4900],
    ["0.29", 29],
    ["1.10", 110],
    [".5", 50],
    ["0", 0],
    ["1,000,000,000,000.00", MAX_CENTS],
  ])("reads %j as %i cents, by its digits", (text, cents) => {
    expect(parsePrice(text)).toBe(cents);
  });

  it.each(["49.505", "-1", "12a", "1,25", "12,3456", "", "   ", "$", ".", "49.", "4 9", "$$49", "1000000000000.01"])(
    "refuses %j",
    (text) => {
      expect(parsePrice(text)).toBeNull();
    },
  );

  it("gives back the same cents from what priceText shows", () => {
    const samples = [...Array.from({ length: 10_001 }, (_, cents) => cents), 114999, 900_719_925, MAX_CENTS];
    for (const cents of samples) expect(parsePrice(priceText(cents))).toBe(cents);
  });
});

describe("amounts below zero", () => {
  it.each([
    [-425000, "-$4,250.00"],
    [-7, "-$0.07"],
    [-MAX_CENTS, "-$1,000,000,000,000.00"],
  ])("price shows %i cents as %s, with the sign before the currency", (cents, shown) => {
    expect(price(cents)).toBe(shown);
  });

  it("price shows a BigInt below zero to the cent, past what a JavaScript number holds", () => {
    expect(price(-9_200_000_000_000_001n)).toBe("-$92,000,000,000,000.01");
    expect(price(-425000n)).toBe("-$4,250.00");
    expect(price(-7n)).toBe("-$0.07");
  });

  it("shortMoney puts the sign before the currency", () => {
    expect(shortMoney(-40000)).toBe("-$40k");
    expect(shortMoney(-1200000)).toBe("-$1.2M");
    expect(shortMoney(-950)).toBe("-$950");
  });

  it("priceText shows the sign for editing", () => {
    expect(priceText(-125000)).toBe("-1250.00");
    expect(priceText(-29)).toBe("-0.29");
  });
});

describe("parseSignedPrice", () => {
  it.each([
    ["-1,250.00", -125000],
    ["-$1,250.00", -125000],
    ["-0.29", -29],
    [" -0.29 ", -29],
    ["1250", 125000],
    ["$1,250.00", 125000],
    ["0", 0],
    ["-0", 0],
    ["-1,000,000,000,000.00", -MAX_CENTS],
    ["1,000,000,000,000.00", MAX_CENTS],
  ])("reads %j as %i cents, by its digits", (text, cents) => {
    expect(parseSignedPrice(text)).toBe(cents);
  });

  it.each(["--1", "1-", "-", "- 5", "$-5", "-49.505", "-1000000000000.01", "1000000000000.01", "abc", ""])(
    "refuses %j",
    (text) => {
      expect(parseSignedPrice(text)).toBeNull();
    },
  );

  it("gives back the same cents from what priceText shows, below zero too", () => {
    for (const cents of [-MAX_CENTS, -114999, -29, -1, 0, 1, 29, 114999, MAX_CENTS]) {
      expect(parseSignedPrice(priceText(cents))).toBe(cents);
    }
  });
});
