/** The figures on every chart's axes: JetBrains Mono at 12px. Each chart sets their color and weight. */
export const AXIS_TEXT = { fontSize: 12, fontFamily: "var(--font-mono)" };

/** The top of a money axis: the first round step at or above the highest value, such as $50k above $42,000. */
export function niceTop(value: number) {
  const power = 10 ** Math.floor(Math.log10(value));
  const scaled = value / power;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
  return step * power;
}
