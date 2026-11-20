import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { META, fakeApi, renderWithApp } from "@/test/render";
import { LogActivity } from "./LogActivity";

// Only the clock and the timers are faked, so fetch and promises behave as usual.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date(2026, 10, 19, 9, 0));
});
afterEach(() => {
  vi.useRealTimers();
});

/** Let the clock run on, then let the "When" field catch up. */
function minutesPass(minutes: number) {
  vi.setSystemTime(Date.now() + minutes * 60_000);
  act(() => vi.advanceTimersByTime(6_000));
}

const when = () => screen.getByLabelText(/^When/) as HTMLInputElement;

describe("LogActivity's When (ACT-1)", () => {
  it("keeps up with the clock while the page stays open", () => {
    fakeApi({ "GET /api/meta": META });
    renderWithApp(<LogActivity target={{ deal_id: 100 }} idPrefix="deal-100" />);
    expect(when().value).toBe("2026-11-19T09:00");

    minutesPass(40);
    expect(when().value).toBe("2026-11-19T09:40");
  });

  it("stops once it's changed by hand, and starts again after a log", async () => {
    const { calls } = fakeApi({
      "GET /api/meta": META,
      "POST /api/activities": (body: unknown) => ({ id: 1, ...(body as object) }),
    });
    renderWithApp(<LogActivity target={{ deal_id: 100 }} idPrefix="deal-100" />);

    fireEvent.change(when(), { target: { value: "2026-11-18T16:30" } });
    minutesPass(40);
    expect(when().value).toBe("2026-11-18T16:30");

    fireEvent.change(screen.getByPlaceholderText("What happened?"), { target: { value: "Called back" } });
    fireEvent.click(screen.getByRole("button", { name: "Log activity" }));
    await waitFor(() => expect(calls.some((call) => call.method === "POST")).toBe(true));
    expect(calls.find((call) => call.method === "POST")?.body).toMatchObject({
      occurred_at: "2026-11-19T00:30:00Z",
    });

    // After the log the box starts again at now, and follows the clock.
    await waitFor(() => expect(when().value).toBe("2026-11-19T09:40"));
    minutesPass(5);
    expect(when().value).toBe("2026-11-19T09:45");
  });
});
