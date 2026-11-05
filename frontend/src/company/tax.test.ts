import { describe, expect, it } from "vitest";

import cases from "../../../shared/totals-cases.json";
import { MAX_QUANTITY, MAX_SUBTOTAL_CENTS, parseQuantity, rateThousandths, taxOn, totals } from "./tax";

describe("the sums on a quote or an invoice", () => {
  it.each(cases)("match the backend's: $why", ({ lines, rate, subtotal, tax, total }) => {
    const given = lines.map(([quantity, unit_price_cents]) => ({ quantity, unit_price_cents }));
    expect(totals(given, rate)).toEqual({ subtotal_cents: subtotal, tax_cents: tax, total_cents: total });
  });

  it("would be a cent out past $900 million with plain numbers, which is why the tax goes through BigInt", () => {
    const subtotal = 99_999_998_050_000;
    const rate = rateThousandths("99.999");
    const byPlainNumbers = Math.floor((subtotal * rate + 50_000) / 100_000);
    expect(taxOn(subtotal, rate)).toBe(byPlainNumbers + 1);
  });

  it("keeps the most any amount can be inside what a JavaScript number holds exactly", () => {
    const most = totals([{ quantity: 1, unit_price_cents: MAX_SUBTOTAL_CENTS }], "100");
    expect(Number.isSafeInteger(most.total_cents)).toBe(true);
  });
});

describe("a rate as the backend sends it", () => {
  it.each([
    ["8.875", 8875],
    ["8.5", 8500],
    ["0", 0],
    ["0.001", 1],
    ["100", 100_000],
  ])("reads %s as %i thousandths of a percent", (rate, thousandths) => {
    expect(rateThousandths(rate)).toBe(thousandths);
  });
});

describe("a typed quantity", () => {
  it.each([
    ["1", 1],
    [" 12 ", 12],
    ["1,000", 1000],
    ["1000000", MAX_QUANTITY],
  ])("reads %s as %i", (text, quantity) => {
    expect(parseQuantity(text)).toBe(quantity);
  });

  it.each(["", "0", "1.5", "-2", "1,00", "1000001", "two", "1e3"])(
    "refuses %j, which isn't a whole number from 1 to a million",
    (text) => {
      expect(parseQuantity(text)).toBeNull();
    },
  );
});
