import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom keeps storage and the page's own element between tests, so one test's mode
// or session would otherwise carry into the next. The page goes first, so nothing
// on it reacts to the session ending.
afterEach(() => {
  cleanup();
  localStorage.clear();
  // Like a browser, jsdom tells only other tabs that storage changed, so the session
  // is told by hand, the way it hears another tab sign out.
  window.dispatchEvent(new StorageEvent("storage", { key: null }));
  delete document.documentElement.dataset.mode;
  document.documentElement.style.colorScheme = "";
});

// jsdom leaves these out, and Radix and cmdk call them.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => undefined;
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => undefined;
