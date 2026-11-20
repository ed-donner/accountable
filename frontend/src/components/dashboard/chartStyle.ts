// Chart text and grid lines (spec 2.6, Charts). SVG attributes can't read CSS
// variables, so the brand values are written out here.
export const AXIS_TICK = { fontFamily: "JetBrains Mono, monospace", fontSize: 12, fill: "#56747E" };
export const GRID = "#E4ECEE";

export type MonthRow = { month: string; label: string; revenue: number; deals: number };
