// The rules from backend/app/rules.py that the browser needs (spec 2.4).
// rules.test.ts checks them against the same cases as the backend.

import { addDaysTo } from "./dates";

export const STAGES = ["new", "qualified", "proposal", "negotiation", "won", "lost"] as const;
export type Stage = (typeof STAGES)[number];
export const OPEN_STAGES: readonly Stage[] = ["new", "qualified", "proposal", "negotiation"];
export const FUNNEL_STAGES: readonly Stage[] = ["new", "qualified", "proposal", "negotiation", "won"];

export const STAGE_NAMES: Record<Stage, string> = {
  new: "New",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export const USUAL_PROBABILITY: Record<Stage, number> = {
  new: 10,
  qualified: 25,
  proposal: 50,
  negotiation: 75,
  won: 100,
  lost: 0,
};

export const STATUSES = ["lead", "qualified", "customer"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_NAMES: Record<Status, string> = { lead: "Lead", qualified: "Qualified", customer: "Customer" };

export const CLOSED_WINDOW_DAYS = 30;

export function isOpen(stage: Stage): boolean {
  return OPEN_STAGES.includes(stage);
}

export function isClosed(stage: Stage): boolean {
  return stage === "won" || stage === "lost";
}

/** Value times probability, rounded to the nearest dollar, halves up (DEAL-3). */
export function expectedValue(value: number, probability: number): number {
  return Math.floor((value * probability + 50) / 100);
}

/** Open, and the close date is before today (DEAL-2). YYYY-MM-DD strings compare in order. */
export function isLate(stage: Stage, closeDate: string, today: string): boolean {
  return isOpen(stage) && closeDate < today;
}

/** Shown in the board's Won and Lost columns (PIPE-2). */
export function inClosedWindow(closeDate: string, today: string): boolean {
  return closeDate >= addDaysTo(today, -CLOSED_WINDOW_DAYS);
}

/**
 * A website as a link, or null. Only http and https addresses become links,
 * with https:// added when there's no scheme (spec 1.3).
 */
export function safeHref(website: string | null | undefined): string | null {
  const value = (website ?? "").trim();
  if (!value) return null;
  let candidate: string;
  if (/^https?:\/\//i.test(value)) {
    candidate = value;
  } else if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(value) || value.startsWith("//")) {
    // Another scheme, such as javascript: or ftp:.
    return null;
  } else {
    candidate = `https://${value}`;
  }
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Colors for each stage and status (spec 2.6, concern 1). */
export type Tone = "slate" | "marigold" | "coral" | "cerulean" | "sea-green" | "raspberry";

export const STAGE_TONE: Record<Stage, Tone> = {
  new: "slate",
  qualified: "marigold",
  proposal: "coral",
  negotiation: "cerulean",
  won: "sea-green",
  lost: "raspberry",
};

export const STATUS_TONE: Record<Status, Tone> = {
  lead: "slate",
  qualified: "marigold",
  customer: "sea-green",
};

/** The color itself, for fills, dots and chart marks: the same in both modes (spec 2.6). */
export const TONE_COLOR: Record<Tone, string> = {
  slate: "var(--slate)",
  marigold: "var(--marigold)",
  coral: "var(--coral)",
  cerulean: "var(--cerulean)",
  "sea-green": "var(--sea-green)",
  raspberry: "var(--raspberry)",
};
