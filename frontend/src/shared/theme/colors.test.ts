// RV9 and the spec's Colors rule: every color is defined once, as a CSS variable in
// tokens.css. Components, charts and stylesheets only refer to those variables.
// Read from disk: the test setup turns CSS imports off (vite.config.ts, css: false).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(__dirname, "../..");
const skip = (file: string) => /\.test\.tsx?$/.test(file) || file.endsWith("api-types.ts");
const sources: Record<string, string> = Object.fromEntries(
  (readdirSync(SRC, { recursive: true }) as string[])
    .filter((file) => /\.(ts|tsx|css)$/.test(file) && !skip(file))
    .map((file) => [relative(SRC, join(SRC, file)), readFileSync(join(SRC, file), "utf8")]),
);
const tokens = sources[join("shared", "theme", "tokens.css")];

const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/gi;
const defined = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

test("the scan sees the app's files", () => {
  const files = Object.keys(sources);
  expect(files.some((f) => f.endsWith("dashboard/Charts.tsx"))).toBe(true);
  expect(files.some((f) => f.endsWith("theme/components.css"))).toBe(true);
  expect(files.length).toBeGreaterThan(40);
});

test.each(Object.entries(sources).filter(([file]) => !file.endsWith("theme/tokens.css")))(
  "%s uses color tokens, not color literals",
  (_file, text) => {
    // Comments may mention a color, for example the spec's Sea Green #06D6A0.
    const code = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(code.match(COLOR_LITERAL) ?? []).toEqual([]);
  },
);

test.each(Object.entries(sources))("%s only uses tokens that exist", (_file, text) => {
  const used = [...text.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);
  expect(used.filter((name) => !defined.has(name))).toEqual([]);
});

test("the brand colors are the spec's", () => {
  const value = (name: string) =>
    new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)?.[1].trim().toLowerCase();
  expect(value("--sea-green")).toBe("#06d6a0");
  expect(value("--marigold")).toBe("#ffc145");
  expect(value("--coral")).toBe("#f78c6b");
  expect(value("--cerulean")).toBe("#118ab2");
  expect(value("--raspberry")).toBe("#ef476f");
  expect(value("--ink")).toBe("#073b4c");
  expect(value("--sea-mist")).toBe("#cdd8db");
  expect(value("--page")).toBe("#f0f4f5");
});
