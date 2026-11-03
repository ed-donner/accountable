import { AuthApiError } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { queryDefaults } from "../App";
import { api } from "../lib/api";
import { endSession } from "../lib/session";
import { mockApi, startSignedIn, user } from "../test-utils";
import { SignedIn as LocalSignedIn } from "./SignIn";

type Saved = { access_token: string } | null;
type Listener = (event: string, saved: Saved) => void;

/** Stands in for Supabase's client, which these tests never reach. */
const supabase = vi.hoisted(() => {
  const state = { listeners: [] as Listener[] };
  const emit = (event: string, saved: Saved) => state.listeners.forEach((listener) => listener(event, saved));
  const auth = {
    onAuthStateChange: (listener: Listener) => {
      state.listeners.push(listener);
      return { data: { subscription: { unsubscribe: () => undefined } } };
    },
    getSession: async () => ({ data: { session: null }, error: null }),
    signInWithPassword: async (): Promise<{ error: unknown }> => ({ error: null }),
    signOut: async () => ({ error: null }),
  };
  return { state, emit, auth };
});

vi.mock("@supabase/supabase-js", async (original) => ({
  ...(await original<typeof import("@supabase/supabase-js")>()),
  createClient: () => ({ auth: supabase.auth }),
}));

const TEAMMATES = [
  { id: "u-alex", name: "Alex Rivera", email: "alex.rivera@accountable.example", initials: "AR" },
  { id: "u-dana", name: "Dana Whitfield", email: "dana.whitfield@accountable.example", initials: "DW" },
  { id: "u-theo", name: "Theo Brandt", email: "theo.brandt@accountable.example", initials: "TB" },
  { id: "u-robin", name: "robin@accountable.example", email: "robin@accountable.example", initials: "R" },
];

/** A fresh copy of the screen, as a page load of the shared app would give. */
async function loadSharedApp() {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", "https://team.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  return (await import("./SignIn")).SignedIn;
}

function renderSignedIn(SignedIn: typeof LocalSignedIn, children: ReactNode = <p>The app</p>) {
  const client = new QueryClient({ defaultOptions: queryDefaults });
  render(
    <QueryClientProvider client={client}>
      <SignedIn>{children}</SignedIn>
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  supabase.state.listeners = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
});

describe("the shared app's sign-in", () => {
  async function openSignIn() {
    renderSignedIn(await loadSharedApp());
    act(() => supabase.emit("INITIAL_SESSION", null));
    return vi.spyOn(supabase.auth, "signInWithPassword");
  }

  async function fillIn(email: string, password: string) {
    await user().type(screen.getByLabelText("Email"), email);
    await user().type(screen.getByLabelText("Password"), password);
  }

  it("shows nothing while it checks for a saved session", async () => {
    renderSignedIn(await loadSharedApp());
    expect(document.body.textContent).toBe("");
  });

  it("asks for an email and password, under the wordmark", async () => {
    await openSignIn();
    expect(screen.getByText("Accountable")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeTruthy();
    expect(screen.getByLabelText("Email").getAttribute("type")).toBe("email");
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("password");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("says which field is missing", async () => {
    const signIn = await openSignIn();
    await user().click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter your email")).toBeTruthy();
    expect(screen.getByText("Enter your password")).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("signs in on Enter, and opens the app", async () => {
    const signIn = await openSignIn();
    await fillIn("alex@team.example", "right{Enter}");
    expect(await screen.findByText("The app")).toBeTruthy();
    expect(signIn).toHaveBeenCalledWith({ email: "alex@team.example", password: "right" });
  });

  it("signs in once, however quickly the button is pressed", async () => {
    const signIn = await openSignIn();
    signIn.mockReturnValue(new Promise(() => undefined));
    await fillIn("alex@team.example", "right");
    const button = screen.getByRole("button", { name: "Sign in" });

    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    expect(signIn).toHaveBeenCalledOnce();
  });

  it("keeps the email after a wrong password, and says so", async () => {
    const signIn = await openSignIn();
    signIn.mockResolvedValue({ error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials") });
    await fillIn("alex@team.example", "wrong{Enter}");

    expect((await screen.findByRole("alert")).textContent).toBe("That email and password don't match.");
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("alex@team.example");
    expect(screen.queryByText("The app")).toBeNull();
  });

  it("says the session has ended when Supabase ends it", async () => {
    renderSignedIn(await loadSharedApp());
    act(() => supabase.emit("INITIAL_SESSION", { access_token: "supabase-token" }));
    expect(screen.getByText("The app")).toBeTruthy();

    act(() => supabase.emit("SIGNED_OUT", null));

    expect(screen.getByRole("alert").textContent).toBe("Your session has ended. Sign in again.");
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });
});

describe("the local copy's sign-in", () => {
  it("lists the four made-up teammates, with their initials, names and emails", async () => {
    mockApi({ "GET /local/teammates": TEAMMATES });
    renderSignedIn(LocalSignedIn);

    expect(await screen.findByText("Alex Rivera")).toBeTruthy();
    expect(screen.getByText("This is a local copy with made-up data. Choose who to sign in as.")).toBeTruthy();
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(4);
    expect(buttons.map((button) => button.querySelector("[aria-hidden]")?.textContent)).toEqual([
      "AR",
      "DW",
      "TB",
      "R",
    ]);
    expect(screen.getByRole("button", { name: "Alex Rivera alex.rivera@accountable.example" })).toBe(buttons[0]);
    expect(screen.getByRole("button", { name: "Dana Whitfield dana.whitfield@accountable.example" })).toBe(buttons[1]);
    expect(screen.getByRole("button", { name: "Theo Brandt theo.brandt@accountable.example" })).toBe(buttons[2]);
  });

  it("shows the email once in place of a name for someone with no display name", async () => {
    mockApi({ "GET /local/teammates": [TEAMMATES[3]] });
    renderSignedIn(LocalSignedIn);
    expect(await screen.findByRole("button", { name: "robin@accountable.example" })).toBeTruthy();
    expect(screen.getAllByText("robin@accountable.example")).toHaveLength(1);
  });

  it("signs in as the teammate chosen, once, at the address it was opened at", async () => {
    window.history.replaceState({}, "", "/deals/7");
    const calls = mockApi({
      "GET /local/teammates": TEAMMATES,
      "POST /local/sign-in": { token: "token-for-dana" },
    });
    renderSignedIn(LocalSignedIn, <p>Signed in at {window.location.pathname}</p>);
    const dana = await screen.findByRole("button", { name: /Dana Whitfield/ });

    fireEvent.click(dana);
    fireEvent.click(dana);

    expect(await screen.findByText("Signed in at /deals/7")).toBeTruthy();
    expect(calls.filter((call) => call.path === "/local/sign-in")).toEqual([
      { method: "POST", path: "/local/sign-in", body: { user_id: "u-dana" } },
    ]);
    expect(localStorage.getItem("accountable-session")).toBe("token-for-dana");
  });

  it("says why when signing in fails", async () => {
    mockApi({
      "GET /local/teammates": TEAMMATES,
      "POST /local/sign-in": () => ({ status: 401, body: { detail: "Sign in to use Accountable." } }),
    });
    renderSignedIn(LocalSignedIn);
    await user().click(await screen.findByRole("button", { name: /Theo Brandt/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("Sign in to use Accountable.");
  });

  it("says when Accountable can't be reached, and lists the teammates once it's back", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    renderSignedIn(LocalSignedIn);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Can't reach Accountable. Check that it's still running.",
    );

    mockApi({ "GET /local/teammates": TEAMMATES });
    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(await screen.findByText("Alex Rivera")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says when the teammates can't be read for another reason", async () => {
    mockApi({ "GET /local/teammates": () => ({ status: 500, body: { detail: "Something went wrong." } }) });
    renderSignedIn(LocalSignedIn);
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't load this.");
  });
});

describe("SignedIn", () => {
  function Deals() {
    useQuery({ queryKey: ["deals"], queryFn: () => api("/deals") });
    return <p>The deals</p>;
  }

  it("shows the app straight away with a saved session", async () => {
    startSignedIn();
    renderSignedIn(LocalSignedIn);
    expect(screen.getByText("The app")).toBeTruthy();
  });

  it("shows the sign-in screen with U6's message when the backend refuses the token", async () => {
    startSignedIn("expired");
    mockApi({
      "GET /deals": () => ({ status: 401, body: { detail: "Sign in to use Accountable." } }),
      "GET /local/teammates": TEAMMATES,
    });
    renderSignedIn(LocalSignedIn, <Deals />);

    expect((await screen.findByRole("alert")).textContent).toBe("Your session has ended. Sign in again.");
    expect(within(screen.getByRole("main")).getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(await screen.findByText("Alex Rivera")).toBeTruthy();
  });

  it("empties the query cache when a session ends", async () => {
    startSignedIn();
    mockApi({ "GET /local/teammates": TEAMMATES });
    const client = renderSignedIn(LocalSignedIn);
    client.setQueryData(["organizations"], [{ id: 1, name: "Harbor & Pine" }]);

    act(() => endSession("Your session has ended. Sign in again."));

    expect(client.getQueryData(["organizations"])).toBeUndefined();
    expect(await screen.findByText("Alex Rivera")).toBeTruthy();
  });
});
