export type Mode = "light" | "dark";

/** The script at the top of index.html reads the same key, so keep the two in step. */
export const MODE_KEY = "accountable-mode";

/** The choice saved in this browser. Light if there isn't one or it can't be read. */
export function savedMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Shows the page in this mode, and saves the choice if the browser lets it. */
export function setMode(mode: Mode) {
  const root = document.documentElement;
  root.dataset.mode = mode;
  // Makes the browser's own date pickers, select lists and scrollbars follow.
  root.style.colorScheme = mode;
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage can be off or full. The switch still works until the page is reloaded.
  }
}
