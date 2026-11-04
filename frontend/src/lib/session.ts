import { createClient, isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";

/** Where the local copy keeps its token. Supabase's client keeps the shared app's under its own key. */
export const SESSION_KEY = "accountable-session";

export const SESSION_ENDED = "Your session has ended. Sign in again.";
export const WRONG_DETAILS = "That email and password don't match.";
export const NO_SIGN_IN_SERVICE = "Can't reach the sign-in service. Check your internet connection.";
export const TOO_MANY_TRIES = "Too many tries. Wait a minute and try again.";

/** Each sign-in begins a session with a new id, so whatever belongs to an earlier one can tell it's over. */
export type Session =
  { status: "checking" } | { status: "signed-in"; id: number } | { status: "signed-out"; message?: string };

const SIGNED_OUT: Session = { status: "signed-out" };

/** npm start and Render build in Supabase's settings, and npm run dev never does (C9, W2). */
function sharedAppClient() {
  const url: string | undefined = import.meta.env.VITE_SUPABASE_URL;
  const key: string | undefined = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? createClient(url, key, { auth: { detectSessionInUrl: false } }) : null;
}

const supabase = sharedAppClient();

export const isSharedApp = supabase !== null;

function savedToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** The local copy's token when storage is off or full. It lasts until the page is reloaded. */
let unsavedToken: string | null = null;

function keepToken(token: string | null) {
  unsavedToken = null;
  try {
    if (token === null) localStorage.removeItem(SESSION_KEY);
    else localStorage.setItem(SESSION_KEY, token);
  } catch {
    unsavedToken = token;
  }
}

let sessionsBegun = 0;

function newSession(): Session {
  sessionsBegun += 1;
  return { status: "signed-in", id: sessionsBegun };
}

let session: Session = supabase ? { status: "checking" } : savedToken() ? newSession() : SIGNED_OUT;
const listeners = new Set<() => void>();

function show(next: Session) {
  if (next === session) return;
  session = next;
  listeners.forEach((listener) => listener());
}

/** Starts a session, unless one is already going, as when Supabase renews its token. */
function begin() {
  if (session.status !== "signed-in") show(newSession());
}

/** Signed in, signed out with any message to show, or still checking a saved session. */
export function useSession(): Session {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => session,
  );
}

/** The session as it is now, so a request can tell when its reply comes whether that session is still going. */
export function currentSession(): Session {
  return session;
}

/** Read for each request, so a sign-out in another tab shows on the next one (U5). */
export async function currentToken(): Promise<string | null> {
  if (!supabase) return unsavedToken ?? savedToken();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Drops this browser's token, so a reload stays signed out. */
async function forgetToken() {
  if (supabase) await supabase.auth.signOut({ scope: "local" });
  else keepToken(null);
}

/** Ends the session some other way than signing out, such as the backend refusing its token (U6). */
export function endSession(message: string) {
  if (session.status !== "signed-in") return;
  show({ status: "signed-out", message });
  void forgetToken();
}

/** Signs out of this browser only, since each browser signs in separately (U4, U5). */
export async function signOut() {
  show(SIGNED_OUT);
  await forgetToken();
}

/** The local copy: keeps the token its sign-in route gave for a made-up teammate (U13). */
export function signInWithToken(token: string) {
  keepToken(token);
  begin();
}

function signInMessage(error: AuthError) {
  if (isAuthRetryableFetchError(error)) return NO_SIGN_IN_SERVICE;
  if (error.status === 429 || error.code === "over_request_rate_limit") return TOO_MANY_TRIES;
  return WRONG_DETAILS;
}

/** The shared app: signs in through Supabase, giving U2's message if it can't. */
export async function signInWithPassword(email: string, password: string): Promise<string | undefined> {
  if (!supabase) throw new Error("The local copy signs in without a password.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return signInMessage(error);
  begin();
}

/**
 * Supabase's client restores the shared app's session, renews it, and tells each tab
 * when it ends. It can't say whether another tab signed out or Supabase ended the
 * session, so an ending this tab didn't ask for gets U6's message.
 */
function followSupabase(signedIn: boolean) {
  if (signedIn) begin();
  else if (session.status === "signed-in") show({ status: "signed-out", message: SESSION_ENDED });
  else if (session.status === "checking") show(SIGNED_OUT);
}

/** The local copy's other tabs signing in or out, which this tab follows. */
function followOtherTabs(event: StorageEvent) {
  if (event.key !== null && event.key !== SESSION_KEY) return;
  // Someone else may have signed in, so this tab's session ends either way, and it goes by storage again.
  unsavedToken = null;
  show(SIGNED_OUT);
  if (savedToken()) begin();
}

if (supabase) supabase.auth.onAuthStateChange((_event, saved) => followSupabase(saved !== null));
else window.addEventListener("storage", followOtherTabs);
