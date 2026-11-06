import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import cases from "../../../shared/copilot-cases.json";
import { CONNECTION_MESSAGE, api } from "../lib/api";
import { queryDefaults } from "../lib/queryDefaults";
import { useConversation } from "./conversation";
import {
  MOST_MESSAGES,
  cardOf,
  type ChangeState,
  type ChatRequest,
  type CopilotStatus,
  type Entry,
  type Outcome,
} from "./queries";
import {
  EVENTS,
  NO_KEY_LOCAL,
  QUESTION,
  STATUS,
  answer,
  answered,
  change,
  error,
  heldStream,
  lines,
  mockCopilot,
  outcome,
  step,
  streamReply,
  type ChatAnswer,
  type HeldStream,
} from "./test-copilot";

const MOVE = "Move Harbor & Pine renewal to Won";
const CANCELLED = "Cancelled. Nothing was changed.";
const BUSY = "The model is busy right now. Wait a minute and try again.";
const MOVED = { words: EVENTS.outcome.words, link: EVENTS.outcome.link };

type Setup = { chats?: ChatAnswer[]; status?: CopilotStatus };

/** The conversation, beside a list of deals that stands for everything else on screen, once both have been read. */
async function setup({ chats = [], status = STATUS }: Setup = {}) {
  const { requests, calls } = mockCopilot({ status, chats, routes: { "GET /deals": [] } });
  const client = new QueryClient({ defaultOptions: queryDefaults });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () => {
      useQuery({ queryKey: ["deals"], queryFn: () => api("/deals") });
      return useConversation();
    },
    { wrapper },
  );
  const reads = (path: string) => calls.filter((call) => call.method === "GET" && call.path === path).length;
  await until(() => expect(reads("/deals")).toBe(1));
  await until(() => expect(view.result.current.status).toEqual(status));
  return { result: view.result, unmount: view.unmount, requests, reads, client };
}

type Result = Awaited<ReturnType<typeof setup>>["result"];

/** Waits for what the next step needs, checking often, since a stood-in stream answers in a moment. */
function until(check: () => void) {
  return waitFor(check, { interval: 1 });
}

/** The entries without their keys, which only React needs. */
function shown(entries: Entry[]) {
  return entries.map((entry) => Object.fromEntries(Object.entries(entry).filter(([name]) => name !== "key")));
}

/** The conversation's one change card, without its key. */
function cardIn(entries: Entry[]) {
  return shown(entries.filter((entry) => entry.kind === "change")).at(0);
}

/** A held stream with its request's signal, and released, which settles once the conversation lets go of it. */
type Held = HeldStream & { signal: AbortSignal | null; released: Promise<void> };

/** The reply's body passed on as it comes, saying when its reader lets go of it. */
function watched(reply: Response) {
  const source = reply.body!.getReader();
  let letGo: () => void = () => undefined;
  const released = new Promise<void>((resolve) => (letGo = resolve));
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await source.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      letGo();
      return source.cancel(reason);
    },
  });
  return { reply: new Response(body, { status: 200, headers: reply.headers }), released };
}

/** A chat reply held open for the test to send events down. held gives it once the request is made. */
function holdReply({ followsAbort = true } = {}) {
  let made: (held: Held) => void = () => undefined;
  const held = new Promise<Held>((resolve) => (made = resolve));
  const answer: ChatAnswer = (_request, signal) => {
    // A stream that doesn't follow the abort stands for lines already on their way when it came.
    const stream = heldStream(followsAbort ? signal : null);
    const { reply, released } = watched(stream.reply);
    made({ ...stream, reply, signal, released });
    return reply;
  };
  return { answer, held };
}

function question(text: string): ChatRequest {
  return { messages: [{ role: "user", text }], pending: null, decision: null };
}

const message = (text: string) => ({ kind: "message", text });
const problem = (words: string, canRetry: boolean) => ({ kind: "problem", words, canRetry });
/** The cases' card, in this state, saying this once it's answered. */
const card = (state: ChangeState, said: Outcome | null = null) => ({
  kind: "change",
  card: cardOf(EVENTS.change),
  pending: EVENTS.change.pending,
  state,
  outcome: said,
});
const stepShown = (changes: Record<string, unknown> = {}) => ({
  kind: "step",
  id: EVENTS.step.id,
  words: EVENTS.step.words,
  state: "running",
  link: null,
  ...changes,
});

describe("a question", () => {
  it("shows the person's message, then each step as it starts and finishes, then the answer", async () => {
    const reply = holdReply();
    const { result, requests } = await setup({ chats: [reply.answer] });

    act(() => result.current.send(QUESTION));
    expect(shown(result.current.entries)).toEqual([message(QUESTION)]);
    expect(result.current.working).toBe(true);
    const held = await reply.held;

    held.send(step());
    await until(() => expect(shown(result.current.entries)).toEqual([message(QUESTION), stepShown()]));
    held.send(step({ state: "done", words: "Read Harbor & Pine renewal", link: "/deals/12" }));
    await until(() =>
      expect(shown(result.current.entries)).toEqual([
        message(QUESTION),
        stepShown({ state: "done", words: "Read Harbor & Pine renewal", link: "/deals/12" }),
      ]),
    );
    held.send(answer());

    await until(() => expect(result.current.working).toBe(false));
    expect(shown(result.current.entries)).toEqual([
      message(QUESTION),
      stepShown({ state: "done", words: "Read Harbor & Pine renewal", link: "/deals/12" }),
      { kind: "answer", text: EVENTS.answer.text },
    ]);
    expect(requests).toEqual([question(QUESTION)]);
    const keys = result.current.entries.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("matches a step's second event to its first within its own reply only", async () => {
    const failed = { state: "failed" as const, words: "Deal not found" };
    const { result } = await setup({
      chats: [
        [step(), step({ state: "done" }), answer()],
        [step(), step(failed), answer()],
      ],
    });

    act(() => result.current.send("First"));
    await until(() => expect(result.current.working).toBe(false));
    act(() => result.current.send("Second"));
    await until(() => expect(result.current.working).toBe(false));

    expect(shown(result.current.entries).filter((entry) => entry.kind === "step")).toEqual([
      stepShown({ state: "done" }),
      stepShown(failed),
    ]);
  });

  it("passes over a line that isn't an event", async () => {
    const withAThought: ChatAnswer = () =>
      streamReply([
        lines([step()]),
        '{"type":"thought","text":"Hmm"}\n',
        "[]\n",
        lines([step({ state: "done" }), answer()]),
      ]);
    const { result } = await setup({ chats: [withAThought] });

    act(() => result.current.send(QUESTION));
    await until(() => expect(result.current.working).toBe(false));

    expect(shown(result.current.entries)).toEqual([
      message(QUESTION),
      stepShown({ state: "done" }),
      { kind: "answer", text: EVENTS.answer.text },
    ]);
  });

  it.each([
    ["a key", STATUS],
    ["no key", NO_KEY_LOCAL],
  ])("gives GET /api/copilot's status, with %s", async (_, status) => {
    const { result } = await setup({ status });
    expect(result.current.status).toEqual(status);
  });

  it("sends one message at a time, and nothing for a blank one", async () => {
    const reply = holdReply();
    const { result, requests } = await setup({ chats: [reply.answer] });

    act(() => result.current.send("  \n "));
    expect(result.current.entries).toEqual([]);
    act(() => result.current.send(QUESTION));
    act(() => result.current.send("Another question"));
    (await reply.held).send(answer());

    await until(() => expect(result.current.working).toBe(false));
    expect(requests).toEqual([question(QUESTION)]);
    expect(shown(result.current.entries).filter((entry) => entry.kind === "message")).toEqual([message(QUESTION)]);
  });
});

describe("what the Copilot remembers", () => {
  async function ask(result: Result, text: string) {
    act(() => result.current.send(text));
    await until(() => expect(result.current.working).toBe(false));
  }

  it("is the last 20 messages, the person's and the Copilot's answers, and nothing else", async () => {
    const exchanges = MOST_MESSAGES / 2 + 1;
    const chats = Array.from({ length: exchanges + 1 }, (_, index) => answered(`Answer ${index + 1}`));
    const { result, requests } = await setup({ chats });

    for (let number = 1; number <= exchanges + 1; number += 1) await ask(result, `Question ${number}`);

    const said = Array.from({ length: exchanges }, (_, index) => [
      { role: "user", text: `Question ${index + 1}` },
      { role: "assistant", text: `Answer ${index + 1}` },
    ]).flat();
    expect(requests[1].messages).toEqual([said[0], said[1], { role: "user", text: "Question 2" }]);
    expect(requests.at(-1)!.messages).toEqual(
      [...said, { role: "user", text: `Question ${exchanges + 1}` }].slice(-MOST_MESSAGES),
    );
    expect(requests.at(-1)!.messages).toHaveLength(MOST_MESSAGES);
  });

  it("keeps no more of a long answer than the backend takes back, while the panel shows it all", async () => {
    type Sent = { role: string; text?: string; text_length?: number };
    const answers = cases.requests.accepted
      .flatMap(({ body }) => body.messages as Sent[])
      .filter((sent) => sent.role === "assistant");
    const longest = Math.max(...answers.map((sent) => sent.text_length ?? sent.text?.length ?? 0));
    const long = "a".repeat(longest + 1);
    const { result, requests } = await setup({ chats: [[answer(long)], answered()] });

    await ask(result, "Tell me about every deal");
    await ask(result, "Thanks");

    expect(result.current.entries.at(1)).toMatchObject({ kind: "answer", text: long });
    expect(requests[1].messages[1]).toEqual({ role: "assistant", text: "a".repeat(longest) });
  });

  it("leaves out a blank answer, which the backend would refuse", async () => {
    const { result, requests } = await setup({ chats: [[answer(" ")], answered()] });

    await ask(result, "First");
    await ask(result, "Second");

    expect(requests[1].messages).toEqual([
      { role: "user", text: "First" },
      { role: "user", text: "Second" },
    ]);
  });
});

describe("a change card", () => {
  it("waits, then its button sends confirm with the card's pending, shows the outcome and reads everything again", async () => {
    const confirmed = holdReply();
    const { result, requests, reads } = await setup({
      chats: [[step(), step({ state: "done" }), change()], confirmed.answer, answered("Anything else?")],
    });

    act(() => result.current.send(MOVE));
    await until(() => expect(result.current.working).toBe(false));
    expect(cardIn(result.current.entries)).toEqual(card("waiting"));

    act(() => result.current.confirm());
    expect(cardIn(result.current.entries)).toEqual(card("running"));
    expect(result.current.working).toBe(true);
    const held = await confirmed.held;
    expect(requests[1]).toEqual({ ...question(MOVE), pending: EVENTS.change.pending, decision: "confirm" });
    expect(reads("/deals")).toBe(1);

    held.send(step({ id: "call_2", words: "Moving the deal to Won" }));
    held.send(step({ id: "call_2", words: EVENTS.outcome.words, state: "done", link: "/deals/12" }));
    held.send(outcome());
    await until(() => expect(reads("/deals")).toBe(2));
    expect(cardIn(result.current.entries)).toEqual(card("answered", MOVED));
    expect(result.current.working).toBe(true);

    held.send(answer("Done."));
    await until(() => expect(result.current.working).toBe(false));
    expect(shown(result.current.entries).at(-1)).toEqual({ kind: "answer", text: "Done." });

    // The answer says what the change did, so the outcome isn't sent as well.
    act(() => result.current.send("Thanks"));
    await until(() => expect(result.current.working).toBe(false));
    expect(requests[2].messages).toEqual([
      { role: "user", text: MOVE },
      { role: "assistant", text: "Done." },
      { role: "user", text: "Thanks" },
    ]);
  });

  it("sends cancel from Cancel, shows the backend's words, reads nothing again, and remembers it", async () => {
    const { result, requests, reads } = await setup({
      chats: [[change()], [outcome({ words: CANCELLED, link: null })], answered()],
    });
    act(() => result.current.send(MOVE));
    await until(() => expect(result.current.working).toBe(false));

    act(() => result.current.cancel());
    expect(cardIn(result.current.entries)).toEqual(card("running"));
    await until(() => expect(result.current.working).toBe(false));

    expect(cardIn(result.current.entries)).toEqual(card("answered", { words: CANCELLED, link: null }));
    expect(requests[1]).toEqual({ ...question(MOVE), pending: EVENTS.change.pending, decision: "cancel" });
    expect(reads("/deals")).toBe(1);

    act(() => result.current.send("What closes this month?"));
    await until(() => expect(result.current.working).toBe(false));
    expect(requests[2].messages).toEqual([
      { role: "user", text: MOVE },
      { role: "assistant", text: CANCELLED },
      { role: "user", text: "What closes this month?" },
    ]);
  });

  it("is cancelled by a new message, which sends no decision", async () => {
    const { result, requests } = await setup({ chats: [[change()], answered()] });
    act(() => result.current.send(MOVE));
    await until(() => expect(result.current.working).toBe(false));

    act(() => result.current.send(QUESTION));

    expect(shown(result.current.entries).slice(0, 3)).toEqual([
      message(MOVE),
      card("answered", { words: CANCELLED, link: null }),
      message(QUESTION),
    ]);
    await until(() => expect(result.current.working).toBe(false));
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual({
      messages: [
        { role: "user", text: MOVE },
        { role: "assistant", text: CANCELLED },
        { role: "user", text: QUESTION },
      ],
      pending: null,
      decision: null,
    });
  });

  it("does nothing when pressed with no card waiting", async () => {
    const { result, requests } = await setup({ chats: [answered()] });
    act(() => result.current.send(QUESTION));
    await until(() => expect(result.current.working).toBe(false));

    const before = result.current.entries;

    act(() => result.current.confirm());
    act(() => result.current.cancel());

    // A request would start working at once, before it's sent.
    expect(result.current.working).toBe(false);
    expect(result.current.entries).toBe(before);
    expect(requests).toHaveLength(1);
  });

  it("is done with once a confirm fails before its outcome, with no Try again, since the change may have run", async () => {
    const { result, reads } = await setup({ chats: [[change()], [error("busy", BUSY)]] });
    act(() => result.current.send(MOVE));
    await until(() => expect(result.current.working).toBe(false));

    act(() => result.current.confirm());
    await until(() => expect(result.current.working).toBe(false));

    expect(shown(result.current.entries).slice(1)).toEqual([card("answered"), problem(BUSY, false)]);
    await until(() => expect(reads("/deals")).toBe(2));
  });

  it("ends at the outcome when the backend refuses the change before running it, as it asks nothing more", async () => {
    const refused = { words: "search isn't a change. Nothing was changed.", link: null };
    const { result } = await setup({ chats: [[change()], [outcome(refused)]] });
    act(() => result.current.send(MOVE));
    await until(() => expect(result.current.working).toBe(false));

    act(() => result.current.confirm());
    await until(() => expect(result.current.working).toBe(false));

    expect(shown(result.current.entries).slice(1)).toEqual([card("answered", refused)]);
  });

  it("says something went wrong, with no Try again, when a change that ran stops before the answer", async () => {
    const moving = step({ id: "step-1", words: "Moving the deal to Won" });
    const moved = step({ id: "step-1", words: EVENTS.outcome.words, state: "done", link: "/deals/12" });
    const { result } = await setup({ chats: [[change()], [moving, moved, outcome()]] });
    act(() => result.current.send(MOVE));
    await until(() => expect(result.current.working).toBe(false));

    act(() => result.current.confirm());
    await until(() => expect(result.current.working).toBe(false));

    expect(shown(result.current.entries).slice(1)).toEqual([
      card("answered", MOVED),
      { kind: "step", id: "step-1", words: EVENTS.outcome.words, state: "done", link: "/deals/12" },
      problem("Something went wrong.", false),
    ]);
  });

  it("waits again when a cancel can't reach the backend, and Try again sends the cancel again", async () => {
    const lost: ChatAnswer = () => {
      throw new TypeError("Failed to fetch");
    };
    const { result, requests } = await setup({
      chats: [[change()], lost, [outcome({ words: CANCELLED, link: null })]],
    });
    act(() => result.current.send(MOVE));
    await until(() => expect(result.current.working).toBe(false));

    act(() => result.current.cancel());
    await until(() => expect(result.current.working).toBe(false));
    expect(shown(result.current.entries).slice(1)).toEqual([card("waiting"), problem(CONNECTION_MESSAGE, true)]);

    act(() => result.current.retry());
    await until(() => expect(result.current.working).toBe(false));
    expect(requests[2]).toEqual(requests[1]);
    expect(cardIn(result.current.entries)).toEqual(card("answered", { words: CANCELLED, link: null }));
  });
});

describe("Stop", () => {
  it("aborts the reply, ends the steps still running and reads everything again", async () => {
    const reply = holdReply();
    const { result, reads } = await setup({ chats: [reply.answer] });
    act(() => result.current.send(QUESTION));
    const held = await reply.held;
    held.send(step());
    await until(() => expect(result.current.entries).toHaveLength(2));

    act(() => result.current.stop());

    expect(result.current.working).toBe(false);
    expect(held.signal?.aborted).toBe(true);
    expect(shown(result.current.entries)).toEqual([message(QUESTION), stepShown({ state: "failed" })]);
    await until(() => expect(reads("/deals")).toBe(2));
  });

  it("leaves a confirmed change's card done with, and its late events land nowhere", async () => {
    const confirmed = holdReply({ followsAbort: false });
    const { result } = await setup({ chats: [[change()], confirmed.answer] });
    act(() => result.current.send(MOVE));
    await until(() => expect(result.current.working).toBe(false));
    act(() => result.current.confirm());
    const held = await confirmed.held;

    act(() => result.current.stop());
    expect(shown(result.current.entries)).toEqual([message(MOVE), card("answered")]);
    held.send(outcome());
    held.send(answer("Done."));

    await held.released;
    expect(shown(result.current.entries)).toEqual([message(MOVE), card("answered")]);
  });
});

describe("a problem", () => {
  it("offers Try again, which sends the same message again", async () => {
    const { result, requests } = await setup({ chats: [[error()], answered()] });
    act(() => result.current.send(QUESTION));
    await until(() => expect(result.current.working).toBe(false));
    expect(shown(result.current.entries)).toEqual([message(QUESTION), problem(EVENTS.error.words, true)]);

    act(() => result.current.retry());
    await until(() => expect(result.current.working).toBe(false));

    expect(requests).toEqual([question(QUESTION), question(QUESTION)]);
    expect(shown(result.current.entries)).toEqual([
      message(QUESTION),
      problem(EVENTS.error.words, false),
      stepShown({ state: "done", words: 'Searched for "harbor"' }),
      { kind: "answer", text: EVENTS.answer.text },
    ]);
  });

  it("offers no Try again for a missing key, and reads the status again", async () => {
    const words = NO_KEY_LOCAL.problem!.words;
    const { result, requests, reads } = await setup({ chats: [[error("no_key", words)]] });
    act(() => result.current.send(QUESTION));
    await until(() => expect(result.current.working).toBe(false));

    expect(shown(result.current.entries)).toEqual([message(QUESTION), problem(words, false)]);

    act(() => result.current.retry());

    // A request would start working at once, before it's sent.
    expect(result.current.working).toBe(false);
    expect(requests).toHaveLength(1);
    await until(() => expect(reads("/copilot")).toBe(2));
  });

  it("never offers a confirmed change again: no Try again once it's made, and the Copilot remembers it", async () => {
    const moving = step({ id: "step-1", words: "Moving the deal to Won" });
    const moved = step({ id: "step-1", words: EVENTS.outcome.words, state: "done", link: "/deals/12" });
    const { result, requests } = await setup({
      chats: [[change()], [moving, moved, outcome(), error()], answered()],
    });
    act(() => result.current.send(MOVE));
    await until(() => expect(result.current.working).toBe(false));
    act(() => result.current.confirm());
    await until(() => expect(result.current.working).toBe(false));
    expect(cardIn(result.current.entries)).toEqual(card("answered", MOVED));
    expect(shown(result.current.entries).at(-1)).toEqual(problem(EVENTS.error.words, false));

    act(() => result.current.retry());
    expect(result.current.working).toBe(false);
    expect(requests).toHaveLength(2);

    act(() => result.current.send("What else closes this month?"));
    await until(() => expect(result.current.working).toBe(false));
    expect(requests[2].messages).toEqual([
      { role: "user", text: MOVE },
      { role: "assistant", text: MOVED.words },
      { role: "user", text: "What else closes this month?" },
    ]);
  });

  it("remembers a made change's outcome only when no answer follows it, as the answer says what happened", async () => {
    const moving = step({ id: "step-1", words: "Moving the deal to Won" });
    const moved = step({ id: "step-1", words: EVENTS.outcome.words, state: "done", link: "/deals/12" });
    const { result, requests } = await setup({
      chats: [[change()], [moving, moved, outcome(), answer("Done.")], answered()],
    });
    act(() => result.current.send(MOVE));
    await until(() => expect(result.current.working).toBe(false));
    act(() => result.current.confirm());
    await until(() => expect(result.current.working).toBe(false));

    act(() => result.current.send(QUESTION));
    await until(() => expect(result.current.working).toBe(false));
    expect(requests[2].messages).toEqual([
      { role: "user", text: MOVE },
      { role: "assistant", text: "Done." },
      { role: "user", text: QUESTION },
    ]);
  });

  it("asks the question again after a confirmed change the backend refused, since nothing changed", async () => {
    const moving = step({ id: "step-1", words: "Moving the deal to Won" });
    const refused = step({ id: "step-1", words: "Deal not found", state: "failed" });
    const notFound = { words: "Deal not found", link: null };
    const { result, requests } = await setup({
      chats: [[change()], [moving, refused, outcome(notFound), error()], answered()],
    });
    act(() => result.current.send(MOVE));
    await until(() => expect(result.current.working).toBe(false));
    act(() => result.current.confirm());
    await until(() => expect(result.current.working).toBe(false));
    expect(shown(result.current.entries).at(-1)).toEqual(problem(EVENTS.error.words, true));

    act(() => result.current.retry());
    await until(() => expect(result.current.working).toBe(false));

    expect(requests[2]).toEqual(question(MOVE));
  });

  const noReply: ChatAnswer = () => Promise.reject(new TypeError("Failed to fetch"));
  const brokenOff: ChatAnswer = (_request, signal) => {
    const held = heldStream(signal);
    queueMicrotask(() => held.cut());
    return held.reply;
  };

  it.each([
    ["no reply comes", noReply],
    ["the reply breaks off", brokenOff],
  ])("says the connection was lost when %s, with Try again", async (_, lost) => {
    const { result } = await setup({ chats: [lost, answered()] });
    act(() => result.current.send(QUESTION));
    await until(() => expect(result.current.working).toBe(false));

    expect(shown(result.current.entries).at(-1)).toEqual(problem(CONNECTION_MESSAGE, true));

    act(() => result.current.retry());
    await until(() => expect(result.current.working).toBe(false));
    expect(shown(result.current.entries).at(-1)).toEqual({ kind: "answer", text: EVENTS.answer.text });
  });

  it("says something went wrong when the reply stops before its end, ending its steps", async () => {
    const { result } = await setup({ chats: [[step()]] });
    act(() => result.current.send(QUESTION));
    await until(() => expect(result.current.working).toBe(false));

    expect(shown(result.current.entries)).toEqual([
      message(QUESTION),
      stepShown({ state: "failed" }),
      problem("Something went wrong.", true),
    ]);
  });

  const refusal =
    (status: number, body: unknown): ChatAnswer =>
    () =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it.each([
    [
      "a message it refused, with the field's words",
      refusal(422, { detail: "Check the form.", fields: { "messages.0.text": "Use plain text here" } }),
      "Use plain text here",
    ],
    [
      "a session that has ended",
      refusal(401, { detail: "Sign in to use Accountable." }),
      "Sign in to use Accountable.",
    ],
  ])("offers no Try again for %s", async (_, refused, words) => {
    const { result } = await setup({ chats: [refused] });
    act(() => result.current.send("Harbor\u0000Pine"));
    await until(() => expect(result.current.working).toBe(false));

    expect(shown(result.current.entries).at(-1)).toEqual(problem(words, false));
  });

  it("forgets a message the backend refused, so the next one isn't refused for it", async () => {
    const plainTextOnly = refusal(422, {
      detail: "Check the form.",
      fields: { "messages.0.text": "Use plain text here" },
    });
    const { result, requests } = await setup({ chats: [answered(), plainTextOnly, answered()] });
    act(() => result.current.send("First"));
    await until(() => expect(result.current.working).toBe(false));
    act(() => result.current.send("Harbor\u0000Pine"));
    await until(() => expect(result.current.working).toBe(false));

    act(() => result.current.send(QUESTION));
    await until(() => expect(result.current.working).toBe(false));

    expect(requests[2].messages).toEqual([
      { role: "user", text: "First" },
      { role: "assistant", text: EVENTS.answer.text },
      { role: "user", text: QUESTION },
    ]);
  });
});

describe("New conversation", () => {
  it("stops the reply, empties the conversation and forgets what was said", async () => {
    const reply = holdReply();
    const { result, requests, reads } = await setup({ chats: [answered(), reply.answer, answered()] });
    act(() => result.current.send("First"));
    await until(() => expect(result.current.working).toBe(false));
    act(() => result.current.send("Second"));
    const held = await reply.held;

    act(() => result.current.clear());

    expect(result.current.entries).toEqual([]);
    expect(result.current.working).toBe(false);
    expect(held.signal?.aborted).toBe(true);
    await until(() => expect(reads("/deals")).toBe(2));

    act(() => result.current.send("Third"));
    await until(() => expect(result.current.working).toBe(false));
    expect(requests.at(-1)).toEqual(question("Third"));
  });
});

describe("leaving", () => {
  it("aborts the reply when the conversation goes, as at sign-out, and its late events land nowhere", async () => {
    const logged = vi.spyOn(console, "error");
    const confirmed = holdReply({ followsAbort: false });
    const { result, unmount, client } = await setup({ chats: [[change()], confirmed.answer] });
    act(() => result.current.send(MOVE));
    await until(() => expect(result.current.working).toBe(false));
    act(() => result.current.confirm());
    const held = await confirmed.held;
    const readAgain = vi.spyOn(client, "invalidateQueries");

    unmount();
    expect(held.signal?.aborted).toBe(true);
    held.send(outcome());
    held.send(answer("Done."));

    await held.released;
    // The outcome of a change landing would read everything again.
    expect(readAgain).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });
});
