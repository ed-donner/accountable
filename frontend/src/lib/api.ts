import { useSyncExternalStore } from "react";

import { SESSION_ENDED, currentSession, currentToken, endSession, isSharedApp } from "./session";

export type ApiErrorKind = "fields" | "missing" | "connection" | "server" | "signed-out";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly fields: Record<string, string>;

  constructor(kind: ApiErrorKind, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.fields = fields;
  }
}

/** The shared app is reached over the internet, and the local copy runs on this computer (N5). */
export const CONNECTION_MESSAGE = isSharedApp
  ? "Can't reach Accountable. Check your internet connection."
  : "Can't reach Accountable. Check that it's still running.";

let connectionLost = false;
const listeners = new Set<() => void>();
const reconnectListeners = new Set<() => void>();

function setConnectionLost(lost: boolean) {
  if (lost === connectionLost) return;
  connectionLost = lost;
  listeners.forEach((listener) => listener());
  if (!lost) reconnectListeners.forEach((listener) => listener());
}

/** Runs each time the connection comes back, whichever reply showed it. */
export function onReconnect(listener: () => void) {
  reconnectListeners.add(listener);
  return () => {
    reconnectListeners.delete(listener);
  };
}

export function isConnectionLost() {
  return connectionLost;
}

export function useConnectionLost() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => connectionLost,
  );
}

type Options = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

/** What the backend says about an error, as far as the reply can be read. */
type ErrorReply = { detail?: string; fields?: Record<string, string> };

function loseConnection(): never {
  setConnectionLost(true);
  throw new ApiError("connection", CONNECTION_MESSAGE);
}

function headersFor(token: string | null, body: unknown): Record<string, string> {
  return {
    ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
    ...(body === undefined ? {} : { "Content-Type": "application/json" }),
  };
}

async function send(path: string, { method = "GET", body, signal }: Options): Promise<Response> {
  const token = await currentToken();
  try {
    return await fetch(`/api${path}`, {
      method,
      signal,
      headers: headersFor(token, body),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    loseConnection();
  }
}

// The backend answers every error in JSON. A non-JSON 5xx comes from the dev
// server, which is still up but can't reach the backend behind it.
function isFromDevServer(reply: Response) {
  const isJson = reply.headers.get("content-type")?.includes("application/json") ?? false;
  return reply.status >= 500 && !isJson;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function fieldMessages(value: unknown): Record<string, string> | undefined {
  if (!isObject(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

async function readErrorReply(reply: Response): Promise<ErrorReply> {
  const data: unknown = await reply.json().catch(() => null);
  if (!isObject(data)) return {};
  return { detail: typeof data.detail === "string" ? data.detail : undefined, fields: fieldMessages(data.fields) };
}

function errorFor(status: number, { detail, fields }: ErrorReply) {
  if (status === 401) return new ApiError("signed-out", detail ?? SESSION_ENDED);
  if (status === 404) return new ApiError("missing", detail ?? "That record no longer exists.");
  if (status === 422) return new ApiError("fields", detail ?? "Check the form.", fields ?? {});
  return new ApiError("server", detail ?? "Something went wrong.");
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const sentIn = currentSession();
  const reply = await send(path, options);
  if (isFromDevServer(reply)) loseConnection();
  setConnectionLost(false);
  // Someone may have signed out and in again while the request was on its way (U6).
  if (reply.status === 401 && currentSession() === sentIn) endSession(SESSION_ENDED);
  if (!reply.ok) throw errorFor(reply.status, await readErrorReply(reply));
  return (reply.status === 204 ? undefined : await reply.json()) as T;
}
