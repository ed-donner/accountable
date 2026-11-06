import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import cases from "../../../shared/copilot-cases.json";
import { queryDefaults } from "../lib/queryDefaults";
import { LONGEST_QUESTION, MOST_MESSAGES, cardOf, readEvent, useCopilotStatus, type CopilotEvent } from "./queries";
import {
  EVENTS,
  NO_KEY_LOCAL,
  NO_KEY_SHARED,
  STATUS,
  answered,
  heldStream,
  lines,
  mockCopilot,
  streamOf,
} from "./test-copilot";

describe("the events", () => {
  it.each(Object.entries(cases.events))("read the backend's %s event as it was sent", (type, sent) => {
    const read = readEvent(sent);
    expect(read).toEqual(sent);
    expect(read?.type).toBe(type);
  });

  it.each([
    ["nothing", null],
    ["a list", [EVENTS.answer]],
    ["text", "answer"],
    ["an event of no known type", { type: "thought", text: "Hmm" }],
    ["a step with no id", { ...EVENTS.step, id: undefined }],
    ["a step in no known state", { ...EVENTS.step, state: "waiting" }],
    ["a step whose link is missing", { type: "step", id: "call_1", words: "Searching", state: "running" }],
    [
      "a card with a field of no known kind",
      { ...EVENTS.change, fields: [{ ...EVENTS.change.fields[0], kind: "html" }] },
    ],
    ["a card with no pending", { ...EVENTS.change, pending: null }],
    ["a card whose call has no arguments", { ...EVENTS.change, pending: { turn: [], call: { id: "c", tool: "t" } } }],
    ["an outcome with no words", { type: "outcome", link: null }],
    ["an answer that isn't text", { type: "answer", text: 12 }],
    ["an error of no known kind", { type: "error", kind: "teapot", words: "Short and stout" }],
  ])("read %s as no event", (_, value) => {
    expect(readEvent(value)).toBeNull();
  });

  it("give a card's words without its pending", () => {
    expect(cardOf(EVENTS.change)).toEqual({
      title: "Move Harbor & Pine renewal to Won?",
      fields: [
        { name: "Stage", now: "Negotiation", after: "Won", kind: "text" },
        { name: "Probability", now: "70%", after: "100%", kind: "percent" },
      ],
      note: "The close date becomes today, and Sam Carter becomes a customer.",
      button: "Move deal",
    });
  });
});

describe("the request's limits", () => {
  type Body = { messages?: { role: string; text?: unknown; text_length?: number }[] };
  const bodies = (list: { body: unknown }[]) => list.map(({ body }) => body as Body);
  const accepted = bodies(cases.requests.accepted);
  const refused = bodies(cases.requests.refused);
  const questionLengths = (list: Body[]) =>
    list
      .flatMap((body) => body.messages ?? [])
      .filter((message) => message.role === "user")
      .map((message) => message.text_length ?? (typeof message.text === "string" ? message.text.length : 0));

  it("send at most the 20 messages the backend takes", () => {
    expect(MOST_MESSAGES).toBe(Math.max(...accepted.map((body) => body.messages?.length ?? 0)));
    expect(refused.some((body) => body.messages?.length === MOST_MESSAGES + 1)).toBe(true);
  });

  it("let a person write the 2,000 characters the backend takes", () => {
    expect(LONGEST_QUESTION).toBe(Math.max(...questionLengths(accepted)));
    expect(questionLengths(refused)).toContain(LONGEST_QUESTION + 1);
  });
});

describe("the stood-in streams", () => {
  async function received(reply: Response): Promise<CopilotEvent[]> {
    const text = await reply.text();
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => readEvent(JSON.parse(line))!);
  }

  it.each([undefined, 1, 7, 1000])("carry the events however they're cut, here in pieces of %s", async (length) => {
    const events = Object.values(EVENTS);
    expect(await received(streamOf(events, length))).toEqual(events);
  });

  it("send a held stream's events as the test sends them, and break off when aborted", async () => {
    const aborting = new AbortController();
    const held = heldStream(aborting.signal);
    const reader = held.reply.body!.getReader();
    held.send(EVENTS.step);
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(lines([EVENTS.step]));
    aborting.abort();
    await expect(reader.read()).rejects.toThrow(expect.objectContaining({ name: "AbortError" }));
  });

  it("answer each chat request in turn, keeping its body", async () => {
    const { requests } = mockCopilot({ chats: [answered()] });
    const request = { messages: [{ role: "user", text: "Hello" }], pending: null, decision: null };
    const reply = await globalThis.fetch("/api/copilot/chat", { method: "POST", body: JSON.stringify(request) });
    expect(await received(reply)).toEqual(answered());
    expect(requests).toEqual([request]);
  });
});

describe("useCopilotStatus", () => {
  function readStatus() {
    const client = new QueryClient({ defaultOptions: queryDefaults });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    return renderHook(() => useCopilotStatus(), { wrapper }).result;
  }

  it.each([
    ["a key", STATUS],
    ["no key in the local copy", NO_KEY_LOCAL],
    ["no key in the shared app", NO_KEY_SHARED],
  ])("reads the model and the problem with %s", async (_, status) => {
    mockCopilot({ status });
    const result = readStatus();
    await waitFor(() => expect(result.current.data).toEqual(status));
  });
});
