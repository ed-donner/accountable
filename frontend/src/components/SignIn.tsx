import { zodResolver } from "@hookform/resolvers/zod";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ApiError, CONNECTION_MESSAGE, api } from "../lib/api";
import { dropMessages } from "../lib/notify";
import { queryDefaults } from "../lib/queryDefaults";
import { isSharedApp, signInWithPassword, signInWithToken, useSession } from "../lib/session";
import { Field } from "./Field";

/** Shows the sign-in screen until there's a session, then the app at the address it was opened at (U1). */
export function SignedIn({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.status === "checking") return null;
  // Each session reads into a cache of its own, which goes when the session ends. So nothing
  // from one shows to whoever signs in next, not even a reply or a move that finishes late (U5).
  if (session.status === "signed-out") {
    return (
      <OwnCache key="signed-out">
        <SignInScreen message={session.message} />
      </OwnCache>
    );
  }
  return <OwnCache key={session.id}>{children}</OwnCache>;
}

/**
 * A query cache made for what's inside, and dropped with it. Its messages go too (U5).
 * React runs this before the next session's Toaster starts, so that one never gets them.
 */
function OwnCache({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: queryDefaults }));
  useEffect(() => dropMessages, []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function SignInScreen({ message }: { message?: string }) {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-[400px] rounded-panel bg-panel p-8">
        <div className="text-[19px] leading-6 font-semibold">Accountable</div>
        <h1 className="mt-6 text-base leading-6 font-semibold">Sign in</h1>
        {isSharedApp ? <PasswordSignIn message={message} /> : <LocalSignIn message={message} />}
      </div>
    </main>
  );
}

function Message({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-control bg-page px-3 py-2.5">
      {children}
    </p>
  );
}

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email"),
  password: z.string().min(1, "Enter your password"),
});

type Values = z.infer<typeof schema>;

/** The shared app's sign-in, through Supabase (U2). */
function PasswordSignIn({ message }: { message?: string }) {
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);
  const signingIn = useRef(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  async function signIn({ email, password }: Values) {
    setFailure(await signInWithPassword(email, password));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The button only disables once the page redraws, which a quick second press can beat.
    if (signingIn.current) return;
    signingIn.current = true;
    setPending(true);
    try {
      await handleSubmit(signIn)(event);
    } finally {
      signingIn.current = false;
      setPending(false);
    }
  }

  const shown = failure ?? message;
  return (
    <form noValidate onSubmit={submit} className="mt-4 flex flex-col gap-3.5">
      <Field label="Email" htmlFor="sign-in-email" error={errors.email?.message}>
        <input
          id="sign-in-email"
          type="email"
          autoComplete="username"
          className="input"
          aria-invalid={!!errors.email}
          {...register("email")}
        />
      </Field>
      <Field label="Password" htmlFor="sign-in-password" error={errors.password?.message}>
        <input
          id="sign-in-password"
          type="password"
          autoComplete="current-password"
          className="input"
          aria-invalid={!!errors.password}
          {...register("password")}
        />
      </Field>
      {shown && <Message>{shown}</Message>}
      <button type="submit" className="btn btn-primary mt-1 w-full" disabled={pending}>
        Sign in
      </button>
    </form>
  );
}

/** A made-up teammate, whose name falls back to their email (U8). */
type Teammate = { id: string; name: string; email: string; initials: string };

const RETRY_MS = 3000;

async function signInAs(teammate: Teammate) {
  const body = { user_id: teammate.id };
  const { token } = await api<{ token: string }>("/local/sign-in", { method: "POST", body });
  signInWithToken(token);
}

/** The local copy's sign-in: choose one of the made-up teammates (U13). */
function LocalSignIn({ message }: { message?: string }) {
  const teammates = useQuery({
    queryKey: ["local-teammates"],
    queryFn: () => api<Teammate[]>("/local/teammates"),
    // Comes back by itself once Accountable is running again.
    refetchInterval: (query) => (query.state.error ? RETRY_MS : false),
  });
  const [failure, setFailure] = useState<string>();
  const [pending, setPending] = useState(false);
  const signingIn = useRef(false);

  async function choose(teammate: Teammate) {
    if (signingIn.current) return;
    signingIn.current = true;
    setPending(true);
    try {
      await signInAs(teammate);
    } catch (error) {
      setFailure(error instanceof ApiError ? error.message : "Something went wrong.");
    } finally {
      signingIn.current = false;
      setPending(false);
    }
  }

  const shown = failure ?? message ?? (teammates.error ? readFailure(teammates.error) : undefined);
  return (
    <div className="mt-2 flex flex-col gap-4">
      <p className="text-muted">This is a local copy with made-up data. Choose who to sign in as.</p>
      {shown && <Message>{shown}</Message>}
      <ul className="-mx-3 flex flex-col gap-1">
        {teammates.data?.map((teammate) => (
          <li key={teammate.id}>
            <TeammateButton teammate={teammate} disabled={pending} onChoose={choose} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function readFailure(error: Error) {
  return error instanceof ApiError && error.kind === "connection" ? CONNECTION_MESSAGE : "Couldn't load this.";
}

type TeammateProps = { teammate: Teammate; disabled: boolean; onChoose: (teammate: Teammate) => void };

function TeammateButton({ teammate, disabled, onChoose }: TeammateProps) {
  const { name, email, initials } = teammate;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChoose(teammate)}
      className="flex w-full items-center gap-3 rounded-control px-3 py-2 text-left hover:bg-page"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-8 flex-none items-center justify-center rounded-full bg-marigold text-[13px] leading-[18px] font-semibold text-midnight"
      >
        {initials}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold">{name}</span>
        {/* Keeps the name and email apart for screen readers. A flex box doesn't draw it. */}{" "}
        {name !== email && <span className="text-[13px] leading-[18px] text-muted">{email}</span>}
      </span>
    </button>
  );
}
