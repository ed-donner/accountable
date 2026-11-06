import { QueryClient, onlineManager } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { startSignedIn } from "../test-utils";
import { ApiError, CONNECTION_MESSAGE, api, download, fetchFile, isConnectionLost, onReconnect, stream } from "./api";
import { queryDefaults } from "./queryDefaults";
import { SESSION_KEY, signInWithToken, signOut, useSession } from "./session";

const supabase = await vi.hoisted(async () => (await import("../test-supabase")).fakeSupabase());

vi.mock("@supabase/supabase-js", async (original) => ({
  ...(await original<typeof import("@supabase/supabase-js")>()),
  createClient: () => supabase.client,
}));

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

function stubFetch(status = 200, body: unknown = {}) {
  const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => reply(status, body));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(async () => {
  vi.stubGlobal("fetch", async () => reply(200, {}));
  await api("/meta");
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  onlineManager.setOnline(true);
});

describe("api", () => {
  it("returns the reply's JSON", async () => {
    vi.stubGlobal("fetch", async () => reply(200, { name: "Acme" }));
    await expect(api("/organizations/1")).resolves.toEqual({ name: "Acme" });
  });

  it("sends bodies as JSON", async () => {
    const fetchMock = stubFetch();
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
    expect(error.message).toBe("Can't reach Accountable. Check that it's still running.");
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

  it("says once when the connection comes back, whichever reply shows it", async () => {
    const back = vi.fn();
    const stop = onReconnect(back);
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await failure();
    expect(back).not.toHaveBeenCalled();

    vi.stubGlobal("fetch", async () => reply(200, {}));
    await api("/deals");
    await api("/contacts");
    expect(back).toHaveBeenCalledOnce();
    stop();
  });
});

describe("signing in", () => {
  it("sends the token with every request", async () => {
    startSignedIn("abc");
    const fetchMock = stubFetch();
    await api("/deals");
    await api("/organizations", { method: "POST", body: { name: "Acme" } });
    expect(fetchMock.mock.calls.map(([, init]) => init.headers)).toEqual([
      { Authorization: "Bearer abc" },
      { Authorization: "Bearer abc", "Content-Type": "application/json" },
    ]);
  });

  it("reads the token as each request goes, so another tab's sign-out shows on the next", async () => {
    startSignedIn("abc");
    const fetchMock = stubFetch();
    await api("/deals");
    localStorage.removeItem(SESSION_KEY);
    await api("/deals");
    expect(fetchMock.mock.calls[1][1].headers).toEqual({});
  });

  it("sends the token even when storage couldn't keep it", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    const { result } = renderHook(useSession);
    act(() => signInWithToken("unsaved"));
    const fetchMock = stubFetch();

    await api("/deals");

    expect(result.current.status).toBe("signed-in");
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: "Bearer unsaved" });
  });

  it("ends the session when the backend refuses the token", async () => {
    startSignedIn("expired");
    const { result } = renderHook(useSession);
    stubFetch(401, { detail: "Sign in to use Accountable." });

    const error = await act(() => failure("/deals"));

    expect(error.kind).toBe("signed-out");
    expect(result.current).toEqual({ status: "signed-out", message: "Your session has ended. Sign in again." });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("leaves a newer session alone when a refusal from before it arrives late", async () => {
    startSignedIn("old-token");
    const { result } = renderHook(useSession);
    let refuse = () => {};
    vi.stubGlobal(
      "fetch",
      () => new Promise<Response>((resolve) => (refuse = () => resolve(reply(401, { detail: "Expired" })))),
    );
    const late = failure("/deals");

    await act(() => signOut());
    act(() => signInWithToken("new-token"));
    await act(async () => {
      refuse();
      await late;
    });

    expect((await late).kind).toBe("signed-out");
    expect(result.current.status).toBe("signed-in");
    expect(localStorage.getItem(SESSION_KEY)).toBe("new-token");
  });
});

describe("stream", () => {
  const encoder = new TextEncoder();

  /** A 200 whose body arrives in these pieces, as text or as bytes. */
  function replyIn(pieces: (string | Uint8Array)[]) {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        pieces.forEach((piece) => controller.enqueue(typeof piece === "string" ? encoder.encode(piece) : piece));
        controller.close();
      },
    });
    return new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" } });
  }

  /** A body the test sends a piece at a time. Aborting the request breaks it off, as the browser's fetch does. */
  function heldReply(signal?: AbortSignal | null) {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start: (given) => {
        controller = given;
      },
      cancel: cancelled,
    });
    signal?.addEventListener("abort", () => controller.error(signal.reason));
    return {
      reply: new Response(body, { status: 200 }),
      send: (text: string) => controller.enqueue(encoder.encode(text)),
      cut: () => controller.error(new TypeError("network error")),
      cancelled,
    };
  }

  /** Answers with a held body, given once fetch is called, so it follows the request's signal. */
  function holdReply(): Promise<ReturnType<typeof heldReply>> {
    return new Promise((fetched) => {
      vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
        const held = heldReply(init.signal);
        fetched(held);
        return held.reply;
      });
    });
  }

  async function everyLine(lines: AsyncIterable<unknown>) {
    const values: unknown[] = [];
    for await (const value of lines) values.push(value);
    return values;
  }

  function spyOnTheConsole() {
    return [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log")];
  }

  it("hands over each JSON line, whether it's split across pieces or shares one with others", async () => {
    vi.stubGlobal("fetch", async () => replyIn(['{"a":', '1}\n{"b":2}\n{"c"', ':3}\n{"d":4}']));
    expect(await everyLine(stream("/copilot/chat"))).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }, { d: 4 }]);
  });

  it("reads a character whose bytes are split between two pieces", async () => {
    const bytes = encoder.encode('{"name":"Café"}\n');
    const insideTheE = bytes.indexOf(0xc3) + 1;
    vi.stubGlobal("fetch", async () => replyIn([bytes.slice(0, insideTheE), bytes.slice(insideTheE)]));
    expect(await everyLine(stream("/copilot/chat"))).toEqual([{ name: "Café" }]);
  });

  it("drops blank lines and lines that aren't JSON", async () => {
    vi.stubGlobal("fetch", async () => replyIn(['{"a":1}\n\n', "not JSON\n", '{"b":2}\n']));
    expect(await everyLine(stream("/copilot/chat"))).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("hands over each line as it arrives, before the rest has come", async () => {
    const held = holdReply();
    const lines = stream("/copilot/chat")[Symbol.asyncIterator]();
    const first = lines.next();
    (await held).send('{"a":1}\n');
    expect(await first).toEqual({ done: false, value: { a: 1 } });
    const second = lines.next();
    (await held).send('{"b":2}\n');
    expect(await second).toEqual({ done: false, value: { b: 2 } });
  });

  it("lets go of the reply when the reader stops early", async () => {
    const held = holdReply();
    const lines = stream("/copilot/chat")[Symbol.asyncIterator]();
    const first = lines.next();
    (await held).send('{"a":1}\n{"b":2}\n');
    await first;
    await lines.return(undefined);
    expect((await held).cancelled).toHaveBeenCalledOnce();
  });

  it("sends the body as JSON with the token, as api() does", async () => {
    startSignedIn("abc");
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => replyIn([]));
    vi.stubGlobal("fetch", fetchMock);
    await everyLine(stream("/copilot/chat", { method: "POST", body: { messages: [] } }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/copilot/chat");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer abc", "Content-Type": "application/json" });
    expect(init.body).toBe('{"messages":[]}');
  });

  it("ends the session when the backend refuses the token, as api() does", async () => {
    startSignedIn("expired");
    const { result } = renderHook(useSession);
    stubFetch(401, { detail: "Sign in to use Accountable." });

    const refused = act(() => everyLine(stream("/copilot/chat", { method: "POST", body: {} })));

    await expect(refused).rejects.toMatchObject({ kind: "signed-out" });
    expect(result.current).toEqual({ status: "signed-out", message: "Your session has ended. Sign in again." });
  });

  it("gives api()'s error for a request refused before the stream starts", async () => {
    stubFetch(422, { detail: "Check the form.", fields: { "messages.0.text": "Use plain text here" } });
    await expect(everyLine(stream("/copilot/chat", { method: "POST", body: {} }))).rejects.toMatchObject({
      kind: "fields",
      fields: { "messages.0.text": "Use plain text here" },
    });
  });

  it("shows the connection lost when no reply comes", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(everyLine(stream("/copilot/chat"))).rejects.toMatchObject({
      kind: "connection",
      message: CONNECTION_MESSAGE,
    });
    expect(isConnectionLost()).toBe(true);
  });

  it("shows the connection lost when the reply breaks off part way, after handing over what came", async () => {
    const held = holdReply();
    const lines = stream("/copilot/chat")[Symbol.asyncIterator]();
    const first = lines.next();
    (await held).send('{"a":1}\n');
    expect(await first).toEqual({ done: false, value: { a: 1 } });
    const next = lines.next();
    (await held).cut();

    await expect(next).rejects.toMatchObject({ kind: "connection", message: CONNECTION_MESSAGE });
    expect(isConnectionLost()).toBe(true);
  });

  it("throws the AbortError when aborted part way through, and logs and changes nothing else", async () => {
    startSignedIn("abc");
    const { result } = renderHook(useSession);
    const logs = spyOnTheConsole();
    const held = holdReply();
    const aborting = new AbortController();
    const lines = stream("/copilot/chat", { method: "POST", body: {}, signal: aborting.signal })[
      Symbol.asyncIterator
    ]();
    const first = lines.next();
    (await held).send('{"a":1}\n');
    await first;
    const next = lines.next();

    aborting.abort();

    await expect(next).rejects.toMatchObject({ name: "AbortError" });
    expect(isConnectionLost()).toBe(false);
    expect(result.current.status).toBe("signed-in");
    logs.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it("throws the AbortError when aborted before the reply comes, and logs and changes nothing else", async () => {
    startSignedIn("abc");
    const { result } = renderHook(useSession);
    const logs = spyOnTheConsole();
    const aborting = new AbortController();
    const asked = new Promise<void>((fetched) => {
      vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
        fetched();
        // fetch rejects with the signal's reason, the AbortError, once it's aborted.
        return new Promise<Response>((_answer, refuse) =>
          init.signal!.addEventListener("abort", () => refuse(init.signal!.reason)),
        );
      });
    });
    const reading = everyLine(stream("/copilot/chat", { method: "POST", body: {}, signal: aborting.signal }));
    await asked;

    aborting.abort();

    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
    expect(isConnectionLost()).toBe(false);
    expect(result.current.status).toBe("signed-in");
    logs.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });
});

describe("downloading a file", () => {
  function stubFileUrls() {
    const made = vi.fn<(file: Blob) => string>(() => "blob:the-file");
    const released = vi.fn<(address: string) => void>();
    vi.stubGlobal("URL", { ...URL, createObjectURL: made, revokeObjectURL: released });
    return { made, released };
  }

  it("saves the reply under the name given, with the token sent as for any request", async () => {
    startSignedIn("abc");
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => new Response("%PDF-1.7", { status: 200, headers: { "content-type": "application/pdf" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { made, released } = stubFileUrls();
    const clicked: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.getAttribute("href") ?? "", download: this.download });
    });
    vi.useFakeTimers({ toFake: ["setTimeout"] });

    try {
      await download("/quotes/3/pdf", "QT-0003.pdf");
      expect(fetchMock.mock.calls).toEqual([["/api/quotes/3/pdf", expect.objectContaining({ method: "GET" })]]);
      expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: "Bearer abc" });
      expect(await made.mock.calls[0][0].text()).toBe("%PDF-1.7");
      expect(clicked).toEqual([{ href: "blob:the-file", download: "QT-0003.pdf" }]);
      expect(released).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(released).toHaveBeenCalledWith("blob:the-file");
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives the same errors as any other request, and saves nothing", async () => {
    stubFetch(404, { detail: "Quote not found" });
    const { made } = stubFileUrls();
    await expect(download("/quotes/3/pdf", "QT-0003.pdf")).rejects.toMatchObject({
      kind: "missing",
      message: "Quote not found",
    });
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(download("/quotes/3/pdf", "QT-0003.pdf")).rejects.toMatchObject({ kind: "connection" });
    expect(made).not.toHaveBeenCalled();
  });
});

describe("fetching a file", () => {
  it("sends the token and gives the file's bytes and type", async () => {
    startSignedIn("abc");
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => new Response("PNG bytes", { status: 200, headers: { "content-type": "image/png" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const file = await fetchFile("/settings/logo");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/settings/logo");
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: "Bearer abc" });
    expect(await file.text()).toBe("PNG bytes");
    expect(file.type).toBe("image/png");
  });

  it("gives the same errors as any other request", async () => {
    stubFetch(404, { detail: "No logo" });
    await expect(fetchFile("/settings/logo")).rejects.toMatchObject({ kind: "missing", message: "No logo" });
    stubFetch(409, { detail: "A draft has no PDF. Issue it first." });
    await expect(fetchFile("/invoices/1/pdf")).rejects.toMatchObject({
      kind: "server",
      message: "A draft has no PDF. Issue it first.",
    });
  });
});

describe("the connection message", () => {
  it("says to check Accountable is running in the local copy", () => {
    expect(CONNECTION_MESSAGE).toBe("Can't reach Accountable. Check that it's still running.");
  });

  it("says to check the internet in the shared app", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SUPABASE_URL", "https://team.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    const shared = await import("./api");
    expect(shared.CONNECTION_MESSAGE).toBe("Can't reach Accountable. Check your internet connection.");
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
