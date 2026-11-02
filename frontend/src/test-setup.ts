import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import { MODE_KEY } from "./lib/mode";

afterEach(cleanup);

// jsdom keeps storage and the page's own element between tests, so one test's mode
// would otherwise carry into the next.
afterEach(() => {
  localStorage.removeItem(MODE_KEY);
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
