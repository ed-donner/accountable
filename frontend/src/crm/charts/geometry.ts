import { useEffect, useRef, useState } from "react";

export function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

export const FUNNEL_SIDE = 196; // Room to the right for the values and percentages.
export const FUNNEL_ROUND = 6; // Rounded corners come from a stroke this wide with rounded joins.
const NARROWEST = 100; // Keeps a small stage wide enough for its name.
const NARROWEST_LAST = 60; // The last stage's name is short, so it can keep narrowing.
const SPOUT = 0.68; // The last stage tapers this much further, to end neatly.

/** Each stage's top edge is as wide as the value that reached it, then one more for the spout. */
export function funnelWidths(values: number[], width: number) {
  const room = width - FUNNEL_SIDE - FUNNEL_ROUND;
  const widest = Math.max(values[0], 1);
  const last = values.length - 1;
  const widths = values.map((value, index) =>
    Math.max((value / widest) * room, index === last ? NARROWEST_LAST : NARROWEST),
  );
  widths.push(widths[last] * SPOUT);
  return widths;
}

export const REVENUE_MARGIN = { top: 30, right: 64, bottom: 28, left: 36 };

/**
 * The margins are in pixels, but the axes work in months and dollars. The fill runs
 * past the months on both sides and below zero, to the panel's edges, so this says how
 * far that is at this size. Fixed shares would only line up at one window size.
 */
export function revenueEdges(width: number, height: number, months: number, top: number) {
  const { top: above, right, bottom, left } = REVENUE_MARGIN;
  const last = months - 1;
  const perMonth = (width - left - right) / last;
  return {
    left: -left / perMonth,
    right: last + right / perMonth,
    bottom: (-top * bottom) / (height - above - bottom),
  };
}
