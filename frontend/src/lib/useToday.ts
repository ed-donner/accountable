import { useSyncExternalStore } from "react";

import { todayIso } from "./dates";

const CHECK_MS = 60_000;

/**
 * Keeps looking at the clock, rather than setting a timer for midnight, because
 * timers stop while a laptop sleeps and one aimed at midnight would go off hours
 * late. Waking with the window still focused may fire no event at all, so the
 * regular check covers that, and these two make coming back to a tab immediate.
 */
function subscribe(check: () => void) {
  const timer = setInterval(check, CHECK_MS);
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", check);
  return () => {
    clearInterval(timer);
    window.removeEventListener("focus", check);
    document.removeEventListener("visibilitychange", check);
  };
}

/**
 * Today as a plain date, for anything on screen that depends on it. The page can
 * stay open for days, so reading the clock once while drawing would go out of date.
 * Nothing redraws unless the date has actually changed.
 */
export function useToday(): string {
  return useSyncExternalStore(subscribe, todayIso);
}
