import http from "node:http";
import net from "node:net";
import { networkInterfaces } from "node:os";
import path from "node:path";

import { expect, test } from "./fixtures";
import { ROOT, addLinkedDeal, stack } from "./helpers";

// There's no sign-in, so these are what keep customer data on this computer. They go
// through the Vite address on purpose: it's the one the browser uses, and the backend's
// own checks can't see what Vite adds in front of it.

type Reply = { status: number; headers: http.IncomingHttpHeaders; body: Buffer };

/** Sends the path exactly as written, where a browser or a URL parser would tidy it up first. */
function send(port: number, target: string, headers: http.OutgoingHttpHeaders = {}, method = "GET") {
  return new Promise<Reply>((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port, path: target, method, headers }, (reply) => {
      const chunks: Buffer[] = [];
      reply.on("data", (chunk) => chunks.push(chunk));
      reply.on("end", () => resolve({ status: reply.statusCode!, headers: reply.headers, body: Buffer.concat(chunks) }));
    });
    request.on("error", reject);
    request.end();
  });
}

const OTHER_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://app.localhost:3000",
  "http://[::1]:3000",
  "https://evil.example",
  "null",
];
const API_READS = ["/api/meta", "/api/organizations", "/api/contacts", "/api/deals", "/api/dashboard"];

for (const origin of OTHER_ORIGINS) {
  test(`a page from ${origin} isn't allowed to read replies`, async () => {
    for (const port of [stack.webPort, stack.apiPort]) {
      for (const route of API_READS) {
        const reply = await send(port, route, { origin });
        expect(reply.headers["access-control-allow-origin"], `${port} ${route}`).toBeUndefined();
      }
    }
    const page = await send(stack.webPort, "/src/main.tsx", { origin });
    expect(page.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test(`a page from ${origin} isn't allowed to write`, async () => {
    for (const port of [stack.webPort, stack.apiPort]) {
      for (const method of ["POST", "PATCH", "DELETE"]) {
        const reply = await send(
          port,
          "/api/contacts/1",
          { origin, "access-control-request-method": method, "access-control-request-headers": "content-type" },
          "OPTIONS",
        );
        expect(reply.headers["access-control-allow-origin"], `${port} ${method}`).toBeUndefined();
        expect(reply.headers["access-control-allow-methods"], `${port} ${method}`).toBeUndefined();
      }
    }
  });
}

test("in a real browser, a page from another local address can't reach anything", async ({ page, request, baseURL, expectConsoleError }) => {
  expectConsoleError(/CORS policy|Failed to load resource/);
  const { contact } = await addLinkedDeal(request, "Guarded");
  const before = (await (await request.get("/api/organizations")).json()).length;

  await page.route("http://localhost:3999/", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Another app</h1>" }));
  await page.goto("http://localhost:3999/");

  const outcomes = await page.evaluate(
    async ({ base, contactId, repoFile }) => {
      const attempt = async (url: string, init?: RequestInit) => {
        try {
          return (await fetch(url, init)).status;
        } catch {
          return "blocked";
        }
      };
      const planted = JSON.stringify({ name: "Planted" });
      return {
        read: await attempt(`${base}/api/contacts`),
        remove: await attempt(`${base}/api/contacts/${contactId}`, { method: "DELETE" }),
        add: await attempt(`${base}/api/organizations`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: planted,
        }),
        file: await attempt(`${base}/@fs${repoFile}`),
        // The kinds a page can send with no permission asked first. It can't read the
        // reply, so what matters is that nothing was saved.
        blindText: await attempt(`${base}/api/organizations`, { method: "POST", mode: "no-cors", headers: { "content-type": "text/plain" }, body: planted }),
        blindForm: await attempt(`${base}/api/organizations`, { method: "POST", mode: "no-cors", body: new URLSearchParams({ name: "Planted" }) }),
      };
    },
    { base: baseURL!, contactId: contact.id, repoFile: path.join(ROOT, "package.json") },
  );

  expect(outcomes).toMatchObject({ read: "blocked", remove: "blocked", add: "blocked", file: "blocked" });
  expect((await request.get(`/api/contacts/${contact.id}`)).status()).toBe(200);
  expect((await (await request.get("/api/organizations")).json()).length).toBe(before);
});

test("a wrong host is refused, whichever server it reaches", async () => {
  const host = "evil.example";
  expect((await send(stack.webPort, "/", { host })).status).toBe(403);
  expect((await send(stack.webPort, "/api/contacts", { host })).status).toBe(403);
  expect((await send(stack.apiPort, "/api/contacts", { host })).status).toBe(400);
});

test("the local addresses are what's accepted", async () => {
  for (const host of [`localhost:${stack.webPort}`, `127.0.0.1:${stack.webPort}`]) {
    expect((await send(stack.webPort, "/api/meta", { host })).status).toBe(200);
  }
});

// A word from each file, so a reply can be checked for what's in it. A status alone
// wouldn't do: anything unknown gets the app's own page back, with a 200.
const OUTSIDE_FRONTEND = [
  ["package.json", '"workspaces"'],
  ["pyproject.toml", "uv_build"],
  ["uv.lock", "requires-python"],
  ["backend/accountable/db.py", "SQLITE_DBCONFIG_ENABLE_FKEY"],
  ["AGENTS.md", "Pytest and Playwright refuse"],
  ["docs/spec.md", "Spec: Accountable"],
  ["e2e/security.spec.ts", "A word from each file"],
] as const;

// Ways around Vite's file rules that have worked in the past.
const SUFFIXES = ["", "?raw", "?url", "?inline", "?import", "?import&raw", "?raw??", "?import&raw??", "?.svg?.wasm?init", "#"];

test("files outside the frontend aren't served, however the address is written", async () => {
  for (const [file, word] of OUTSIDE_FRONTEND) {
    const paths = [
      `/@fs${path.join(ROOT, file)}`,
      `/@fs${ROOT}/frontend/../${file}`,
      `/@fs${ROOT}/node_modules/../${file}`,
      `/${file}`,
      `/../${file}`,
      `/..%2f${file}`,
      `/%2e%2e/${file}`,
      `/node_modules/../../${file}`,
      `//${file}`,
    ];
    for (const target of paths) {
      for (const suffix of SUFFIXES) {
        const reply = await send(stack.webPort, `${target}${suffix}`);
        expect(reply.body.toString().includes(word), `${target}${suffix} gave ${reply.status}`).toBe(false);
      }
    }
  }
});

test("a database file is never served, here or in the real data folder", async () => {
  const databases = [`/@fs${stack.database}`, `/@fs${path.join(ROOT, "data", "accountable.db")}`, "/data/accountable.db", "/../data/accountable.db"];
  for (const target of databases) {
    for (const suffix of SUFFIXES) {
      const reply = await send(stack.webPort, `${target}${suffix}`);
      expect(reply.body.subarray(0, 15).toString(), `${target}${suffix}`).not.toBe("SQLite format 3");
    }
  }
});

test("the app's own files are still served", async () => {
  expect((await send(stack.webPort, "/")).status).toBe(200);
  expect((await send(stack.webPort, "/src/main.tsx")).status).toBe(200);
});

function canConnect(host: string, port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ host, port, timeout: 1000 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

test("the servers can't be reached from another computer", async () => {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => item!.address);

  expect(await canConnect("127.0.0.1", stack.webPort)).toBe(true);
  expect(await canConnect("127.0.0.1", stack.apiPort)).toBe(true);
  for (const address of addresses) {
    expect(await canConnect(address, stack.webPort), `${address} web`).toBe(false);
    expect(await canConnect(address, stack.apiPort), `${address} api`).toBe(false);
  }
});
