import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";

import { ApiError, stream } from "../lib/api";
import {
  CHAT_PATH,
  MOST_MESSAGES,
  cardOf,
  readEvent,
  useCopilotStatus,
  type ChangeEntry,
  type ChangeState,
  type ChatRequest,
  type Conversation,
  type CopilotEvent,
  type Entry,
  type Message,
  type Outcome,
  type StepEvent,
} from "./queries";

// The conversation the panel draws (Z2 to Z7, Z13 to Z16). It lives as long as the component that
// holds it, which is made again for each session, so sign-out drops it, and anything it was still
// doing (U5). What the Copilot remembers is kept apart from what the panel shows: the person's
// messages and the reply that ended each turn, never the steps, cards or problems.

/** The longest answer the backend takes back as one of the Copilot's messages. */
const LONGEST_ANSWER = 10_000;

/** What a card says when a new message cancels it, as the backend's Cancel says it (Z16). */
const CANCELLED: Outcome = { words: "Cancelled. Nothing was changed.", link: null };

/** A reply that stops before its end, or fails in a way api() has no words for, says what any failed save says. */
const SOMETHING_WENT_WRONG = "Something went wrong.";

type Shown = { entries: Entry[]; working: boolean };

/** One request on its way: the card it answers, if any, and its steps' entries by their ids. */
type Run = {
  request: ChatRequest;
  card: string | null;
  controller: AbortController;
  steps: Map<string, string>;
  outcome: boolean;
  finished: boolean;
};

/** What Try again sends, and the card it answers, if any. */
type Retry = { request: ChatRequest; card: string | null };

type Actions = Pick<Conversation, "send" | "stop" | "confirm" | "cancel" | "retry" | "clear">;

/** The conversation for the panel, with GET /api/copilot's status. */
export function useConversation(): Conversation {
  const client = useQueryClient();
  const status = useCopilotStatus().data;
  const [conversation] = useState(() => startConversation(client));
  const { entries, working } = useSyncExternalStore(conversation.subscribe, conversation.shown);
  // Sign-out takes the component away, and with it the stream, whose late events land nowhere.
  useEffect(() => conversation.abort, [conversation]);
  return { entries, working, status, ...conversation.actions };
}

function startConversation(client: QueryClient) {
  let shown: Shown = { entries: [], working: false };
  let remembered: Message[] = [];
  let current: Run | null = null;
  let retryable: Retry | null = null;
  let made = 0;
  const listeners = new Set<() => void>();

  const nextKey = () => `entry-${(made += 1)}`;
  const show = (changes: Partial<Shown>) => {
    shown = { ...shown, ...changes };
    listeners.forEach((listener) => listener());
  };
  const change = (update: (entries: Entry[]) => Entry[]) => show({ entries: update(shown.entries) });
  const add = (entry: Entry) => change((entries) => [...entries, entry]);
  // The backend refuses a blank message, so one would stop every request after it.
  const remember = (role: Message["role"], text: string) => {
    if (text.trim() !== "") remembered = [...remembered, { role, text }];
  };
  const readEverythingAgain = () => void client.invalidateQueries();

  function settleCard(key: string, state: ChangeState, outcome: Outcome | null) {
    change((entries) =>
      entries.map((entry) => (entry.kind === "change" && entry.key === key ? { ...entry, state, outcome } : entry)),
    );
  }

  function waitingCard(): ChangeEntry | undefined {
    return shown.entries.findLast(
      (entry): entry is ChangeEntry => entry.kind === "change" && entry.state === "waiting",
    );
  }

  function showStep(run: Run, { id, words, state, link }: StepEvent) {
    const key = run.steps.get(id);
    if (key === undefined) {
      const entry = { kind: "step" as const, key: nextKey(), id, words, state, link };
      run.steps.set(id, entry.key);
      add(entry);
    } else {
      change((entries) =>
        entries.map((entry) => (entry.kind === "step" && entry.key === key ? { ...entry, words, state, link } : entry)),
      );
    }
  }

  function showOutcome(run: Run, outcome: Outcome) {
    if (run.card === null) return;
    run.outcome = true;
    settleCard(run.card, "answered", { words: outcome.words, link: outcome.link });
    if (run.request.decision === "cancel") remember("assistant", outcome.words);
    else readEverythingAgain();
  }

  function showProblem(run: Run, words: string, canRetry: boolean) {
    add({ kind: "problem", key: nextKey(), words, canRetry });
    if (canRetry) retryable = retryOf(run);
  }

  function apply(run: Run, event: CopilotEvent) {
    switch (event.type) {
      case "step":
        return showStep(run, event);
      case "change":
        return add({
          kind: "change",
          key: nextKey(),
          card: cardOf(event),
          pending: event.pending,
          state: "waiting",
          outcome: null,
        });
      case "outcome":
        return showOutcome(run, event);
      case "answer":
        remember("assistant", answerToRemember(event.text));
        return add({ kind: "answer", key: nextKey(), text: event.text });
      case "error":
        // The backend has lost its key since the panel opened, so Send goes off once the status is read again.
        if (event.kind === "no_key") void client.invalidateQueries({ queryKey: ["copilot"] });
        return showProblem(run, event.words, event.kind !== "no_key");
    }
  }

  /** Reads the reply, and says whether it came to its end: an answer, a card, an error or a cancel's outcome. */
  async function read(run: Run): Promise<boolean> {
    const { signal } = run.controller;
    for await (const value of stream(CHAT_PATH, { method: "POST", body: run.request, signal })) {
      signal.throwIfAborted();
      const event = readEvent(value);
      if (event === null) continue;
      apply(run, event);
      if (endsTheReply(event, run)) return true;
    }
    return false;
  }

  /** Steps, the card and working, once a request has ended, however it ended. Only the first call counts. */
  function finish(run: Run) {
    if (run.finished) return;
    run.finished = true;
    // A step still running when its reply stopped won't finish now.
    const stepKeys = new Set(run.steps.values());
    change((entries) =>
      entries.map((entry) =>
        entry.kind === "step" && entry.state === "running" && stepKeys.has(entry.key)
          ? { ...entry, state: "failed" }
          : entry,
      ),
    );
    if (run.card !== null && !run.outcome) settleUnanswered(run, run.card);
    if (current === run) {
      current = null;
      show({ working: false });
    }
  }

  /**
   * A cancel that never came back changed nothing, so the card waits again. A confirm may have run,
   * so its card is done with, and everything is read again to show whether it did. Stop and New
   * conversation read everything again themselves, and a component that's gone has nothing to show.
   */
  function settleUnanswered(run: Run, card: string) {
    if (run.request.decision === "cancel") {
      settleCard(card, "waiting", null);
      return;
    }
    settleCard(card, "answered", null);
    if (!run.controller.signal.aborted) readEverythingAgain();
  }

  async function begin(request: ChatRequest, card: string | null = null) {
    const run: Run = {
      request,
      card,
      controller: new AbortController(),
      steps: new Map(),
      outcome: false,
      finished: false,
    };
    current = run;
    retryable = null;
    // Only the latest problem offers Try again.
    change((entries) => entries.map((entry) => (entry.kind === "problem" ? { ...entry, canRetry: false } : entry)));
    show({ working: true });
    try {
      const ended = await read(run);
      run.controller.signal.throwIfAborted();
      if (!ended) showProblem(run, SOMETHING_WENT_WRONG, true);
    } catch (error) {
      // Stopped, cleared or gone: nothing to say, and nothing logged (Q2).
      if (run.controller.signal.aborted) return;
      showProblem(run, problemWords(error), canRetryAfter(error));
    } finally {
      finish(run);
    }
  }

  /** Breaks off the request on its way, if there is one. */
  function breakOff(): Run | null {
    const run = current;
    if (run === null) return null;
    run.controller.abort();
    finish(run);
    return run;
  }

  function answerCard(decision: "confirm" | "cancel") {
    const card = waitingCard();
    if (current !== null || card === undefined) return;
    settleCard(card.key, "running", null);
    void begin({ messages: lastMessages(remembered), pending: card.pending, decision }, card.key);
  }

  const actions: Actions = {
    send(text) {
      if (current !== null || text.trim() === "") return;
      const waiting = waitingCard();
      if (waiting !== undefined) {
        settleCard(waiting.key, "answered", CANCELLED);
        remember("assistant", CANCELLED.words);
      }
      add({ kind: "message", key: nextKey(), text });
      remember("user", text);
      void begin({ messages: lastMessages(remembered), pending: null, decision: null });
    },
    // A change already sent still finishes, so everything is read again to show whether it did (Z4).
    stop() {
      if (breakOff() !== null) readEverythingAgain();
    },
    confirm: () => answerCard("confirm"),
    cancel: () => answerCard("cancel"),
    retry() {
      if (current !== null || retryable === null) return;
      const { request, card } = retryable;
      if (card !== null) settleCard(card, "running", null);
      void begin(request, card);
    },
    clear() {
      if (breakOff() !== null) readEverythingAgain();
      remembered = [];
      retryable = null;
      show({ entries: [], working: false });
    },
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    shown: () => shown,
    abort: () => void breakOff(),
    actions,
  };
}

function lastMessages(messages: Message[]): Message[] {
  return messages.slice(-MOST_MESSAGES);
}

/**
 * A confirm's outcome ends the reply only when no step came before it: the backend refused the change
 * before running it, and asks the model nothing more (Z15). A change that ran goes on to the answer.
 */
function endsTheReply(event: CopilotEvent, run: Run): boolean {
  if (event.type === "outcome") return run.request.decision === "cancel" || run.steps.size === 0;
  return event.type !== "step";
}

/** A confirm is never sent twice, since its change may have run, so Try again asks the question again. */
function retryOf(run: Run): Retry {
  if (run.request.decision === "confirm")
    return { request: { ...run.request, pending: null, decision: null }, card: null };
  return { request: run.request, card: run.card };
}

/** The backend takes back at most 10,000 characters of an answer, counted as Python counts them. */
function answerToRemember(text: string): string {
  return text.length > LONGEST_ANSWER ? [...text].slice(0, LONGEST_ANSWER).join("") : text;
}

function problemWords(error: unknown): string {
  if (!(error instanceof ApiError)) return SOMETHING_WENT_WRONG;
  return Object.values(error.fields)[0] ?? error.message;
}

/** Try again can't help a request the backend refused as it was, or a session that has ended. */
function canRetryAfter(error: unknown): boolean {
  return !(error instanceof ApiError && (error.kind === "fields" || error.kind === "signed-out"));
}
