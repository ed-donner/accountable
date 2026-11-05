// How npm test shares out the machine. Used by the test scripts, playwright.config.ts
// and the end-to-end helpers, so they all agree on where each worker's servers are.

import path from "node:path";

export const READY = "All test servers are up.";

export const MAX_WORKERS = 64;

/** The most runs of npm test, npm run check and check:quick this computer can have at once, going or waiting, such as one in each worktree. */
export const MAX_RUNS = 16;

/** The most runs that go at once. The rest wait their turn, because three at once overload a 10-core Mac and its tests time out. */
export const TURNS = 2;

// Measured on 10 cores: the time stops falling at 6 workers, and 8 to 12 are slower,
// because each worker is a browser, a backend and a Vite server.
const WORKERS_PER_CORE = 0.6;
// Each worker adds about 1GB, and the machine needs room for everything else it's doing.
const GB_PER_WORKER = 1;
const GB_SET_ASIDE = 4;

// Clear of npm run dev's 5173 and 8765, npm start's 8000, the ports from 5200 to 8963 that
// tests on older branches use, and the ports macOS, Linux and Windows hand out for connections.
const FIRST_PORT = 20000;
const PORTS_PER_WORKER = 4;

const FIRST_WORKER_PORT = FIRST_PORT + 1 + MAX_RUNS;
// After every worker's ports, so that none of the ports from before there were turns moved.
const FIRST_TURN_PORT = FIRST_WORKER_PORT + MAX_RUNS * MAX_WORKERS * PORTS_PER_WORKER;

/**
 * The ports the runs on this computer share it through: one for the speed tests' turn, one for
 * each run's slot, and one for each turn to go.
 */
export const RUN_PORTS = {
  speedTurn: FIRST_PORT,
  slots: Array.from({ length: MAX_RUNS }, (_, slot) => FIRST_PORT + 1 + slot),
  turns: Array.from({ length: TURNS }, (_, turn) => FIRST_TURN_PORT + turn),
};

/**
 * Starts from cores and memory, so a smaller machine gets fewer workers rather than failures,
 * then shares them with the other runs busy on this computer.
 */
export function chooseWorkers({ cores, memoryGb, requested, otherRuns = 0 }) {
  if (requested) {
    const count = Number(requested);
    if (!Number.isInteger(count) || count < 1 || count > MAX_WORKERS) {
      throw new Error(`ACCOUNTABLE_TEST_WORKERS must be a whole number from 1 to ${MAX_WORKERS}, not "${requested}".`);
    }
    return count;
  }
  const byCores = Math.floor(cores * WORKERS_PER_CORE);
  const byMemory = Math.floor((memoryGb - GB_SET_ASIDE) / GB_PER_WORKER);
  const forTheMachine = Math.min(byCores, byMemory, MAX_WORKERS);
  return Math.max(1, Math.floor(forTheMachine / (otherRuns + 1)));
}

function portsFor(slot, worker) {
  const first = FIRST_WORKER_PORT + (slot * MAX_WORKERS + worker) * PORTS_PER_WORKER;
  return { webPort: first, apiPort: first + 1, copyWebPort: first + 2, copyApiPort: first + 3 };
}

/** Everything one Playwright worker has to itself, so workers, and runs in other worktrees, can run side by side. */
export function stackFor({ slot, worker, database }) {
  return {
    ...portsFor(slot, worker),
    database: path.join(path.dirname(database), `worker-${worker}`, path.basename(database)),
  };
}

/** Every port the first few workers in a slot would use, so a run can check they're free before it takes the slot. */
export function workerPorts(slot, workers) {
  return Array.from({ length: workers }, (_, worker) => Object.values(portsFor(slot, worker))).flat();
}
