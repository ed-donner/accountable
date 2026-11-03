import { AuthApiError, AuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Saved = { access_token: string } | null;
type Listener = (event: string, saved: Saved) => void;

/** Stands in for Supabase's client, which these tests never reach. */
const supabase = vi.hoisted(() => {
  const state = { saved: null as Saved, listeners: [] as Listener[] };
  const emit = (event: string, saved: Saved) => state.listeners.forEach((listener) => listener(event, saved));
  const auth = {
    onAuthStateChange: (listener: Listener) => {
      state.listeners.push(listener);
      return { data: { subscription: { unsubscribe: () => undefined } } };
    },
    getSession: async () => ({ data: { session: state.saved }, error: null }),
    signInWithPassword: async (): Promise<{ error: unknown }> => ({ error: null }),
    signOut: async () => {
      state.saved = null;
      emit("SIGNED_OUT", null);
      return { error: null };
    },
  };
  return { state, emit, auth };
});

vi.mock("@supabase/supabase-js", async (original) => ({
  ...(await original<typeof import("@supabase/supabase-js")>()),
  createClient: () => ({ auth: supabase.auth }),
}));

const SHARED = { VITE_SUPABASE_URL: "https://team.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" };

/** A fresh copy of the module, as a page load would give, built with these settings. */
async function load(settings: Record<string, string> = {}) {
  vi.resetModules();
  for (const [name, value] of Object.entries(settings)) vi.stubEnv(name, value);
  return import("./session");
}

function stubBackend(token: string) {
  const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify({ token }), { headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  supabase.state.saved = null;
  supabase.state.listeners = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("which copy", () => {
  it("is the local copy when Supabase's settings weren't built in", async () => {
    expect((await load()).isSharedApp).toBe(false);
  });

  it("is the shared app when both were", async () => {
    expect((await load(SHARED)).isSharedApp).toBe(true);
  });

  it("is the local copy with only one of them", async () => {
    expect((await load({ VITE_SUPABASE_URL: SHARED.VITE_SUPABASE_URL })).isSharedApp).toBe(false);
  });
});

describe("the local copy", () => {
  it("starts signed out with nothing saved", async () => {
    const { result } = renderHook((await load()).useSession);
    expect(result.current).toEqual({ status: "signed-out" });
  });

  it("signs in as a teammate and keeps the token", async () => {
    const session = await load();
    const fetchMock = stubBackend("token-for-alex");
    const { result } = renderHook(session.useSession);

    await act(() => session.signInAs("alex"));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/local/sign-in");
    expect(JSON.parse(String(init.body))).toEqual({ user_id: "alex" });
    expect(result.current).toEqual({ status: "signed-in" });
    expect(localStorage.getItem(session.SESSION_KEY)).toBe("token-for-alex");
    expect(await session.currentToken()).toBe("token-for-alex");
  });

  it("finds the token again after a reload", async () => {
    localStorage.setItem("accountable-session", "saved-token");
    const session = await load();
    expect(renderHook(session.useSession).result.current).toEqual({ status: "signed-in" });
    expect(await session.currentToken()).toBe("saved-token");
  });

  it("drops the token when signing out", async () => {
    localStorage.setItem("accountable-session", "saved-token");
    const session = await load();
    const { result } = renderHook(session.useSession);

    await act(() => session.signOut());

    expect(result.current).toEqual({ status: "signed-out" });
    expect(localStorage.getItem(session.SESSION_KEY)).toBeNull();
    expect(await session.currentToken()).toBeNull();
  });

  it("ends a session with a message, once", async () => {
    localStorage.setItem("accountable-session", "saved-token");
    const session = await load();
    const ended = vi.fn();
    session.onSessionEnd(ended);
    const { result } = renderHook(session.useSession);

    act(() => session.endSession(session.SESSION_ENDED));
    act(() => session.endSession("Something else"));

    expect(result.current).toEqual({ status: "signed-out", message: "Your session has ended. Sign in again." });
    expect(localStorage.getItem(session.SESSION_KEY)).toBeNull();
    expect(ended).toHaveBeenCalledOnce();
  });

  it("follows another tab signing in and out", async () => {
    const session = await load();
    const ended = vi.fn();
    session.onSessionEnd(ended);
    const { result } = renderHook(session.useSession);

    act(() => {
      localStorage.setItem(session.SESSION_KEY, "from-the-other-tab");
      window.dispatchEvent(new StorageEvent("storage", { key: session.SESSION_KEY }));
    });
    expect(result.current).toEqual({ status: "signed-in" });

    act(() => {
      localStorage.removeItem(session.SESSION_KEY);
      window.dispatchEvent(new StorageEvent("storage", { key: session.SESSION_KEY }));
    });
    expect(result.current).toEqual({ status: "signed-out" });
    expect(ended).toHaveBeenCalledOnce();
  });

  it("ignores other things another tab saves", async () => {
    localStorage.setItem("accountable-session", "saved-token");
    const session = await load();
    const { result } = renderHook(session.useSession);

    act(() => {
      localStorage.setItem("accountable-mode", "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: "accountable-mode" }));
    });

    expect(result.current).toEqual({ status: "signed-in" });
  });
});

describe("the shared app", () => {
  async function signInFails(error: AuthError) {
    const session = await load(SHARED);
    vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({ error });
    return session.signInWithPassword("alex@team.example", "not-it");
  }

  it("checks for a saved session, then shows what it found", async () => {
    const session = await load(SHARED);
    const { result } = renderHook(session.useSession);
    expect(result.current).toEqual({ status: "checking" });

    act(() => supabase.emit("INITIAL_SESSION", null));

    expect(result.current).toEqual({ status: "signed-out" });
  });

  it("restores a saved session and reads its token for each request", async () => {
    const session = await load(SHARED);
    const { result } = renderHook(session.useSession);
    supabase.state.saved = { access_token: "supabase-token" };

    act(() => supabase.emit("INITIAL_SESSION", supabase.state.saved));

    expect(result.current).toEqual({ status: "signed-in" });
    expect(await session.currentToken()).toBe("supabase-token");
    supabase.state.saved = { access_token: "renewed-token" };
    expect(await session.currentToken()).toBe("renewed-token");
  });

  it("signs in with an email and password", async () => {
    const session = await load(SHARED);
    const signIn = vi.spyOn(supabase.auth, "signInWithPassword");
    const { result } = renderHook(session.useSession);

    let message: string | undefined = "not yet";
    await act(async () => {
      message = await session.signInWithPassword("alex@team.example", "right");
    });

    expect(signIn).toHaveBeenCalledWith({ email: "alex@team.example", password: "right" });
    expect(message).toBeUndefined();
    expect(result.current).toEqual({ status: "signed-in" });
  });

  it("says when the email and password don't match", async () => {
    const message = await signInFails(new AuthApiError("Invalid login credentials", 400, "invalid_credentials"));
    expect(message).toBe("That email and password don't match.");
  });

  it("says when Supabase can't be reached", async () => {
    const message = await signInFails(new AuthRetryableFetchError("Failed to fetch", 0));
    expect(message).toBe("Can't reach the sign-in service. Check your internet connection.");
  });

  it("says when Supabase is refusing tries for a while", async () => {
    const message = await signInFails(new AuthApiError("Request rate limit reached", 429, "over_request_rate_limit"));
    expect(message).toBe("Too many tries. Wait a minute and try again.");
  });

  it("says the session has ended when Supabase ends it", async () => {
    const session = await load(SHARED);
    const ended = vi.fn();
    session.onSessionEnd(ended);
    const { result } = renderHook(session.useSession);
    act(() => supabase.emit("INITIAL_SESSION", { access_token: "supabase-token" }));

    act(() => supabase.emit("SIGNED_OUT", null));

    expect(result.current).toEqual({ status: "signed-out", message: "Your session has ended. Sign in again." });
    expect(ended).toHaveBeenCalledOnce();
  });

  it("signs out of this browser only, with no message", async () => {
    const session = await load(SHARED);
    const signOut = vi.spyOn(supabase.auth, "signOut");
    const { result } = renderHook(session.useSession);
    act(() => supabase.emit("INITIAL_SESSION", { access_token: "supabase-token" }));

    await act(() => session.signOut());

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(result.current).toEqual({ status: "signed-out" });
  });

  it("forgets a session the backend refused", async () => {
    const session = await load(SHARED);
    const signOut = vi.spyOn(supabase.auth, "signOut");
    const { result } = renderHook(session.useSession);
    act(() => supabase.emit("INITIAL_SESSION", { access_token: "supabase-token" }));

    act(() => session.endSession(session.SESSION_ENDED));

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(result.current).toEqual({ status: "signed-out", message: "Your session has ended. Sign in again." });
  });
});
