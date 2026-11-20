/** An answer of 400 or more from the API. A 422 carries its problems by field. */
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: Record<string, string>;
  readonly body: unknown;

  constructor(status: number, message: string, fieldErrors: Record<string, string>, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.body = body;
  }
}

type ValidationProblem = { loc?: (string | number)[]; msg?: string };

function readProblems(status: number, body: unknown): { message: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return { message: detail, fieldErrors };
  if (Array.isArray(detail)) {
    for (const problem of detail as ValidationProblem[]) {
      const loc = problem.loc ?? [];
      const field = loc[loc.length - 1];
      if (loc[0] === "body" && typeof field === "string" && field !== "body" && !fieldErrors[field]) {
        fieldErrors[field] = problem.msg ?? "Check this field.";
      }
    }
    return { message: "Check the fields marked in red.", fieldErrors };
  }
  return { message: status >= 500 ? "Something went wrong on the server." : "That didn't work.", fieldErrors };
}

/** Send and read JSON from the API. Throws ApiError on an answer of 400 or more. */
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const { method = "GET", body } = options;
  const response = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const { message, fieldErrors } = readProblems(response.status, data);
    throw new ApiError(response.status, message, fieldErrors, data);
  }
  return data as T;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
