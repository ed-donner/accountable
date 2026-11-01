import { describe, expect, it } from "vitest";

import { money, shortMoney } from "./money";

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
