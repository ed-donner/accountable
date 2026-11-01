import { QueryClient, onlineManager } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { queryDefaults } from "../App";
import { ApiError, CONNECTION_MESSAGE, api, isConnectionLost } from "./api";

function reply(status: number, body?: unknown, contentType = "application/json") {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": contentType },
  });
}

async function failure(path = "/deals/1"): Promise<ApiError> {
  try {
    await api(path);
  } catch (error) {
    return error as ApiError;
  }
  throw new Error("Expected the request to fail");
}

afterEach(async () => {
  vi.stubGlobal("fetch", async () => reply(200, {}));
  await api("/meta");
  vi.unstubAllGlobals();
  onlineManager.setOnline(true);
});

describe("api", () => {
  it("returns the reply's JSON", async () => {
    vi.stubGlobal("fetch", async () => reply(200, { name: "Acme" }));
    await expect(api("/organizations/1")).resolves.toEqual({ name: "Acme" });
  });

  it("sends bodies as JSON", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => reply(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    await api("/organizations", { method: "POST", body: { name: "Acme" } });
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.body).toBe('{"name":"Acme"}');
  });

  it("turns a 422 into messages per field", async () => {
    vi.stubGlobal("fetch", async () => reply(422, { detail: "Check the form.", fields: { name: "Enter a name" } }));
    const error = await failure();
    expect(error.kind).toBe("fields");
    expect(error.fields).toEqual({ name: "Enter a name" });
  });

  it("turns a 404 into a missing record", async () => {
    vi.stubGlobal("fetch", async () => reply(404, { detail: "Deal not found" }));
    expect((await failure()).kind).toBe("missing");
  });

  it("turns no reply into the connection-lost state", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    const error = await failure();
    expect(error.kind).toBe("connection");
    expect(error.message).toBe(CONNECTION_MESSAGE);
    expect(isConnectionLost()).toBe(true);
  });

  it("treats the dev server's empty 500 as a lost connection", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 500, headers: { "content-type": "text/plain" } }));
    expect((await failure()).kind).toBe("connection");
    expect(isConnectionLost()).toBe(true);
  });

  it("treats the backend's own 500 as a server error", async () => {
    vi.stubGlobal("fetch", async () => reply(500, { detail: "Something went wrong." }));
    expect((await failure()).kind).toBe("server");
    expect(isConnectionLost()).toBe(false);
  });

  it("clears the connection-lost state when a reply arrives", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await failure();
    vi.stubGlobal("fetch", async () => reply(200, {}));
    await api("/meta");
    expect(isConnectionLost()).toBe(false);
  });
});

describe("after the browser reports offline", () => {
  it("still runs reads", async () => {
    onlineManager.setOnline(false);
    vi.stubGlobal("fetch", async () => reply(200, { ok: true }));
    const client = new QueryClient({ defaultOptions: queryDefaults });
    const data = await client.fetchQuery({ queryKey: ["test"], queryFn: () => api("/meta") });
    expect(data).toEqual({ ok: true });
  });

  it("still runs saves", async () => {
    onlineManager.setOnline(false);
    vi.stubGlobal("fetch", async () => reply(200, { saved: true }));
    const client = new QueryClient({ defaultOptions: queryDefaults });
    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => api("/deals/1", { method: "PATCH", body: {} }),
    });
    await expect(mutation.execute(undefined)).resolves.toEqual({ saved: true });
  });
});
