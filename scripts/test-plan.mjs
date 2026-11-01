// How npm test shares out the machine. Used by the test scripts, playwright.config.ts
// and the end-to-end helpers, so they all agree on where each worker's servers are.

import path from "node:path";

export const READY = "All test servers are up.";

export const MAX_WORKERS = 64;

// Measured on 10 cores: the time stops falling at 6 workers, and 8 to 12 are slower,
// because each worker is a browser, a backend and a Vite server.
const WORKERS_PER_CORE = 0.6;
// Each worker adds about 1GB, and the machine needs room for everything else it's doing.
const GB_PER_WORKER = 1;
const GB_SET_ASIDE = 4;

/** Starts from cores and memory, so a smaller machine gets fewer workers rather than failures. */
export function chooseWorkers({ cores, memoryGb, requested }) {
  if (requested) {
    const count = Number(requested);
    if (!Number.isInteger(count) || count < 1 || count > MAX_WORKERS) {
      throw new Error(`ACCOUNTABLE_TEST_WORKERS must be a whole number from 1 to ${MAX_WORKERS}, not "${requested}".`);
    }
    return count;
  }
  const byCores = Math.floor(cores * WORKERS_PER_CORE);
  const byMemory = Math.floor((memoryGb - GB_SET_ASIDE) / GB_PER_WORKER);
  return Math.max(1, Math.min(byCores, byMemory, MAX_WORKERS));
}

/** Everything one Playwright worker has to itself, so workers can run side by side. */
export function stackFor(index, database) {
  return {
    webPort: 5200 + index,
    apiPort: 8800 + index,
    copyWebPort: 5300 + index,
    copyApiPort: 8900 + index,
    database: path.join(path.dirname(database), `worker-${index}`, path.basename(database)),
  };
}
