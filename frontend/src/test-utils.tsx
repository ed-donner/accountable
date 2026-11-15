import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { vi } from 'vitest'
import { ToastProvider } from './components/Toast'

/** Renders a page or component with the app's providers, at a route. */
export function renderApp(ui: ReactNode, path = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createMemoryRouter([{ path: '*', element: ui }], { initialEntries: [path] })
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

type Handler = (body: unknown) => { status?: number; json?: unknown }

/** Replaces fetch with a fake backend: `"GET /deals"` → a response. Returns the mock to inspect calls. */
export function fakeApi(routes: Record<string, Handler | unknown>) {
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url.replace(/^\/api/, '')}`
    if (!(key in routes)) return new Response(JSON.stringify({ detail: `No fake for ${key}` }), { status: 404 })
    const route = routes[key]
    const result = typeof route === 'function' ? (route as Handler)(init?.body ? JSON.parse(String(init.body)) : undefined) : { json: route }
    const status = result.status ?? 200
    return status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(result.json ?? {}), { status })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}
