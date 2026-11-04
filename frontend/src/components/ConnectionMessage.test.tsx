import { useQuery } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { queryDefaults } from "../lib/queryDefaults";
import { api } from "../lib/api";
import { ConnectionMessage } from "./ConnectionMessage";

function Reader() {
  const read = useQuery({ queryKey: ["read"], queryFn: () => api<string>("/read") });
  return <p>{read.data ?? "Nothing yet"}</p>;
}

function reply(status: number, body: unknown, contentType = "application/json") {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": contentType } });
}

afterEach(async () => {
  vi.stubGlobal("fetch", async () => reply(200, {}));
  await api("/meta");
  vi.unstubAllGlobals();
});

describe("when the connection comes back", () => {
  it("reads again what failed, even if another read is what showed it was back", async () => {
    let reads = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      if (url !== "/api/read") return reply(200, {});
      reads += 1;
      return reads === 1
        ? new Response("", { status: 500, headers: { "content-type": "text/plain" } })
        : reply(200, "Read again");
    });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: queryDefaults })}>
        <ConnectionMessage />
        <Reader />
      </QueryClientProvider>,
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Can't reach Accountable. Check that it's still running.",
    );

    await act(() => api("/something-else"));

    expect(await screen.findByText("Read again")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
