import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SignedIn } from "../components/SignIn";
import { queryDefaults } from "../lib/queryDefaults";
import { signOut } from "../lib/session";
import { META, mockApi, startSignedIn, user, type Call } from "../test-utils";
import {
  useDashboard,
  useDeals,
  useMeta,
  useMoveDeal,
  useTickFollowUp,
  type Dashboard,
  type Deal,
  type Stage,
  type Timeline,
} from "./queries";

const supabase = await vi.hoisted(async () => (await import("../test-supabase")).fakeSupabase());

vi.mock("@supabase/supabase-js", async (original) => ({
  ...(await original<typeof import("@supabase/supabase-js")>()),
  createClient: () => supabase.client,
}));

function deal(id: number, stage: Stage = "new"): Deal {
  return {
    id,
    name: `Deal ${id}`,
    organization_id: 1,
    organization_name: "Harbor & Pine",
    main_contact_id: 11,
    main_contact_name: "Sam Carter",
    stage,
    value: 1000,
    probability: 5,
    expected_revenue: 50,
    close_date: "2026-12-18",
    position: id,
  };
}

function moved(id: number, stage: Stage) {
  return { deal: deal(id, stage), changes: { close_date: "2026-11-01", new_customer: null } };
}

const FAILED = () => ({ status: 500, body: { detail: "Something went wrong." } });

function setup() {
  const client = new QueryClient({ defaultOptions: queryDefaults });
  client.setQueryData(["meta"], META);
  client.setQueryData(["deals"], [deal(1), deal(2)]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

function stages(client: QueryClient) {
  return Object.fromEntries(client.getQueryData<Deal[]>(["deals"])!.map((item) => [item.id, item.stage]));
}

const toWon = { dealId: 1, stage: "won" as Stage, beforeDealId: null };
const toLost = { dealId: 2, stage: "lost" as Stage, beforeDealId: null };

describe("moves that overlap", () => {
  it("each shows its own message", async () => {
    const success = vi.spyOn(toast, "success");
    mockApi({ "GET /meta": META, "POST /deals/1/move": moved(1, "won"), "POST /deals/2/move": moved(2, "lost") });
    const { wrapper } = setup();
    const { result } = renderHook(() => useMoveDeal(), { wrapper });

    act(() => {
      result.current.mutate(toWon);
      result.current.mutate(toLost);
    });

    await waitFor(() => expect(success).toHaveBeenCalledTimes(2));
    expect(success.mock.calls.map(([message]) => message)).toEqual([
      "Marked as Won. Close date set to today.",
      "Marked as Lost. Close date set to today.",
    ]);
  });

  it("say so when the first fails, and the second still goes through", async () => {
    const success = vi.spyOn(toast, "success");
    const failure = vi.spyOn(toast, "error");
    const calls = mockApi({ "GET /meta": META, "POST /deals/1/move": FAILED, "POST /deals/2/move": moved(2, "lost") });
    const { wrapper } = setup();
    const { result } = renderHook(() => useMoveDeal(), { wrapper });

    act(() => {
      result.current.mutate(toWon);
      result.current.mutate(toLost);
    });

    await waitFor(() => expect(failure).toHaveBeenCalledOnce());
    expect(failure).toHaveBeenCalledWith("Couldn't move that deal, so it's back where it was.");
    await waitFor(() => expect(success).toHaveBeenCalledOnce());
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(2);
  });

  it("say so when the second fails too", async () => {
    const failure = vi.spyOn(toast, "error");
    mockApi({ "GET /meta": META, "POST /deals/1/move": FAILED, "POST /deals/2/move": FAILED });
    const { wrapper } = setup();
    const { result } = renderHook(() => useMoveDeal(), { wrapper });

    act(() => {
      result.current.mutate(toWon);
      result.current.mutate(toLost);
    });

    await waitFor(() => expect(failure).toHaveBeenCalledTimes(2));
  });

  it("all go back when they all fail, even if nothing can be read again", async () => {
    const failure = vi.spyOn(toast, "error");
    mockApi({ "GET /meta": META, "POST /deals/1/move": FAILED, "POST /deals/2/move": FAILED });
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useMoveDeal(), { wrapper });

    act(() => {
      result.current.mutate(toWon);
      result.current.mutate(toLost);
    });

    await waitFor(() => expect(failure).toHaveBeenCalledTimes(2));
    expect(stages(client)).toEqual({ 1: "new", 2: "new" });
  });

  it("put the same card back when each of its moves fails", async () => {
    const failure = vi.spyOn(toast, "error");
    mockApi({ "GET /meta": META, "POST /deals/1/move": FAILED });
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useMoveDeal(), { wrapper });

    act(() => {
      result.current.mutate(toWon);
      result.current.mutate({ dealId: 1, stage: "lost", beforeDealId: null });
    });

    await waitFor(() => expect(failure).toHaveBeenCalledTimes(2));
    expect(stages(client)).toEqual({ 1: "new", 2: "new" });
  });

  it("leave a card that's still saving where it was dropped when an earlier move fails", async () => {
    const shown: Record<number, Stage>[] = [];
    mockApi({ "GET /meta": META, "POST /deals/1/move": FAILED, "POST /deals/2/move": moved(2, "lost") });
    const { client, wrapper } = setup();
    vi.spyOn(toast, "error").mockImplementation(() => {
      shown.push(stages(client));
      return 1;
    });
    const { result } = renderHook(() => useMoveDeal(), { wrapper });

    act(() => {
      result.current.mutate(toWon);
      result.current.mutate(toLost);
    });

    await waitFor(() => expect(shown).toHaveLength(1));
    expect(shown[0]).toEqual({ 1: "new", 2: "lost" });
  });

  it("show the newest drop when an older move's reply arrives", async () => {
    const shown: Record<number, Stage>[] = [];
    let replies = 0;
    mockApi({
      "GET /meta": META,
      "POST /deals/1/move": () => {
        replies += 1;
        return { body: moved(1, replies === 1 ? "won" : "lost") };
      },
    });
    const { client, wrapper } = setup();
    vi.spyOn(toast, "success").mockImplementation(() => {
      shown.push(stages(client));
      return 1;
    });
    const { result } = renderHook(() => useMoveDeal(), { wrapper });

    act(() => {
      result.current.mutate(toWon);
      result.current.mutate({ dealId: 1, stage: "lost", beforeDealId: null });
    });

    await waitFor(() => expect(shown).toHaveLength(2));
    expect(shown[0][1]).toBe("lost");
    expect(shown[1][1]).toBe("lost");
  });

  it("go out one at a time, in order", async () => {
    const calls = mockApi({
      "GET /meta": META,
      "POST /deals/1/move": moved(1, "won"),
      "POST /deals/2/move": moved(2, "lost"),
    });
    const { wrapper } = setup();
    const { result } = renderHook(() => useMoveDeal(), { wrapper });

    act(() => {
      result.current.mutate(toWon);
      result.current.mutate(toLost);
    });

    await waitFor(() => expect(calls.filter((call) => call.method === "POST")).toHaveLength(2));
    expect(calls.filter((call) => call.method === "POST").map((call) => call.path)).toEqual([
      "/deals/1/move",
      "/deals/2/move",
    ]);
  });
});

describe("a move still finishing after the board has gone", () => {
  it("shows its message", async () => {
    const success = vi.spyOn(toast, "success");
    mockApi({ "GET /meta": META, "POST /deals/1/move": moved(1, "won") });
    const { wrapper } = setup();
    const { result, unmount } = renderHook(() => useMoveDeal(), { wrapper });

    act(() => result.current.mutate(toWon));
    unmount();

    await waitFor(() => expect(success).toHaveBeenCalledOnce());
  });

  it("says so and puts the card back if it fails", async () => {
    const failure = vi.spyOn(toast, "error");
    mockApi({ "GET /meta": META, "POST /deals/1/move": FAILED });
    const { client, wrapper } = setup();
    const { result, unmount } = renderHook(() => useMoveDeal(), { wrapper });

    act(() => result.current.mutate(toWon));
    unmount();

    await waitFor(() => expect(failure).toHaveBeenCalledOnce());
    expect(client.getQueryData<Deal[]>(["deals"])?.find((item) => item.id === 1)?.stage).toBe("new");
  });
});

describe("a move still on its way when its session ends", () => {
  type Reply = { status: number; body: unknown };

  function answer({ status, body }: Reply) {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }

  /** The local copy, showing everyone whatever deals the test sets, and holding each move's reply until it's sent. */
  function standInBackend() {
    const backend = { deals: [] as Deal[], replyToMove: new Map<number, (reply: Reply) => void>() };
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      const path = url.replace(/^\/api/, "");
      const move = /^\/deals\/(\d+)\/move$/.exec(path);
      if (move && init.method === "POST") {
        return new Promise<Response>((resolve) =>
          backend.replyToMove.set(Number(move[1]), (reply) => resolve(answer(reply))),
        );
      }
      const replies: Record<string, unknown> = { "/meta": META, "/deals": backend.deals, "/local/teammates": [] };
      return answer(path in replies ? { status: 200, body: replies[path] } : { status: 404, body: {} });
    });
    return backend;
  }

  function Board() {
    useMeta();
    const deals = useDeals();
    const move = useMoveDeal();
    if (!deals.data) return <p>Loading the deals</p>;
    return (
      <>
        <p data-testid="deals">{deals.data.map((item) => `${item.name}: ${item.stage}`).join(", ")}</p>
        {deals.data.map((item) => (
          <button key={item.id} onClick={() => move.mutate({ dealId: item.id, stage: "won", beforeDealId: null })}>
            Win {item.name}
          </button>
        ))}
      </>
    );
  }

  function shown() {
    return screen.getByTestId("deals").textContent;
  }

  /** Alex wins a deal and signs out before the reply comes, and Dana signs in and sees her own deals. */
  async function changeHandsDuringAMove() {
    const backend = standInBackend();
    backend.deals = [deal(1), deal(2)];
    startSignedIn("alex-token");
    render(
      <SignedIn>
        <Board />
      </SignedIn>,
    );
    await user().click(await screen.findByRole("button", { name: "Win Deal 1" }));
    expect(shown()).toContain("Deal 1: won");

    await act(() => signOut());
    backend.deals = [deal(3)];
    act(() => startSignedIn("dana-token"));
    await waitFor(() => expect(shown()).toBe("Deal 3: new"));
    return backend;
  }

  /** Lets a reply's handlers finish, and anything they changed show. */
  async function settle() {
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }

  it("leaves the next person's deals alone when it goes through", async () => {
    const success = vi.spyOn(toast, "success");
    const backend = await changeHandsDuringAMove();

    act(() => backend.replyToMove.get(1)!({ status: 200, body: moved(1, "won") }));
    await waitFor(() => expect(success).toHaveBeenCalledOnce());
    await settle();

    expect(shown()).toBe("Deal 3: new");
  });

  it("leaves the next person's deals alone when it fails", async () => {
    const failure = vi.spyOn(toast, "error");
    const backend = await changeHandsDuringAMove();

    act(() => backend.replyToMove.get(1)!({ status: 500, body: { detail: "Something went wrong." } }));
    await waitFor(() => expect(failure).toHaveBeenCalledOnce());
    await settle();

    expect(shown()).toBe("Deal 3: new");
  });

  it("leaves the next person's own moves alone", async () => {
    await changeHandsDuringAMove();

    await user().click(screen.getByRole("button", { name: "Win Deal 3" }));

    expect(shown()).toBe("Deal 3: won");
  });
});

describe("ticks", () => {
  function pages(done = false): InfiniteData<Timeline> {
    const entry = (id: number) => ({
      kind: "activity" as const,
      id,
      at: "2026-10-30T15:20:00Z",
      type: "call" as const,
      description: `Activity ${id}`,
      follow_up_date: "2999-01-02",
      follow_up_done: done,
      about: { kind: "deal" as const, id: 7, name: "Annual support" },
      created_by: null,
    });
    return {
      pages: [
        { entries: [entry(1)], total: 2 },
        { entries: [entry(2)], total: 2 },
      ],
      pageParams: [0, 50],
    };
  }

  function followUp(id: number) {
    return {
      id,
      description: `Activity ${id}`,
      follow_up_date: "2999-01-02",
      overdue: false,
      about: { kind: "deal" as const, id: 7, name: "x" },
    };
  }

  function board(): Dashboard {
    return {
      overdue_follow_ups: 0,
      follow_ups: { overdue: 0, upcoming: 2, items: [followUp(1), followUp(2)] },
    } as Dashboard;
  }

  it("reach an entry on any page of a timeline", async () => {
    mockApi({ "PATCH /activities/2": { id: 2 } });
    const { client, wrapper } = setup();
    client.setQueryData(["deals", 7, "timeline"], pages());
    const { result } = renderHook(() => useTickFollowUp(), { wrapper });

    act(() => result.current.mutate({ id: 2, done: true }));

    await waitFor(() => {
      const data = client.getQueryData<InfiniteData<Timeline>>(["deals", 7, "timeline"]);
      expect(data?.pages[1].entries[0].follow_up_done).toBe(true);
    });
    const data = client.getQueryData<InfiniteData<Timeline>>(["deals", 7, "timeline"]);
    expect(data?.pages[0].entries[0].follow_up_done).toBe(false);
  });

  it("put every copy back if the save fails, and say so", async () => {
    const failure = vi.spyOn(toast, "error");
    mockApi({ "PATCH /activities/1": FAILED });
    const { client, wrapper } = setup();
    client.setQueryData(["deals", 7, "timeline"], pages());
    client.setQueryData(["dashboard"], board());
    const { result } = renderHook(() => useTickFollowUp(), { wrapper });

    act(() => result.current.mutate({ id: 1, done: true }));

    await waitFor(() => expect(failure).toHaveBeenCalledOnce());
    expect(
      client.getQueryData<InfiniteData<Timeline>>(["deals", 7, "timeline"])?.pages[0].entries[0].follow_up_done,
    ).toBe(false);
    expect(client.getQueryData<Dashboard>(["dashboard"])?.follow_ups.items).toHaveLength(2);
  });

  it("each say so when two overlap and both fail", async () => {
    const failure = vi.spyOn(toast, "error");
    mockApi({ "PATCH /activities/1": FAILED, "PATCH /activities/2": FAILED });
    const { wrapper } = setup();
    const { result } = renderHook(() => useTickFollowUp(), { wrapper });

    act(() => {
      result.current.mutate({ id: 1, done: true });
      result.current.mutate({ id: 2, done: true });
    });

    await waitFor(() => expect(failure).toHaveBeenCalledTimes(2));
  });

  it("put each one back when two overlap and both fail, even if nothing can be read again", async () => {
    const failure = vi.spyOn(toast, "error");
    mockApi({ "PATCH /activities/1": FAILED, "PATCH /activities/2": FAILED });
    const { client, wrapper } = setup();
    client.setQueryData(["deals", 7, "timeline"], pages());
    client.setQueryData(["dashboard"], board());
    const { result } = renderHook(() => useTickFollowUp(), { wrapper });

    act(() => {
      result.current.mutate({ id: 1, done: true });
      result.current.mutate({ id: 2, done: true });
    });

    await waitFor(() => expect(failure).toHaveBeenCalledTimes(2));
    const dashboard = client.getQueryData<Dashboard>(["dashboard"]);
    expect(dashboard?.follow_ups.items.map((item) => item.id)).toEqual([1, 2]);
    expect(dashboard?.follow_ups.upcoming).toBe(2);
    const timeline = client.getQueryData<InfiniteData<Timeline>>(["deals", 7, "timeline"]);
    expect(timeline?.pages.flatMap((page) => page.entries).map((entry) => entry.follow_up_done)).toEqual([
      false,
      false,
    ]);
  });

  it("read everything again once, after the last of them", async () => {
    mockApi({ "PATCH /activities/1": { id: 1 }, "PATCH /activities/2": { id: 2 } });
    const { client, wrapper } = setup();
    const refresh = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useTickFollowUp(), { wrapper });

    act(() => {
      result.current.mutate({ id: 1, done: true });
      result.current.mutate({ id: 2, done: true });
    });

    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("finish after the page has gone", async () => {
    const calls = mockApi({ "PATCH /activities/1": { id: 1 } });
    const { wrapper } = setup();
    const { result, unmount } = renderHook(() => useTickFollowUp(), { wrapper });

    act(() => result.current.mutate({ id: 1, done: true }));
    unmount();

    await waitFor(() => expect(calls.some((call) => call.method === "PATCH")).toBe(true));
  });
});

describe("what a failed tick says", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function failedTick(useTick: typeof useTickFollowUp) {
    const failure = vi.spyOn(toast, "error");
    mockApi({ "PATCH /activities/1": FAILED });
    const { wrapper } = setup();
    const { result } = renderHook(() => useTick(), { wrapper });
    act(() => result.current.mutate({ id: 1, done: true }));
    await waitFor(() => expect(failure).toHaveBeenCalledOnce());
    return failure.mock.calls[0][0];
  }

  it("says to check Accountable is running in the local copy", async () => {
    expect(await failedTick(useTickFollowUp)).toBe("Couldn't save that. Check that Accountable is still running.");
  });

  it("says to check the internet in the shared app", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SUPABASE_URL", "https://team.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    const shared = await import("./queries");
    expect(await failedTick(shared.useTickFollowUp)).toBe("Couldn't save that. Check your internet connection.");
  });
});

describe("the dashboard at the end of a day", () => {
  const BEFORE_MIDNIGHT = new Date(2026, 9, 31, 23, 59);
  const AFTER_MIDNIGHT = new Date(2026, 10, 1, 0, 1);

  afterEach(() => {
    vi.useRealTimers();
  });

  function reads(calls: Call[]) {
    return calls.filter((call) => call.path === "/dashboard").length;
  }

  function dayEnds() {
    vi.setSystemTime(AFTER_MIDNIGHT);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
  }

  it("reads its figures again, because they were worked out for the old day", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: BEFORE_MIDNIGHT });
    let serverDay = "2026-10-31";
    const calls = mockApi({ "GET /dashboard": () => ({ body: { today: serverDay } }) });
    const { wrapper } = setup();
    const { result } = renderHook(() => useDashboard(), { wrapper });
    await waitFor(() => expect(result.current.data?.today).toBe("2026-10-31"));

    serverDay = "2026-11-01";
    dayEnds();

    await waitFor(() => expect(result.current.data?.today).toBe("2026-11-01"));
    expect(reads(calls)).toBe(2);
  });

  it("asks once if the reply is still for the old day, rather than asking for ever", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: BEFORE_MIDNIGHT });
    const calls = mockApi({ "GET /dashboard": { today: "2026-10-31" } });
    const { wrapper } = setup();
    const { result } = renderHook(() => useDashboard(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    dayEnds();

    await waitFor(() => expect(reads(calls)).toBe(2));
    await act(() => new Promise((resolve) => setTimeout(resolve, 30)));
    expect(reads(calls)).toBe(2);
  });

  it("doesn't read them again during the day", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: BEFORE_MIDNIGHT });
    const calls = mockApi({ "GET /dashboard": { today: "2026-10-31" } });
    const { wrapper } = setup();
    const { result } = renderHook(() => useDashboard(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 30)));

    expect(reads(calls)).toBe(1);
  });
});
