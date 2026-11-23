// TF02: stage order, colors and usual probabilities match the spec.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STAGES, OPEN_STAGES } from "./stages";

test("six stages in order with their usual probabilities", () => {
  expect(STAGES.map((s) => [s.label, s.usualProbability])).toEqual([
    ["New", 10],
    ["Qualified", 25],
    ["Proposal", 50],
    ["Negotiation", 75],
    ["Won", 100],
    ["Lost", 0],
  ]);
  expect(OPEN_STAGES).toEqual(["new", "qualified", "proposal", "negotiation"]);
});

test("stage colors: a Cerulean scale, then Sea Green and Raspberry", () => {
  const tokens = readFileSync(join(__dirname, "theme", "tokens.css"), "utf8");
  const value = (name: string) =>
    tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))![1].toLowerCase();
  const mix = (alpha: number) => {
    // Cerulean #118AB2 at `alpha` over white.
    const c = [0x11, 0x8a, 0xb2].map((ch) => Math.round(ch * alpha + 255 * (1 - alpha)));
    return "#" + c.map((ch) => ch.toString(16).padStart(2, "0")).join("");
  };
  expect(STAGES.map((s) => s.color)).toEqual(STAGES.map((s) => `var(--stage-${s.key})`));
  expect(value("stage-new")).toBe(mix(0.35));
  expect(value("stage-qualified")).toBe(mix(0.6));
  expect(value("stage-proposal")).toBe(mix(0.8));
  expect(value("stage-negotiation")).toBe(value("cerulean"));
  expect(value("stage-won")).toBe(value("sea-green"));
  expect(value("stage-lost")).toBe(value("raspberry"));
});
