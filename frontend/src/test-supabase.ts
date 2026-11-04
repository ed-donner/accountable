/**
 * Stands in for Supabase's client, which the unit tests never reach. Like the real one, it
 * keeps a saved session, and tells every page that's listening each time that changes.
 *
 * A test file builds one before anything imports Supabase, and hands it to vi.mock:
 *
 *   const supabase = await vi.hoisted(async () => (await import("./test-supabase")).fakeSupabase());
 *   vi.mock("@supabase/supabase-js", async (original) => ({
 *     ...(await original<typeof import("@supabase/supabase-js")>()),
 *     createClient: () => supabase.client,
 *   }));
 */

type Saved = { access_token: string } | null;
type Listener = (event: string, saved: Saved) => void;

export function fakeSupabase() {
  let saved: Saved = null;
  let listeners: Listener[] = [];

  function change(event: string, next: Saved) {
    saved = next;
    listeners.forEach((listener) => listener(event, next));
  }

  const auth = {
    onAuthStateChange(listener: Listener) {
      listeners.push(listener);
      return { data: { subscription: { unsubscribe: () => undefined } } };
    },
    getSession: async () => ({ data: { session: saved }, error: null }),
    signInWithPassword: async ({ email }: { email: string; password: string }): Promise<{ error: unknown }> => {
      change("SIGNED_IN", { access_token: `token-for-${email}` });
      return { error: null };
    },
    signOut: async () => {
      change("SIGNED_OUT", null);
      return { error: null };
    },
  };

  return {
    client: { auth },
    auth,
    /** A page load finding this session saved in the browser, or none. */
    load: (found: Saved) => change("INITIAL_SESSION", found),
    /** Supabase renewing the token before it expires. */
    renew: (token: string) => change("TOKEN_REFRESHED", { access_token: token }),
    /** Supabase ending the session, as when the person is removed. */
    end: () => change("SIGNED_OUT", null),
    /** Forgets the pages loaded so far, as a new test should. */
    reset() {
      saved = null;
      listeners = [];
    },
  };
}
