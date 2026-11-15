import type { QueryClient } from '@tanstack/react-query'

/** An error from the backend, with one message per field for a 422 (R58). */
export class ApiError extends Error {
  status: number
  fields: Record<string, string>

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

/** The one fetch wrapper: JSON in and out, under /api (D1). */
export async function api<T>(path: string, method: Method = 'GET', body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, "Couldn't reach Accountable. Check that it's running and try again.")
  }
  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : 'Something went wrong. Try again.'
    throw new ApiError(response.status, detail, data?.fields ?? {})
  }
  return data as T
}

/**
 * After any change, refetch everything so every screen agrees (D11, R51).
 * The data is small (about 1,000 rows a table), so this is simpler than tracking each key.
 */
export function refreshAll(queryClient: QueryClient) {
  return queryClient.invalidateQueries()
}
