import { AuthApiError, AuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabase = await vi.hoisted(async () => (await import("../test-supabase")).fakeSupabase());

vi.mock("@supabase/supabase-js", async (original) => ({
  ...(await original<typeof import("@supabase/supabase-js")>()),
  createClient: () => supabase.client,
}));

const SHARED = { VITE_SUPABASE_URL: "https://team.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" };

/** A fresh copy of the module, as a page load would give, built with these settings. */
async function load(settings: Record<string, string> = {}) {
  vi.resetModules();
  for (const [name, value] of Object.entries(settings)) vi.stubEnv(name, value);
  return import("./session");
}

beforeEach(() => {
  supabase.reset();
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

  it("signs in with the token the local sign-in route gave, and keeps it", async () => {
    const session = await load();
    const { result } = renderHook(session.useSession);

    act(() => session.signInWithToken("token-for-alex"));

    expect(result.current.status).toBe("signed-in");
    expect(localStorage.getItem(session.SESSION_KEY)).toBe("token-for-alex");
    expect(await session.currentToken()).toBe("token-for-alex");
  });

  it("finds the token again after a reload", async () => {
    localStorage.setItem("accountable-session", "saved-token");
    const session = await load();
    expect(renderHook(session.useSession).result.current.status).toBe("signed-in");
    expect(await session.currentToken()).toBe("saved-token");
  });

  it("keeps the token for this page when storage can't, until signing out", async () => {
    const session = await load();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    const { result } = renderHook(session.useSession);

    act(() => session.signInWithToken("unsaved-token"));
    expect(result.current.status).toBe("signed-in");
    expect(await session.currentToken()).toBe("unsaved-token");

    await act(() => session.signOut());
    expect(await session.currentToken()).toBeNull();
  });

  it("begins a new session each time someone signs in", async () => {
    const session = await load();
    const { result } = renderHook(session.useSession);
    act(() => session.signInWithToken("first"));
    const first = result.current;

    await act(() => session.signOut());
    act(() => session.signInWithToken("second"));

    expect(result.current.status).toBe("signed-in");
    expect(result.current).not.toEqual(first);
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
    const { result } = renderHook(session.useSession);

    act(() => session.endSession(session.SESSION_ENDED));
    act(() => session.endSession("Something else"));

    expect(result.current).toEqual({ status: "signed-out", message: "Your session has ended. Sign in again." });
    expect(localStorage.getItem(session.SESSION_KEY)).toBeNull();
  });

  it("follows another tab signing in and out", async () => {
    const session = await load();
    const { result } = renderHook(session.useSession);

    act(() => {
      localStorage.setItem(session.SESSION_KEY, "from-the-other-tab");
      window.dispatchEvent(new StorageEvent("storage", { key: session.SESSION_KEY }));
    });
    expect(result.current.status).toBe("signed-in");
    expect(await session.currentToken()).toBe("from-the-other-tab");

    act(() => {
      localStorage.removeItem(session.SESSION_KEY);
      window.dispatchEvent(new StorageEvent("storage", { key: session.SESSION_KEY }));
    });
    expect(result.current).toEqual({ status: "signed-out" });
  });

  it("begins a new session when another tab signs in as someone else", async () => {
    localStorage.setItem("accountable-session", "alex-token");
    const session = await load();
    const { result } = renderHook(session.useSession);
    const alex = result.current;

    act(() => {
      localStorage.setItem(session.SESSION_KEY, "dana-token");
      window.dispatchEvent(new StorageEvent("storage", { key: session.SESSION_KEY }));
    });

    expect(result.current.status).toBe("signed-in");
    expect(result.current).not.toEqual(alex);
  });

  it("ignores other things another tab saves", async () => {
    localStorage.setItem("accountable-session", "saved-token");
    const session = await load();
    const { result } = renderHook(session.useSession);
    const before = result.current;

    act(() => {
      localStorage.setItem("accountable-mode", "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: "accountable-mode" }));
    });

    expect(result.current.status).toBe("signed-in");
    expect(result.current).toBe(before);
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

    act(() => supabase.load(null));

    expect(result.current).toEqual({ status: "signed-out" });
  });

  it("restores a saved session and reads its token for each request, keeping the session as it's renewed", async () => {
    const session = await load(SHARED);
    const { result } = renderHook(session.useSession);

    act(() => supabase.load({ access_token: "supabase-token" }));

    expect(result.current.status).toBe("signed-in");
    expect(await session.currentToken()).toBe("supabase-token");
    const restored = result.current;
    act(() => supabase.renew("renewed-token"));
    expect(await session.currentToken()).toBe("renewed-token");
    expect(result.current).toBe(restored);
  });

  it("signs in with an email and password", async () => {
    const session = await load(SHARED);
    act(() => supabase.load(null));
    const signIn = vi.spyOn(supabase.auth, "signInWithPassword");
    const { result } = renderHook(session.useSession);

    let message: string | undefined = "not yet";
    await act(async () => {
      message = await session.signInWithPassword("alex@team.example", "right");
    });

    expect(signIn).toHaveBeenCalledWith({ email: "alex@team.example", password: "right" });
    expect(message).toBeUndefined();
    expect(result.current.status).toBe("signed-in");
    expect(await session.currentToken()).toBe("token-for-alex@team.example");
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
    const { result } = renderHook(session.useSession);
    act(() => supabase.load({ access_token: "supabase-token" }));

    act(() => supabase.end());

    expect(result.current).toEqual({ status: "signed-out", message: "Your session has ended. Sign in again." });
  });

  it("signs out of this browser only, with no message", async () => {
    const session = await load(SHARED);
    const signOut = vi.spyOn(supabase.auth, "signOut");
    const { result } = renderHook(session.useSession);
    act(() => supabase.load({ access_token: "supabase-token" }));

    await act(() => session.signOut());

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(result.current).toEqual({ status: "signed-out" });
    expect(await session.currentToken()).toBeNull();
  });

  it("forgets a session the backend refused", async () => {
    const session = await load(SHARED);
    const signOut = vi.spyOn(supabase.auth, "signOut");
    const { result } = renderHook(session.useSession);
    act(() => supabase.load({ access_token: "supabase-token" }));

    act(() => session.endSession(session.SESSION_ENDED));

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(result.current).toEqual({ status: "signed-out", message: "Your session has ended. Sign in again." });
    expect(await session.currentToken()).toBeNull();
  });
});
