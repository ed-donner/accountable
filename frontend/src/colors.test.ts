import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SOURCE = path.dirname(fileURLToPath(import.meta.url));
const STYLES = path.join(SOURCE, "styles.css");

function filesIn(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const file = path.join(folder, name);
    return statSync(file).isDirectory() ? filesIn(file) : [file];
  });
}

const APP_FILES = filesIn(SOURCE).filter(
  (file) => /\.(tsx?|css)$/.test(file) && !/\.test\.tsx?$/.test(file) && file !== STYLES,
);

const COLOR_VALUES = [
  { name: "a hex color", pattern: /#[0-9a-f]{3,8}\b/i },
  { name: "a color function", pattern: /(?<![a-z])(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i },
];

/** What's between the braces that follow the first match of start, nested braces included. */
function blockAfter(css: string, start: string) {
  const opening = css.indexOf("{", css.indexOf(start));
  let depth = 0;
  for (let at = opening; at < css.length; at += 1) {
    if (css[at] === "{") depth += 1;
    if (css[at] === "}") depth -= 1;
    if (depth === 0) return css.slice(opening + 1, at);
  }
  throw new Error(`${start} never closes`);
}

function variablesSetIn(block: string) {
  return [...block.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]);
}

describe("the dark block", () => {
  const css = readFileSync(STYLES, "utf8");
  const theme = new Set(variablesSetIn(blockAfter(css, "@theme {")));
  const dark = variablesSetIn(blockAfter(css, ':root[data-mode="dark"] {'));

  it("sets only tokens that @theme has, so a typo can't fail quietly", () => {
    expect(dark.length).toBeGreaterThan(10);
    expect(dark.filter((variable) => !theme.has(variable))).toEqual([]);
  });

  it("sets each token once", () => {
    expect(dark.filter((variable, index) => dark.indexOf(variable) !== index)).toEqual([]);
  });
});

describe("colors", () => {
  it("are named only in styles.css, so each one is a token with a dark value", () => {
    expect(APP_FILES.length).toBeGreaterThan(50);
    const found = APP_FILES.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          COLOR_VALUES.filter(({ pattern }) => pattern.test(line)).map(
            ({ name }) => `${path.relative(SOURCE, file)}:${index + 1} names ${name}: ${line.trim()}`,
          ),
        ),
    );
    expect(found).toEqual([]);
  });
});
