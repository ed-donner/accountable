// TF16: server and network errors become friendly messages.
import { api, ApiError, failureMessage, GENERAL_MESSAGE, NETWORK_MESSAGE } from "./api";

afterEach(() => vi.unstubAllGlobals());

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("expected a failure");
    },
    (error: unknown) => error as ApiError,
  );

function reply(status: number, body: unknown, json = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(json ? JSON.stringify(body) : String(body), { status, headers: { "Content-Type": "application/json" } }),
    ),
  );
}

test("sends the local date", async () => {
  reply(200, { ok: true });
  await api("/health");
  const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(init.headers["X-Local-Date"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test("field errors come through as they are", async () => {
  reply(400, { message: "Check the highlighted fields and try again.", fields: { name: "Enter a name." } });
  const error = await failure(api("/contacts", "POST", {}));
  expect(error).toBeInstanceOf(ApiError);
  expect(error.message).toBe("Check the highlighted fields and try again.");
  expect(error.fields).toEqual({ name: "Enter a name." });
});

test("a server error becomes the general message, never the details", async () => {
  reply(500, { message: "Traceback: KeyError 'x'" });
  const error = await failure(api("/deals"));
  expect(error.message).toBe(GENERAL_MESSAGE);
});

test("no answer becomes the network message", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
  const error = await failure(api("/deals"));
  expect(error.message).toBe(NETWORK_MESSAGE);
  reply(502, "Bad gateway", false);
  expect((await failure(api("/deals"))).message).toBe(NETWORK_MESSAGE);
});

test("toast wording says what failed and what to do", () => {
  expect(failureMessage("save the deal", new ApiError(NETWORK_MESSAGE))).toBe(
    "Couldn't save the deal. Accountable isn't answering. Check it's still running, then try again.",
  );
});
