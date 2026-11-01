import { useSyncExternalStore } from "react";

export type ApiErrorKind = "fields" | "missing" | "connection" | "server";

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

export const CONNECTION_MESSAGE = "Can't reach Accountable. Check that it's still running.";

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

async function readJson(reply: Response): Promise<any> {
  try {
    return await reply.json();
  } catch {
    return null;
  }
}

export async function api<T>(path: string, { method = "GET", body, signal }: Options = {}): Promise<T> {
  let reply: Response;
  try {
    reply = await fetch(`/api${path}`, {
      method,
      signal,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    setConnectionLost(true);
    throw new ApiError("connection", CONNECTION_MESSAGE);
  }

  // The backend answers every error in JSON. A non-JSON 5xx comes from the dev
  // server, which is still up but can't reach the backend behind it.
  const isJson = reply.headers.get("content-type")?.includes("application/json") ?? false;
  if (reply.status >= 500 && !isJson) {
    setConnectionLost(true);
    throw new ApiError("connection", CONNECTION_MESSAGE);
  }
  setConnectionLost(false);

  if (reply.ok) {
    return (reply.status === 204 ? undefined : await reply.json()) as T;
  }

  const data = await readJson(reply);
  if (reply.status === 404) throw new ApiError("missing", data?.detail ?? "That record no longer exists.");
  if (reply.status === 422) {
    throw new ApiError("fields", data?.detail ?? "Check the form.", data?.fields ?? {});
  }
  throw new ApiError("server", data?.detail ?? "Something went wrong.");
}
