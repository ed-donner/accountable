export type Theme = "light" | "dark" | "system";
export type Mode = "light" | "dark";

export const THEMES: Theme[] = ["light", "dark", "system"];

/**
 * Light and dark were saved under this key before System existed, so an earlier choice
 * carries over. The script at the top of index.html reads it too, so keep the two in step.
 */
export const THEME_KEY = "accountable-mode";

function darkDevice() {
  return window.matchMedia("(prefers-color-scheme: dark)");
}

/** The choice saved in this browser. Light if there isn't one or it can't be read. */
export function savedTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "dark" || saved === "system" ? saved : "light";
  } catch {
    return "light";
  }
}

/** What's on screen for a theme: System asks the device. */
export function modeFor(theme: Theme): Mode {
  if (theme !== "system") return theme;
  return darkDevice().matches ? "dark" : "light";
}

function showMode(mode: Mode) {
  const root = document.documentElement;
  root.dataset.mode = mode;
  // Makes the browser's own date pickers, select lists and scrollbars follow.
  root.style.colorScheme = mode;
}

let stopFollowingDevice: (() => void) | undefined;

/** Shows the theme's mode. While System is shown, switches as soon as the device does (L1). */
export function applyTheme(theme: Theme) {
  stopFollowingDevice?.();
  stopFollowingDevice = undefined;
  showMode(modeFor(theme));
  if (theme !== "system") return;

  const device = darkDevice();
  const follow = () => showMode(device.matches ? "dark" : "light");
  device.addEventListener("change", follow);
  stopFollowingDevice = () => device.removeEventListener("change", follow);
}

/** Shows the theme, and saves the choice if the browser lets it. */
export function setTheme(theme: Theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage can be off or full. The theme still shows until the page is reloaded.
  }
}
