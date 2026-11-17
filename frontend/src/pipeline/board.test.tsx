// TF14 and TF15: a move updates the totals at once; a failed save puts the card back.
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { DealRow } from "../deals/hooks";
import { mockApi, testClient } from "../shared/test-utils";
import { ToastProvider } from "../shared/Toast";
import { applyMove, boardTotals, buildColumns, isNoMove, moveFrom, totals } from "./board";
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
