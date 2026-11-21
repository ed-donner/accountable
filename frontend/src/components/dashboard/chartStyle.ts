// Chart text and grid lines (spec 2.6, Charts). Chrome and Edge read CSS
// variables in SVG attributes, so the charts follow the mode like the rest.
export const AXIS_TICK = { fontFamily: "JetBrains Mono, monospace", fontSize: 12, fill: "var(--ink-subtle)" };
export const GRID = "var(--line)";

export type MonthRow = { month: string; label: string; revenue: number; deals: number };
