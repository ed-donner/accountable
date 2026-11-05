import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { APIRequestContext, Page } from "@playwright/test";

import { stackFor } from "../scripts/test-plan.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** This Playwright worker's own servers and database, in the ports this run holds. */
export const stack = stackFor({
  slot: Number(process.env.ACCOUNTABLE_TEST_SLOT),
  worker: Number(process.env.TEST_PARALLEL_INDEX ?? 0),
  database: process.env.ACCOUNTABLE_DB!,
});
const stackEnv = { ...process.env, ACCOUNTABLE_DB: stack.database };

export const API = "/api";

/** Where the local copy keeps its token in the browser. */
export const SESSION_KEY = "accountable-session";

/** The made-up teammate each test starts signed in as, unless it says otherwise. */
export const SIGNED_IN = { id: "teammate-alex-rivera", name: "Alex Rivera" };

function database(command: "seed" | "empty") {
  execFileSync("uv", ["run", "--no-sync", "python", "-m", "accountable.cli", command, "--yes"], {
    cwd: ROOT,
    env: stackEnv,
    stdio: "pipe",
  });
}

/** Puts the test database back to the sample data. */
export function resetToSampleData() {
  database("seed");
}

export function emptyDatabase() {
  database("empty");
}

export function isoDay(offsetDays = 0) {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return `${day.getFullYear()}-${month}-${date}`;
}

async function post<T>(request: APIRequestContext, route: string, data: unknown): Promise<T> {
  const reply = await request.post(`${API}${route}`, { data });
  if (!reply.ok()) throw new Error(`POST ${route} failed: ${reply.status()} ${await reply.text()}`);
  return reply.json();
}

export type Teammate = { id: string; name: string; email: string; initials: string };

/** The local copy's made-up teammates. Listing them needs no token. */
export async function teammates(request: APIRequestContext): Promise<Teammate[]> {
  const reply = await request.get(`${API}/local/teammates`);
  if (!reply.ok()) throw new Error(`GET /local/teammates failed: ${reply.status()} ${await reply.text()}`);
  return reply.json();
}

/** A token for the teammate with this id or name, or this email for one with no display name. */
export async function tokenFor(request: APIRequestContext, teammate: string) {
  const found = (await teammates(request)).find((each) => [each.id, each.name, each.email].includes(teammate));
  if (!found) throw new Error(`The local copy has no teammate called ${teammate}`);
  const { token } = await post<{ token: string }>(request, "/local/sign-in", { user_id: found.id });
  return token;
}

/** Signs the page in as another teammate, as if they'd signed in earlier on this browser. Call it once the page is on the app. */
export async function signInAs(page: Page, teammate: string) {
  const token = await tokenFor(page.request, teammate);
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [SESSION_KEY, token]);
  await page.reload();
}

/** Signs in on the local copy's sign-in screen, by choosing a teammate. */
export async function chooseTeammate(page: Page, teammate: string) {
  await page.getByRole("button", { name: teammate }).click();
}

export function addOrganization(request: APIRequestContext, name: string, values: object = {}) {
  return post<{ id: number; name: string }>(request, "/organizations", { name, ...values });
}

export function addContact(request: APIRequestContext, name: string, organization_id: number, values: object = {}) {
  return post<{ id: number; name: string }>(request, "/contacts", { name, organization_id, ...values });
}

type DealFields = {
  organization_id: number;
  main_contact_id: number;
  stage?: string;
  value?: number;
  close_date?: string;
};

export function addDeal(request: APIRequestContext, name: string, fields: DealFields) {
  return post<{ id: number; name: string }>(request, "/deals", {
    name,
    value: 10000,
    stage: "new",
    close_date: isoDay(30),
    ...fields,
  });
}

export function addActivity(request: APIRequestContext, values: object) {
  return post<{ id: number }>(request, "/activities", values);
}

/** A product at $100.00 unless the values say otherwise. active: false archives it once it's added. */
export async function addProduct(request: APIRequestContext, name: string, values: { active?: boolean } & object = {}) {
  const { active = true, ...fields } = values;
  const product = await post<{ id: number; name: string }>(request, "/products", {
    name,
    unit_price_cents: 10000,
    ...fields,
  });
  if (!active) {
    const reply = await request.patch(`${API}/products/${product.id}`, { data: { active: false } });
    if (!reply.ok()) throw new Error(`Archiving ${name} failed: ${reply.status()} ${await reply.text()}`);
  }
  return product;
}

/** An organization, a contact and a deal, for tests that need one of each. */
export async function addLinkedDeal(request: APIRequestContext, name: string, deal: Partial<DealFields> = {}) {
  const organization = await addOrganization(request, `${name} Ltd`);
  const contact = await addContact(request, `${name} Contact`, organization.id);
  const added = await addDeal(request, name, {
    organization_id: organization.id,
    main_contact_id: contact.id,
    ...deal,
  });
  return { organization, contact, deal: added };
}

export async function chooseInPicker(page: Page, label: string, name: string) {
  // Exact, or "Organization" would also find the top bar's search box.
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page
    .getByRole("dialog")
    .last()
    .getByPlaceholder(/^Search /)
    .fill(name);
  await page.getByRole("option", { name }).first().click();
}

export function column(page: Page, stage: string) {
  return page.getByTestId(`column-${stage}`);
}

export function card(page: Page, name: string) {
  return page.locator(`[data-deal="${name}"]`);
}

export async function cardOrder(page: Page, stage: string) {
  return column(page, stage)
    .locator("[data-deal]")
    .evaluateAll((cards) => cards.map((item) => item.getAttribute("data-deal")));
}

type Spot = { x: number; y: number };

/** Drags with several small moves, because dnd-kit needs to see the pointer travel. */
export async function dragTo(page: Page, name: string, spot: Spot) {
  const box = (await card(page, name).boundingBox())!;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y + 8, { steps: 3 });
  await page.mouse.move(spot.x, spot.y, { steps: 12 });
  await page.mouse.move(spot.x, spot.y + 1);
  await page.mouse.up();
}

/** Drops just above the named card. */
export async function dropAbove(page: Page, name: string, target: string) {
  const box = (await card(page, target).boundingBox())!;
  await dragTo(page, name, { x: box.x + box.width / 2, y: box.y + 4 });
}

/** Drops at the end of a column, scrolling it there first if it's long. */
export async function dropAtEnd(page: Page, name: string, stage: string) {
  await page.getByTestId(`cards-${stage}`).evaluate((list) => {
    list.scrollTop = list.scrollHeight;
  });
  const box = (await column(page, stage).boundingBox())!;
  await dragTo(page, name, { x: box.x + box.width / 2, y: box.y + box.height - 20 });
}

/**
 * Moves a card, by dragging or with the keys, then waits until the server has saved
 * that move. The board shows a move before it's saved, and waiting for the network
 * to go quiet returns at once on a page that has already loaded. Moves are saved one
 * at a time, in order, so this also means every earlier move is saved.
 */
export async function savedMove(page: Page, name: string, move: () => Promise<void>) {
  const id = await card(page, name).getAttribute("data-deal-id");
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === `/api/deals/${id}/move`,
  );
  await move();
  const reply = await saved;
  if (!reply.ok()) throw new Error(`Moving ${name} failed: ${reply.status()} ${await reply.text()}`);
}

/** Presses keys at a person's pace, so the board has drawn each step before the next. */
export async function pressKeys(page: Page, ...keys: string[]) {
  for (const key of keys) {
    await page.keyboard.press(key);
    await page.waitForTimeout(80);
  }
}

export const COPY_WEB_PORT = stack.copyWebPort;
export const COPY_API_PORT = stack.copyApiPort;
export const COPY_URL = `http://127.0.0.1:${COPY_WEB_PORT}`;
/** The address the app prints. Tests use the number, so a slow name lookup can't stall them. */
export const COPY_ADDRESS = `http://localhost:${COPY_WEB_PORT}`;

/** A separate copy of the app, for tests that stop and restart it. */
export type AppCopy = {
  output: () => string;
  stop: (signal?: NodeJS.Signals) => Promise<number | null>;
};

export function makeCopyFolder() {
  const folder = mkdtempSync(path.join(tmpdir(), "accountable-copy-"));
  return {
    folder,
    database: path.join(folder, "copy.db"),
    remove: () => rmSync(folder, { recursive: true, force: true }),
  };
}

export function copyEnv(database: string, extra: Record<string, string> = {}) {
  return {
    ...process.env,
    ACCOUNTABLE_DB: database,
    ACCOUNTABLE_WEB_PORT: String(COPY_WEB_PORT),
    ACCOUNTABLE_API_PORT: String(COPY_API_PORT),
    ACCOUNTABLE_VITE_CACHE: `${database}.vite`,
    ...extra,
  };
}

function trackedProcess(child: ChildProcess) {
  let output = "";
  child.stdout?.on("data", (chunk) => (output += chunk));
  child.stderr?.on("data", (chunk) => (output += chunk));
  const exited = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));
  return { output: () => output, exited };
}

export function runDevScript(env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, ["scripts/dev.mjs"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  return { child, ...trackedProcess(child) };
}

export async function startCopy(database: string, extra: Record<string, string> = {}): Promise<AppCopy> {
  const { child, output, exited } = runDevScript(copyEnv(database, extra));
  const deadline = Date.now() + 60_000;
  while (!output().includes("Accountable is running at")) {
    if (Date.now() > deadline || child.exitCode !== null) {
      // Stopped like Ctrl+C, so a slow start doesn't leave servers on this worker's copy ports.
      child.kill("SIGINT");
      await exited;
      throw new Error(`The copy didn't start:\n${output()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return {
    output,
    stop: (signal = "SIGINT") => {
      child.kill(signal);
      return exited;
    },
  };
}

export function portIsOpen(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

export function dataCommand(database: string, command: "seed" | "empty", extra: string[] = [], input?: string) {
  try {
    return execFileSync("npm", ["run", "--silent", command, "--", ...extra], {
      cwd: ROOT,
      env: copyEnv(database),
      input: input ?? "",
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf8",
    });
  } catch (error) {
    return (error as { stdout?: string }).stdout ?? "";
  }
}

const HOLD_WRITES = `
import os, sqlite3, sys
connection = sqlite3.connect(os.environ["ACCOUNTABLE_DB"], isolation_level=None)
connection.execute("BEGIN IMMEDIATE")
print("locked", flush=True)
sys.stdin.read()
connection.execute("COMMIT")
`;

/**
 * Makes saves really slow, the way a running npm run seed does, with nothing faked
 * in the browser. Saves wait until the function this returns is called.
 */
export async function holdDatabaseWrites() {
  const child = spawn("uv", ["run", "--no-sync", "python", "-c", HOLD_WRITES], {
    cwd: ROOT,
    env: stackEnv,
    stdio: ["pipe", "pipe", "inherit"],
  });
  await new Promise<void>((resolve) => child.stdout!.once("data", () => resolve()));
  return () => child.stdin!.end();
}

export function fillToLimits() {
  execFileSync("uv", ["run", "--no-sync", "python", "backend/tests/limits_data.py"], {
    cwd: ROOT,
    env: stackEnv,
    stdio: "pipe",
  });
}

/** Picks up a card and holds it over a spot, leaving the mouse button down. */
export async function holdOver(page: Page, name: string, spot: Spot) {
  const box = (await card(page, name).boundingBox())!;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y + 8, { steps: 3 });
  await page.mouse.move(spot.x, spot.y, { steps: 12 });
  await page.mouse.move(spot.x, spot.y + 1);
}
