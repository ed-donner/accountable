// TF14 and TF15: a move updates the totals at once; a failed save puts the card back.
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { DealRow } from "../deals/hooks";
import { mockApi, testClient } from "../shared/test-utils";
import { ToastProvider } from "../shared/Toast";
import { applyMove, boardTotals, buildColumns, isNoMove, moveFrom, totals, withHiddenCards } from "./board";
import { BOARD_KEY, useMoveDeal } from "./hooks";

afterEach(() => vi.unstubAllGlobals());

function deal(id: number, stage: DealRow["stage"], position: number, value: number, probability: number): DealRow {
  return {
    id, name: `Deal ${id}`, stage, position, value, probability,
    expected_revenue: Math.round((value * probability) / 100),
    organization_id: 1, contact_id: null, organization_name: "Acme", contact_name: null,
    close_date: "2026-10-01", is_late: stage !== "won" && stage !== "lost",
    created_at: "2026-01-01T00:00:00", updated_at: "2026-01-01T00:00:00",
  };
}

const deals = [
  deal(1, "new", 1, 1000, 10),
  deal(2, "new", 2, 2000, 10),
  deal(3, "proposal", 1, 4000, 50),
  deal(4, "won", 1, 8000, 100),
];

test("TF14 a move to another column updates column and board totals at once", () => {
  const moved = applyMove(deals, { id: 2, stage: "proposal", afterId: null, beforeId: 3 }, "2026-11-16");
  const column = (stage: string) => totals(moved.filter((d) => d.stage === stage));
  expect(column("new")).toEqual({ count: 1, value: 1000, expected: 100 });
  expect(column("proposal")).toEqual({ count: 2, value: 6000, expected: 3000 });
  expect(boardTotals(moved)).toEqual({ count: 3, value: 7000, expected: 3100 });
  expect(buildColumns(moved).proposal).toEqual([2, 3]);
});

test("TF14 dropping into Won closes the deal and takes it off the board's totals", () => {
  const moved = applyMove(deals, { id: 3, stage: "won", afterId: 4, beforeId: null }, "2026-11-16");
  const won = moved.find((d) => d.id === 3)!;
  expect(won).toMatchObject({ stage: "won", probability: 100, close_date: "2026-11-16", is_late: false, position: 2 });
  expect(boardTotals(moved)).toEqual({ count: 2, value: 3000, expected: 300 });
});

test("TF14 a move within a column keeps the probability and changes only the order", () => {
  const moved = applyMove(deals, { id: 1, stage: "new", afterId: 2, beforeId: null }, "2026-11-16");
  expect(buildColumns(moved).new).toEqual([2, 1]);
  expect(moved.find((d) => d.id === 1)!.probability).toBe(10);
  expect(isNoMove(deals, moveFrom(buildColumns(deals), 1)!)).toBe(true);
});

test("TF15 a failed save puts the card back and says so", async () => {
  // The server's answer waits until the test lets it go.
  let fail: () => void = () => {};
  const failed = new Promise<void>((resolve) => (fail = resolve));
  mockApi({ "GET /deals": { items: deals, total: deals.length } });
  const listFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    if (init.method === "POST") {
      await failed;
      return new Response(JSON.stringify({ message: "boom" }), { status: 500 });
    }
    return listFetch(url, init);
  });
  const client = testClient();
  client.setQueryData(BOARD_KEY, { items: deals, total: deals.length });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  const { result } = renderHook(() => useMoveDeal(), { wrapper });

  act(() => result.current.mutate({ id: 2, stage: "won", afterId: null, beforeId: 4 }));
  // Straight away the card shows in Won...
  await waitFor(() =>
    expect(client.getQueryData<{ items: DealRow[] }>(BOARD_KEY)!.items.find((d) => d.id === 2)!.stage).toBe("won"),
  );
  // ...then the save fails and it goes back, with a message.
  fail();
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(client.getQueryData<{ items: DealRow[] }>(BOARD_KEY)!.items.find((d) => d.id === 2)!.stage).toBe("new");
  expect(await screen.findByText(/^Couldn't move Deal 2\. Something went wrong in Accountable/)).toBeInTheDocument();
});

test("TF15 a failed save puts back only its own card, not another one still saving (RV7)", async () => {
  let failFirst: () => void = () => {};
  const firstDone = new Promise<void>((resolve) => (failFirst = resolve));
  let finishSecond: () => void = () => {};
  const secondDone = new Promise<void>((resolve) => (finishSecond = resolve));
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.endsWith("/deals/2/move")) {
      await firstDone;
      return new Response(JSON.stringify({ message: "boom" }), { status: 500 });
    }
    if (url.endsWith("/deals/3/move")) {
      await secondDone;
      return new Response(JSON.stringify({ ...deals[2], stage: "won" }), { status: 200 });
    }
    return new Response(JSON.stringify({ items: deals, total: deals.length }), { status: 200 });
  });
  const client = testClient();
  client.setQueryData(BOARD_KEY, { items: deals, total: deals.length });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  const first = renderHook(() => useMoveDeal(), { wrapper }).result;
  const second = renderHook(() => useMoveDeal(), { wrapper }).result;
  const stageOf = (id: number) => client.getQueryData<{ items: DealRow[] }>(BOARD_KEY)!.items.find((d) => d.id === id)!.stage;

  act(() => first.current.mutate({ id: 2, stage: "proposal", afterId: null, beforeId: 3 }));
  await waitFor(() => expect(stageOf(2)).toBe("proposal"));
  act(() => second.current.mutate({ id: 3, stage: "won", afterId: null, beforeId: 4 }));
  await waitFor(() => expect(stageOf(3)).toBe("won"));

  failFirst();
  await waitFor(() => expect(first.current.isError).toBe(true));
  expect(stageOf(2)).toBe("new");
  // The second card stays where it was dropped while its save is still going.
  expect(stageOf(3)).toBe("won");
  finishSecond();
  await waitFor(() => expect(second.current.isSuccess).toBe(true));
});

// RV8 and its siblings: every column's figures, open or closed.
test.each([
  ["new", { count: 2, value: 3000, expected: 300 }],
  ["proposal", { count: 1, value: 4000, expected: 2000 }],
  ["won", { count: 1, value: 8000, expected: 8000 }],
  ["lost", { count: 0, value: 0, expected: 0 }],
] as const)("the %s column's totals include expected revenue", (stage, expected) => {
  expect(totals(deals.filter((d) => d.stage === stage))).toEqual(expected);
});

test.each([
  ["won", 100, 2000],
  ["lost", 0, 0],
] as const)("a card dropped into %s expects %i%% of its value", (stage, probability, expected) => {
  const moved = applyMove(deals, { id: 2, stage, afterId: null, beforeId: null }, "2026-11-16").find((d) => d.id === 2)!;
  expect(moved).toMatchObject({ stage, probability, expected_revenue: expected, close_date: "2026-11-16", is_late: false });
});

test("a card moved back to an open stage keeps its close date and takes the stage's probability", () => {
  const moved = applyMove(deals, { id: 4, stage: "negotiation", afterId: null, beforeId: null }, "2026-11-16").find((d) => d.id === 4)!;
  expect(moved).toMatchObject({ stage: "negotiation", probability: 75, expected_revenue: 6000, close_date: "2026-10-01" });
});

// RV7's sibling: a save that succeeds mustn't reload the board under a card still saving.
test("TF15 the board reloads from the server only once the last move has saved", async () => {
  const release: Record<number, () => void> = {};
  const waits: Record<number, Promise<void>> = {
    2: new Promise((resolve) => (release[2] = resolve)),
    3: new Promise((resolve) => (release[3] = resolve)),
  };
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const moving = /\/deals\/(\d+)\/move$/.exec(url);
    if (moving && init.method === "POST") {
      const id = Number(moving[1]);
      await waits[id];
      return new Response(JSON.stringify({ ...deals.find((d) => d.id === id)!, stage: "won" }), { status: 200 });
    }
    return new Response(JSON.stringify({ items: deals, total: deals.length }), { status: 200 });
  });
  const client = testClient();
  client.setQueryData(BOARD_KEY, { items: deals, total: deals.length });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  const first = renderHook(() => useMoveDeal(), { wrapper }).result;
  const second = renderHook(() => useMoveDeal(), { wrapper }).result;
  const invalidate = vi.spyOn(client, "invalidateQueries");

  act(() => first.current.mutate({ id: 2, stage: "won", afterId: null, beforeId: 4 }));
  act(() => second.current.mutate({ id: 3, stage: "won", afterId: 4, beforeId: null }));
  release[2]();
  await waitFor(() => expect(first.current.isSuccess).toBe(true));
  expect(invalidate).not.toHaveBeenCalled();

  release[3]();
  await waitFor(() => expect(second.current.isSuccess).toBe(true));
  await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
});

// P4 with a search on: X (1) and Y (3) are visible, H (2) is hidden between them.
const searched = [deal(11, "proposal", 1, 100, 50), deal(12, "proposal", 2, 100, 50), deal(13, "proposal", 3, 100, 50), deal(14, "new", 1, 100, 10)];

test("TF14 with a search on, a drop between two visible cards goes directly under the upper one", () => {
  const move = withHiddenCards(searched, { id: 14, stage: "proposal", afterId: 11, beforeId: 13 });
  expect(move).toEqual({ id: 14, stage: "proposal", afterId: 11, beforeId: 12 });
  const after = applyMove(searched, move, "2026-11-16");
  expect(buildColumns(after).proposal).toEqual([11, 14, 12, 13]);
});

test("TF14 with a search on, a drop at the top of the visible cards goes to the very top", () => {
  expect(withHiddenCards(searched, { id: 14, stage: "proposal", afterId: null, beforeId: 13 })).toEqual({
    id: 14, stage: "proposal", afterId: null, beforeId: 11,
  });
});

test("TF14 with no search, the drop is unchanged", () => {
  const move = { id: 14, stage: "proposal" as const, afterId: 11, beforeId: 12 };
  expect(withHiddenCards(searched, move)).toEqual(move);
  const last = { id: 14, stage: "proposal" as const, afterId: 13, beforeId: null };
  expect(withHiddenCards(searched, last)).toEqual(last);
});

test("TF15 moves save one after another, but each card moves on the board at once", async () => {
  let releaseFirst: () => void = () => {};
  const firstHeld = new Promise<void>((resolve) => (releaseFirst = resolve));
  const sent: number[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const moving = /\/deals\/(\d+)\/move$/.exec(url);
    if (moving && init.method === "POST") {
      const id = Number(moving[1]);
      sent.push(id);
      if (id === 2) await firstHeld;
      return new Response(JSON.stringify({ ...deals.find((d) => d.id === id)!, stage: "won" }), { status: 200 });
    }
    return new Response(JSON.stringify({ items: deals, total: deals.length }), { status: 200 });
  });
  const client = testClient();
  client.setQueryData(BOARD_KEY, { items: deals, total: deals.length });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  const first = renderHook(() => useMoveDeal(), { wrapper }).result;
  const second = renderHook(() => useMoveDeal(), { wrapper }).result;
  const stageOf = (id: number) => client.getQueryData<{ items: DealRow[] }>(BOARD_KEY)!.items.find((d) => d.id === id)!.stage;

  act(() => first.current.mutate({ id: 2, stage: "won", afterId: null, beforeId: 4 }));
  // Dropped next to card 2 while card 2 is still saving.
  act(() => second.current.mutate({ id: 3, stage: "won", afterId: 2, beforeId: 4 }));
  await waitFor(() => expect(stageOf(3)).toBe("won"));
  expect(stageOf(2)).toBe("won");
  expect(sent).toEqual([2]);

  releaseFirst();
  await waitFor(() => expect(second.current.isSuccess).toBe(true));
  expect(sent).toEqual([2, 3]);
});
