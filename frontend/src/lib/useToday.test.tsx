import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useToday } from "./useToday";

const BEFORE_MIDNIGHT = new Date(2026, 9, 31, 23, 58);
const NEXT_MORNING = new Date(2026, 10, 1, 8, 0);

afterEach(() => {
  vi.useRealTimers();
});

describe("useToday", () => {
  it("starts on today", () => {
    vi.useFakeTimers({ now: BEFORE_MIDNIGHT });
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe("2026-10-31");
  });

  it("moves on by itself when the day ends", () => {
    vi.useFakeTimers({ now: BEFORE_MIDNIGHT });
    const { result } = renderHook(() => useToday());

    act(() => {
      vi.advanceTimersByTime(3 * 60_000);
    });

    expect(result.current).toBe("2026-11-01");
  });

  it("catches up within a minute of a laptop waking, with no event to say so", () => {
    vi.useFakeTimers({ now: BEFORE_MIDNIGHT });
    const { result } = renderHook(() => useToday());

    // The clock jumps and no timer has run, which is what sleeping looks like from here.
    vi.setSystemTime(NEXT_MORNING);
    expect(result.current).toBe("2026-10-31");

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current).toBe("2026-11-01");
  });

  it("catches up at once when the window regains focus", () => {
    vi.useFakeTimers({ now: BEFORE_MIDNIGHT });
    const { result } = renderHook(() => useToday());

    vi.setSystemTime(NEXT_MORNING);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(result.current).toBe("2026-11-01");
  });

  it("catches up at once when the tab is shown again", () => {
    vi.useFakeTimers({ now: BEFORE_MIDNIGHT });
    const { result } = renderHook(() => useToday());

    vi.setSystemTime(NEXT_MORNING);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current).toBe("2026-11-01");
  });

  it("doesn't redraw anything during the day", () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 31, 9, 0) });
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useToday();
    });
    const before = renders;

    act(() => {
      vi.advanceTimersByTime(60 * 60_000);
      window.dispatchEvent(new Event("focus"));
    });

    expect(renders).toBe(before);
  });

  it("stops checking when nothing is using it", () => {
    vi.useFakeTimers({ now: BEFORE_MIDNIGHT });
    const { unmount } = renderHook(() => useToday());
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
