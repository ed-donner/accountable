import { describe, expect, it } from "vitest";

import { MONEY_LABEL, REVENUE_MARGIN, funnelWidths, moneyLabelOnFill, revenueEdges, revenueY } from "./geometry";

// The mockup's funnel figures, and the funnel's width at each window size.
const VALUES = [1920500, 1573500, 1100500, 754500, 494500];
const AT_1440 = 572;
const AT_1280 = 472;

describe("funnelWidths", () => {
  it.each([AT_1440, AT_1280])("keeps every stage in proportion to its value at a width of %i", (width) => {
    const widths = funnelWidths(VALUES, width);
    const room = width - 196 - 6;
    VALUES.forEach((value, index) => {
      expect(widths[index]).toBeCloseTo((value / VALUES[0]) * room, 5);
    });
  });

  it("gives the funnel a spout narrower than its last stage", () => {
    const widths = funnelWidths(VALUES, AT_1280);
    expect(widths).toHaveLength(VALUES.length + 1);
    expect(widths[5]).toBeCloseTo(widths[4] * 0.68, 5);
  });

  it("keeps a small stage wide enough for its name", () => {
    const widths = funnelWidths([1000000, 1000, 1000, 1000, 0], AT_1280);
    expect(widths.slice(1, 4)).toEqual([100, 100, 100]);
    expect(widths[4]).toBe(60);
  });

  it("never gets wider on the way down", () => {
    for (const values of [VALUES, [5000, 5000, 5000, 5000, 5000], [1000000, 900, 800, 700, 0], [0, 0, 0, 0, 0]]) {
      const widths = funnelWidths(values, AT_1280);
      widths.slice(1).forEach((width, index) => {
        expect(width).toBeLessThanOrEqual(widths[index]);
      });
    }
  });
});

describe("revenueEdges", () => {
  const { top, right, bottom, left } = REVENUE_MARGIN;

  it.each([
    [992, 335],
    [832, 261],
  ])("puts the months and the zero line at the same margins at %i by %i", (width, height) => {
    const edges = revenueEdges(width, height, 12, 100000);
    const xAt = (month: number) => ((month - edges.left) / (edges.right - edges.left)) * width;
    const yAt = (value: number) => top + ((100000 - value) / (100000 - edges.bottom)) * (height - top);

    expect(xAt(0)).toBeCloseTo(left, 5);
    expect(xAt(11)).toBeCloseTo(width - right, 5);
    expect(yAt(0)).toBeCloseTo(height - bottom, 5);
  });
});

describe("revenueY", () => {
  it("puts the top of the scale at the top margin and its bottom at the chart's foot", () => {
    expect(revenueY(100000, 335, 100000, -12000)).toBeCloseTo(REVENUE_MARGIN.top, 5);
    expect(revenueY(-12000, 335, 100000, -12000)).toBeCloseTo(335, 5);
  });

  it("agrees with the zero line revenueEdges gives", () => {
    const edges = revenueEdges(992, 335, 12, 100000);
    expect(revenueY(0, 335, 100000, edges.bottom)).toBeCloseTo(335 - REVENUE_MARGIN.bottom, 5);
  });
});

describe("moneyLabelOnFill", () => {
  const { rise, height } = MONEY_LABEL;
  /** The grid line whose label's middle sits this many pixels below the fill's top. */
  const lineBelowTop = (fillTop: number, pixels: number) => fillTop + pixels + rise + height / 2;

  it("puts a label well under the fill's top on the fill", () => {
    expect(moneyLabelOnFill(lineBelowTop(100, 40), 100)).toBe(true);
  });

  it("leaves a label well above the fill's top off it", () => {
    expect(moneyLabelOnFill(lineBelowTop(100, -40), 100)).toBe(false);
  });

  it("decides right at the edge by the label's middle", () => {
    expect(moneyLabelOnFill(lineBelowTop(100, 0), 100)).toBe(true);
    expect(moneyLabelOnFill(lineBelowTop(100, 0.5), 100)).toBe(true);
    expect(moneyLabelOnFill(lineBelowTop(100, -0.5), 100)).toBe(false);
  });

  it("goes by the middle of a label the fill's top runs across", () => {
    // The grid line is under the fill's top, but most of the label is above it.
    expect(moneyLabelOnFill(100 + rise, 100)).toBe(false);
    // The fill's top runs through the label's upper half.
    expect(moneyLabelOnFill(100 + rise + height - 1, 100)).toBe(true);
  });
});
