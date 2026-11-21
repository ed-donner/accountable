import { describe, expect, it } from "vitest";
import css from "./index.css?raw";

// The color tokens in index.css (spec 2.6): contrast, and no colors anywhere else.

type Tokens = Record<string, string>;

/** The custom properties declared in the rule with exactly this selector. */
function declarations(selector: string): Tokens {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, before, body] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // What follows the last statement, such as an @import, is the selector.
    const ruleSelector = before.split(";").pop()!.replace(/\s+/g, " ").trim();
    if (ruleSelector !== selector) continue;
    const pairs = [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]);
    return Object.fromEntries(pairs);
  }
  throw new Error(`index.css has no rule for ${selector}`);
}

const LIGHT = declarations(":root, .dark .on-band");
const DARK_ONLY = declarations(".dark");
const MODES: Record<string, Tokens> = { light: LIGHT, dark: { ...LIGHT, ...DARK_ONLY } };

// The colors 2.6 keeps the same in both modes: the brand colors themselves,
// the band, the control border, and the fixed shades behind white text.
const SAME_IN_BOTH_MODES = [
  "--sea-green",
  "--sea-green-hover",
  "--marigold",
  "--coral",
  "--cerulean",
  "--raspberry",
  "--slate",
  "--sea-mist",
  "--midnight",
  "--control-border",
  "--band",
  "--band-ink",
  "--band-ink-soft",
  "--band-muted",
  "--band-alert",
  "--band-panel",
  "--band-rest",
  "--band-button",
  "--band-button-hover",
  "--destructive",
  "--destructive-hover",
];

/** A token's value with every var() replaced, until only a color is left. */
function resolve(tokens: Tokens, name: string): string {
  const value = tokens[name];
  if (value === undefined) throw new Error(`No token ${name}`);
  return value.replace(/var\((--[\w-]+)\)/g, (_, inner: string) => resolve(tokens, inner));
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Not a six-digit hex color: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((at) => {
    const channel = parseInt(match[1].slice(at, at + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio between two colors. */
function contrast(one: string, two: string): number {
  const [light, dark] = [luminance(one), luminance(two)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const SURFACES = ["--page", "--panel", "--raised"];
const BRANDS = ["sea-green", "marigold", "coral", "cerulean", "raspberry", "slate"];

/** Each pair that must reach the ratio, as [text or outline, background, ratio]. */
function pairsFor(mode: string): [string, string, number][] {
  const pairs: [string, string, number][] = [];
  for (const surface of SURFACES) {
    for (const ink of ["--ink", "--ink-muted", "--ink-subtle"]) pairs.push([ink, surface, 4.5]);
    for (const brand of BRANDS) pairs.push([`--${brand}-text`, surface, 4.5]);
    pairs.push(["--focus", surface, 3]);
  }
  for (const ink of ["--ink", "--ink-muted"]) pairs.push([ink, "--accent", 4.5]);
  for (const brand of BRANDS) pairs.push([`--${brand}-text`, `--${brand}-tint`, 4.5]);
  pairs.push(["--selected-ink", "--selected", 4.5], ["--selected-muted", "--selected", 4.5]);
  for (const ink of ["--band-ink", "--band-ink-soft", "--band-muted", "--band-alert"]) pairs.push([ink, "--band", 4.5]);
  // In light mode, 2.6 gives the control border's figure on white (3.2:1),
  // where the controls sit. The page's #F0F4F5 gives 2.9:1, as before dark mode.
  const controlSurfaces = mode === "light" ? ["--panel", "--raised"] : SURFACES;
  for (const surface of controlSurfaces) pairs.push(["--control-border", surface, 3]);
  return pairs;
}

describe("dark values (spec 2.6)", () => {
  // shadcn/ui's variables point at another token, so they follow it.
  const colors = Object.keys(LIGHT).filter((name) => !/^var\(--[\w-]+\)$/.test(LIGHT[name]));

  it("gives every color a dark value, apart from those the same in both modes", () => {
    const withoutDark = colors.filter((name) => !(name in DARK_ONLY));
    expect(withoutDark.sort()).toEqual([...SAME_IN_BOTH_MODES].sort());
  });

  it("only sets tokens that light mode has too", () => {
    expect(Object.keys(DARK_ONLY).filter((name) => !(name in LIGHT))).toEqual([]);
  });
});

describe.each(Object.keys(MODES))("contrast in %s mode (spec 2.6)", (mode) => {
  const tokens = MODES[mode];

  it.each(pairsFor(mode))("%s on %s reaches %s:1", (front, back, ratio) => {
    expect(contrast(resolve(tokens, front), resolve(tokens, back))).toBeGreaterThanOrEqual(ratio);
  });

  it("white on --destructive reaches 4.5:1, for Late and Delete", () => {
    expect(contrast("#ffffff", resolve(tokens, "--destructive"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("colors live only in index.css (spec 2.6, Avoid)", () => {
  const sources = import.meta.glob<string>(
    ["/src/**/*.{ts,tsx,css}", "!/src/**/*.test.{ts,tsx}", "!/src/test/**", "!/src/styles/index.css"],
    { query: "?raw", import: "default", eager: true },
  );
  const COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i;

  it("finds the source files", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
  });

  it("has no hex, rgb() or hsl() color in any other file", () => {
    const found = Object.entries(sources).flatMap(([file, text]) =>
      text
        .split("\n")
        .map((line, index) => (COLOR.test(line) ? `${file}:${index + 1}: ${line.trim()}` : null))
        .filter((hit) => hit !== null),
    );
    expect(found).toEqual([]);
  });
});
