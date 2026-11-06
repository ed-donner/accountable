// What the Copilot's tests share, made from shared/copilot-cases.json: the events the backend sends,
// streams that stand in for POST /api/copilot/chat, for the conversation's tests, and entries and
// Conversations, for the panel's.
import { vi } from "vitest";

import cases from "../../../shared/copilot-cases.json";
import { mockApi, type Call } from "../test-utils";
import type {
  AnswerEvent,
  AnswerEntry,
  ChangeEntry,
  ChangeEvent,
  ChatRequest,
  Conversation,
  CopilotEvent,
  CopilotStatus,
  Entry,
  ErrorEvent,
  MessageEntry,
  OutcomeEvent,
  ProblemEntry,
  ProblemKind,
  StepEntry,
  StepEvent,
} from "./queries";
import { cardOf } from "./queries";

// The events

/** One event of each type, as the backend sends it. */
export const EVENTS = {
  step: cases.events.step as StepEvent,
  change: cases.events.change as ChangeEvent,
  outcome: cases.events.outcome as OutcomeEvent,
  answer: cases.events.answer as AnswerEvent,
  error: cases.events.error as ErrorEvent,
};

/** GET /api/copilot with a key, and without one in each copy, with Z21's words. */
export const STATUS = cases.status["with a key"] as CopilotStatus;
export const NO_KEY_LOCAL = cases.status["without a key, in the local copy"] as CopilotStatus;
export const NO_KEY_SHARED = cases.status["without a key, in the shared app"] as CopilotStatus;

export const QUESTION = "Which deals close this month?";

export function step(changes: Partial<StepEvent> = {}): StepEvent {
  return { ...EVENTS.step, ...changes };
}

export function change(changes: Partial<ChangeEvent> = {}): ChangeEvent {
  return { ...EVENTS.change, ...changes };
}

export function outcome(changes: Partial<OutcomeEvent> = {}): OutcomeEvent {
  return { ...EVENTS.outcome, ...changes };
}

export function answer(text = EVENTS.answer.text): AnswerEvent {
  return { type: "answer", text };
}

/** The minute's limit, or another kind with words of the test's own. */
export function error(kind: ProblemKind = EVENTS.error.kind, words = EVENTS.error.words): ErrorEvent {
  return { type: "error", kind, words };
}

/** A question answered with a step, then the answer: what a look-up sends. */
export function answered(text = EVENTS.answer.text): CopilotEvent[] {
  return [step(), step({ state: "done", words: 'Searched for "harbor"' }), answer(text)];
}

// Stood-in streams, for conversation.ts and lib/api.ts

/** The events as the stream sends them: each one a JSON line. */
export function lines(events: CopilotEvent[]): string {
  return events.map((event) => `${JSON.stringify(event)}\n`).join("");
}

/** A 200 whose body arrives in these pieces, so a line can be split across them or several share one. */
export function streamReply(pieces: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      pieces.forEach((piece) => controller.enqueue(encoder.encode(piece)));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" } });
}

/** The events as one stream, a line a piece, or in pieces of this many characters, which split lines anywhere. */
export function streamOf(events: CopilotEvent[], pieceLength?: number): Response {
  const text = lines(events);
  if (pieceLength === undefined) return streamReply(text.split(/(?<=\n)/));
  const pieces = Array.from({ length: Math.ceil(text.length / pieceLength) }, (_, index) =>
    text.slice(index * pieceLength, (index + 1) * pieceLength),
  );
  return streamReply(pieces);
}

/** A stream the test sends events down one at a time, as the backend does while a turn runs. */
export type HeldStream = {
  reply: Response;
  /** Sends one event as a line. */
  send: (event: CopilotEvent) => void;
  /** Ends the stream, as the backend does after an answer, a card or an error. */
  end: () => void;
  /** Breaks the stream off, as a lost connection does. */
  cut: () => void;
};

/** Aborting the request breaks the stream off with an AbortError, as the browser's fetch does. */
export function heldStream(signal?: AbortSignal | null): HeldStream {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let open = true;
  const body = new ReadableStream<Uint8Array>({
    start(given) {
      controller = given;
    },
  });
  const close = (done: () => void) => {
    if (!open) return;
    open = false;
    done();
  };
  signal?.addEventListener("abort", () => close(() => controller.error(abortError())));
  return {
    reply: new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" } }),
    send: (event) => {
      if (open) controller.enqueue(encoder.encode(lines([event])));
    },
    end: () => close(() => controller.close()),
    cut: () => close(() => controller.error(new TypeError("network error"))),
  };
}

function noAnswer() {
  return new Response(JSON.stringify({ detail: "No chat answer in the test" }), {
    status: 500,
    headers: { "content-type": "application/json" },
  });
}

function abortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

/** What a chat request gets: these events as one stream, or a reply of the test's own, such as a held stream's. */
export type ChatAnswer =
  CopilotEvent[] | ((request: ChatRequest, signal: AbortSignal | null) => Response | Promise<Response>);

/**
 * Stands in for the backend: GET /api/copilot with this status, each POST /api/copilot/chat with
 * the next answer, and any other route as mockApi does. A chat request with no answer left gets a 500.
 * requests holds each chat request's body, and calls every call, as mockApi's does.
 */
export function mockCopilot({
  status = STATUS,
  chats = [],
  routes = {},
}: {
  status?: CopilotStatus;
  chats?: ChatAnswer[];
  routes?: Record<string, unknown>;
} = {}): { requests: ChatRequest[]; calls: Call[] } {
  const calls = mockApi({ "GET /copilot": status, ...routes });
  const otherwise = globalThis.fetch;
  const requests: ChatRequest[] = [];
  const waiting = [...chats];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    if (url !== "/api/copilot/chat" || init.method !== "POST") return otherwise(url, init);
    const request = JSON.parse(String(init.body)) as ChatRequest;
    requests.push(request);
    calls.push({ method: "POST", path: "/copilot/chat", body: request });
    if (init.signal?.aborted) throw abortError();
    const next = waiting.shift();
    if (next === undefined) return noAnswer();
    return Array.isArray(next) ? streamOf(next) : next(request, init.signal ?? null);
  });
  return { requests, calls };
}

// Entries and Conversations, for the panel

let made = 0;
const key = () => `entry-${(made += 1)}`;

export function messageEntry(text = QUESTION): MessageEntry {
  return { kind: "message", key: key(), text };
}

export function stepEntry(changes: Partial<StepEntry> = {}): StepEntry {
  const { id, words, state, link } = EVENTS.step;
  return { kind: "step", key: key(), id, words, state, link, ...changes };
}

export function answerEntry(text = EVENTS.answer.text): AnswerEntry {
  return { kind: "answer", key: key(), text };
}

/** The cases' card, moving a deal to Won, waiting for the person. */
export function changeEntry(changes: Partial<ChangeEntry> = {}): ChangeEntry {
  const { pending } = EVENTS.change;
  return {
    kind: "change",
    key: key(),
    card: cardOf(EVENTS.change),
    pending,
    state: "waiting",
    outcome: null,
    ...changes,
  };
}

/** The cases' minute's limit, with Try again. */
export function problemEntry(changes: Partial<ProblemEntry> = {}): ProblemEntry {
  return { kind: "problem", key: key(), words: EVENTS.error.words, canRetry: true, ...changes };
}

/** A whole exchange: the question, a step done, a card answered with its outcome, and the answer. */
export function sampleEntries(): Entry[] {
  return [
    messageEntry("Move Harbor & Pine renewal to Won"),
    stepEntry({ state: "done", words: 'Searched for "harbor"' }),
    changeEntry({ state: "answered", outcome: { words: EVENTS.outcome.words, link: EVENTS.outcome.link } }),
    answerEntry(),
  ];
}

/** A Conversation with nothing in it yet, a key, and each action a mock, with these changes. */
export function conversation(changes: Partial<Conversation> = {}): Conversation {
  return {
    entries: [],
    working: false,
    status: STATUS,
    send: vi.fn(),
    stop: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
    retry: vi.fn(),
    clear: vi.fn(),
    ...changes,
  };
}
