import { useSyncExternalStore } from "react";

export type Mode = "light" | "dark";

/** Where the choice is kept. The script in index.html reads the same key. */
export const MODE_KEY = "accountable-mode";

// While this class is on <html>, nothing transitions (index.css), so every
// color changes at once rather than fading out of step (spec 2.6).
const SWITCHING = "mode-switching";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** The mode on screen: the dark class on <html>, which index.html sets before the page draws. */
export function currentMode(): Mode {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Switch the whole app, and remember the choice in this browser (GEN-9, GEN-10). */
export function setMode(mode: Mode) {
  const root = document.documentElement;
  root.classList.add(SWITCHING);
  root.classList.toggle("dark", mode === "dark");
  // Reading a layout value makes the browser work out every element's new
  // colors now, while transitions are off.
  void document.body.offsetHeight;
  requestAnimationFrame(() => root.classList.remove(SWITCHING));
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage can be blocked. The switch still holds until the page reloads.
  }
  listeners.forEach((listener) => listener());
}

/** The current mode, kept up to date in components. */
export function useMode(): Mode {
  return useSyncExternalStore(subscribe, currentMode, () => "light");
}
