// Talks to the backend: sends the user's today (G10) and turns every failure
// into a short, plain message (G8).
import type { components } from "./api-types";
import { localToday } from "./today";

export type Schemas = components["schemas"];

export const NETWORK_MESSAGE =
  "Accountable isn't answering. Check it's still running, then try again.";
export const GENERAL_MESSAGE =
  "Something went wrong in Accountable. Try again, and if it keeps happening, restart the app.";

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(message: string, status = 0, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

export async function api<T>(path: string, method: Method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: {
        "X-Local-Date": localToday(),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(NETWORK_MESSAGE);
  }
  if (response.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const payload = (data ?? {}) as { message?: unknown; fields?: unknown };
    const message =
      typeof payload.message === "string" && response.status < 500
        ? payload.message
        : GENERAL_MESSAGE;
    const fields =
      payload.fields && typeof payload.fields === "object"
        ? (payload.fields as Record<string, string>)
        : {};
    // A reply that isn't ours (such as the dev proxy failing) means the backend isn't running.
    const unreachable = data === null && response.status >= 500;
    throw new ApiError(unreachable ? NETWORK_MESSAGE : message, response.status, fields);
  }
  return data as T;
}

/** "Couldn't save the deal. Accountable isn't answering..." for toasts. */
export function failureMessage(action: string, error: unknown): string {
  const detail = error instanceof ApiError ? error.message : GENERAL_MESSAGE;
  return `Couldn't ${action}. ${detail}`;
}
