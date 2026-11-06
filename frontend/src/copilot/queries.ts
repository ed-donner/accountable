import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";

// The Copilot's request and events, as backend/accountable/copilot/schemas.py has them, with an example
// of each in shared/copilot-cases.json. Its two halves meet here: conversation.ts makes a Conversation
// from the events, and the panel draws one, so neither imports the other.

/** POST /api/copilot/chat, through stream() in lib/api.ts. */
export const CHAT_PATH = "/copilot/chat";
/** The conversation's last 20 messages go with each request (Z7). */
export const MOST_MESSAGES = 20;
/** The longest message a person can send (Z4). */
export const LONGEST_QUESTION = 2000;

// The request

export type Role = "user" | "assistant";
/** One message of the conversation: the person's, or the Copilot's answer. */
export type Message = { role: Role; text: string };
export type Decision = "confirm" | "cancel";
/** The one change a card is waiting on, as the model asked for it. */
export type PendingCall = { id: string; tool: string; arguments: Record<string, unknown> };
/** A change card's turn so far, kept as the change event gave it and sent back with the person's answer. */
export type Pending = { turn: unknown[]; call: PendingCall };
/** The person's message last, unless it answers a change card, when decision and pending come together. */
export type ChatRequest = { messages: Message[]; pending: Pending | null; decision: Decision | null };

// The events, one JSON object a line

export type StepState = "running" | "done" | "failed";
/** Money, dates and percentages show in JetBrains Mono, the rest as text. */
export type FieldKind = "text" | "money" | "date" | "percent";
/** One field a change sets, in the backend's words, such as Stage from Proposal to Negotiation. now is null for a new record. */
export type CardField = { name: string; now: string | null; after: string; kind: FieldKind };
export type ProblemKind =
  | "no_key"
  | "key_refused"
  | "no_credits"
  | "minute_limit"
  | "day_limit"
  | "busy"
  | "no_tools"
  | "offline"
  | "too_slow"
  | "unreadable"
  | "too_many_steps";
/** What went wrong, in Z21's or Z20's words, which only the backend holds. */
export type Problem = { kind: ProblemKind; words: string };

/** A tool used (Z5). Sent running, then again with the same id, unique within its stream, once done or failed. */
export type StepEvent = { type: "step"; id: string; words: string; state: StepState; link: string | null };
/** A change card (Z13). Ends the stream. */
export type ChangeEvent = {
  type: "change";
  title: string;
  fields: CardField[];
  note: string | null;
  button: string;
  pending: Pending;
};
/** What a confirmed or cancelled change did, shown in place of the card's buttons. Ends the stream after a cancel. */
export type OutcomeEvent = { type: "outcome"; words: string; link: string | null };
/** The model's answer. Ends the stream. */
export type AnswerEvent = { type: "answer"; text: string };
/** A problem in place of the answer. Ends the stream. */
export type ErrorEvent = { type: "error" } & Problem;
export type CopilotEvent = StepEvent | ChangeEvent | OutcomeEvent | AnswerEvent | ErrorEvent;

const STEP_STATES: readonly unknown[] = ["running", "done", "failed"] satisfies StepState[];
const FIELD_KINDS: readonly unknown[] = ["text", "money", "date", "percent"] satisfies FieldKind[];
const PROBLEM_KINDS: readonly unknown[] = [
  "no_key",
  "key_refused",
  "no_credits",
  "minute_limit",
  "day_limit",
  "busy",
  "no_tools",
  "offline",
  "too_slow",
  "unreadable",
  "too_many_steps",
] satisfies ProblemKind[];

type Fields = Record<string, unknown>;

const isFields = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown) => typeof value === "string";
const isTextOrNull = (value: unknown) => value === null || isText(value);

const isCardField = (value: unknown) =>
  isFields(value) &&
  isText(value.name) &&
  isTextOrNull(value.now) &&
  isText(value.after) &&
  FIELD_KINDS.includes(value.kind);

const isPending = (value: unknown) =>
  isFields(value) &&
  Array.isArray(value.turn) &&
  isFields(value.call) &&
  isText(value.call.id) &&
  isText(value.call.tool) &&
  isFields(value.call.arguments);

const IS_EVENT: Record<CopilotEvent["type"], (event: Fields) => boolean> = {
  step: (event) =>
    isText(event.id) && isText(event.words) && STEP_STATES.includes(event.state) && isTextOrNull(event.link),
  change: (event) =>
    isText(event.title) &&
    Array.isArray(event.fields) &&
    event.fields.every(isCardField) &&
    isTextOrNull(event.note) &&
    isText(event.button) &&
    isPending(event.pending),
  outcome: (event) => isText(event.words) && isTextOrNull(event.link),
  answer: (event) => isText(event.text),
  error: (event) => PROBLEM_KINDS.includes(event.kind) && isText(event.words),
};

/** One line of the stream, once parsed, as an event, or null for anything that isn't one. */
export function readEvent(value: unknown): CopilotEvent | null {
  if (!isFields(value) || !isText(value.type) || !Object.hasOwn(IS_EVENT, value.type)) return null;
  return IS_EVENT[value.type as CopilotEvent["type"]](value) ? (value as CopilotEvent) : null;
}

// GET /api/copilot

/** The model the backend asks, and the no_key problem when it has no key (Z3, Z21). Never the key. */
export type CopilotStatus = { model: string; problem: Problem | null };

export function useCopilotStatus() {
  return useQuery({ queryKey: ["copilot"], queryFn: () => api<CopilotStatus>("/copilot") });
}

// The conversation, as the panel draws it

/** A change card's words, without its pending, which the panel never needs. */
export type Card = Pick<ChangeEvent, "title" | "fields" | "note" | "button">;
/** Waiting for the person, running once its button is pressed, and answered once its outcome has come. */
export type ChangeState = "waiting" | "running" | "answered";
export type Outcome = Pick<OutcomeEvent, "words" | "link">;

/** One thing in the conversation. key is unique within the conversation, for React. */
export type MessageEntry = { kind: "message"; key: string; text: string };
/** id is the step event's own, so its second event finds it. */
export type StepEntry = { kind: "step"; key: string; id: string; words: string; state: StepState; link: string | null };
export type AnswerEntry = { kind: "answer"; key: string; text: string };
/** outcome is null until the change has been made or cancelled. */
export type ChangeEntry = {
  kind: "change";
  key: string;
  card: Card;
  pending: Pending;
  state: ChangeState;
  outcome: Outcome | null;
};
/** canRetry is false for no_key, where Try again can't help. */
export type ProblemEntry = { kind: "problem"; key: string; words: string; canRetry: boolean };
export type Entry = MessageEntry | StepEntry | AnswerEntry | ChangeEntry | ProblemEntry;

/**
 * What the panel is given. conversation.ts makes it with useConversation(), and the panel draws it,
 * so the two never import each other.
 */
export type Conversation = {
  entries: Entry[];
  /** True from sending until the stream ends, while Send is Stop. */
  working: boolean;
  /** GET /api/copilot's reply, or undefined until it has come. */
  status: CopilotStatus | undefined;
  /** Sends the person's message, cancelling a card left waiting (Z16). */
  send: (text: string) => void;
  /** Stops the stream, then reads everything again (Z4). */
  stop: () => void;
  /** Presses the waiting card's own button. */
  confirm: () => void;
  /** Presses the waiting card's Cancel. */
  cancel: () => void;
  /** Sends the message before the last problem again. */
  retry: () => void;
  /** New conversation: stops anything still running and empties it (Z2). */
  clear: () => void;
};

export function cardOf({ title, fields, note, button }: ChangeEvent): Card {
  return { title, fields, note, button };
}
