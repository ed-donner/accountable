// The tests' Vite servers run with ACCOUNTABLE_VITE_WATCH=off, so a file saved during
// a run can't reload a page mid-test. Each server here serves a throwaway folder with
// the app's own Vite config. One watches, so the check knows when a watcher would have
// seen a change.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createServer } from "vite";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { ROOT } from "./setup.mjs";

const configFile = path.join(ROOT, "frontend", "vite.config.ts");
const POLL_MS = 20;
// A watcher that isn't ready yet misses a change, so the file changes again after this long.
const REWRITE_MS = 300;
const NOTICE_MS = 5_000;
// Once the watching server has seen the change, long enough for any other watcher to have seen it.
const SETTLE_MS = 200;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function serveFolder(watch) {
  const root = mkdtempSync(path.join(tmpdir(), "accountable-vite-watch-"));
  const file = path.join(root, "answer.js");
  const write = (answer) => writeFileSync(file, `export const answer = ${answer};\n`);
  write(0);
  vi.stubEnv("ACCOUNTABLE_VITE_WATCH", watch);
  vi.stubEnv("ACCOUNTABLE_VITE_CACHE", path.join(root, ".vite"));
  const server = await createServer({ configFile, root, logLevel: "silent" });
  vi.unstubAllEnvs();
  return {
    write,
    served: async () => (await server.transformRequest("/answer.js")).code,
    close: async () => {
      await server.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

let watching;
let unwatched;

beforeAll(async () => {
  watching = await serveFolder("on");
  unwatched = await serveFolder("off");
});

afterAll(async () => {
  await Promise.all([watching?.close(), unwatched?.close()]);
});

it("with ACCOUNTABLE_VITE_WATCH off, a file changed after it was served is served as it was", async () => {
  const before = await unwatched.served();
  const watchedBefore = await watching.served();
  const deadline = Date.now() + NOTICE_MS;
  let answer = 0;
  let rewriteAt = 0;
  while ((await watching.served()) === watchedBefore) {
    if (Date.now() > deadline) throw new Error("The watching server never saw the file change.");
    if (Date.now() >= rewriteAt) {
      answer += 1;
      watching.write(answer);
      unwatched.write(answer);
      rewriteAt = Date.now() + REWRITE_MS;
    }
    await pause(POLL_MS);
  }
  await pause(SETTLE_MS);

  expect(await unwatched.served()).toBe(before);
});
