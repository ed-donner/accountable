import { describe, expect, it } from "vitest";

import { MAX_RUNS, MAX_WORKERS, RUN_PORTS, chooseWorkers, stackFor, workerPorts } from "./test-plan.mjs";

describe("chooseWorkers", () => {
  it("uses 6 workers on 10 cores, the most that still made the tests faster", () => {
    expect(chooseWorkers({ cores: 10, memoryGb: 32 })).toBe(6);
  });

  it("scales down with fewer cores", () => {
    expect(chooseWorkers({ cores: 8, memoryGb: 32 })).toBe(4);
    expect(chooseWorkers({ cores: 4, memoryGb: 32 })).toBe(2);
    expect(chooseWorkers({ cores: 2, memoryGb: 32 })).toBe(1);
  });

  it("scales down with less memory, whatever the cores", () => {
    expect(chooseWorkers({ cores: 16, memoryGb: 8 })).toBe(4);
    expect(chooseWorkers({ cores: 16, memoryGb: 6 })).toBe(2);
  });

  it("always keeps one worker, however small the machine", () => {
    expect(chooseWorkers({ cores: 1, memoryGb: 2 })).toBe(1);
  });

  it("never goes past the ports set aside for workers", () => {
    expect(chooseWorkers({ cores: 256, memoryGb: 1024 })).toBe(MAX_WORKERS);
  });

  it("shares the machine with the other runs busy on it", () => {
    expect(chooseWorkers({ cores: 10, memoryGb: 32, otherRuns: 1 })).toBe(3);
    expect(chooseWorkers({ cores: 10, memoryGb: 32, otherRuns: 2 })).toBe(2);
    expect(chooseWorkers({ cores: 10, memoryGb: 32, otherRuns: 9 })).toBe(1);
  });

  it("lets a chosen number win, for a run on a busy machine", () => {
    expect(chooseWorkers({ cores: 10, memoryGb: 32, requested: "2" })).toBe(2);
    expect(chooseWorkers({ cores: 10, memoryGb: 32, requested: "6", otherRuns: 1 })).toBe(6);
  });

  it.each(["0", "-1", "1.5", "lots", "65"])("refuses a chosen number of %s", (requested) => {
    expect(() => chooseWorkers({ cores: 10, memoryGb: 32, requested })).toThrow("ACCOUNTABLE_TEST_WORKERS");
  });
});

describe("stackFor", () => {
  const database = "/tmp/run/test.db";
  const everyPort = [
    RUN_PORTS.speedTurn,
    ...RUN_PORTS.slots,
    ...Array.from({ length: MAX_RUNS }, (_, slot) => workerPorts(slot, MAX_WORKERS)).flat(),
  ];

  it("gives each worker its own ports and database", () => {
    const first = stackFor({ slot: 0, worker: 0, database });
    const second = stackFor({ slot: 0, worker: 1, database });
    for (const key of ["webPort", "apiPort", "copyWebPort", "copyApiPort", "database"]) {
      expect(first[key]).not.toBe(second[key]);
    }
  });

  it("gives the same worker in another slot, such as another worktree's run, ports of its own", () => {
    const there = workerPorts(1, 1);
    expect(workerPorts(0, 1).filter((port) => there.includes(port))).toEqual([]);
  });

  it("keeps every worker's database in the run's temporary folder", () => {
    expect(stackFor({ slot: 2, worker: 3, database }).database).toBe("/tmp/run/worker-3/test.db");
  });

  it("lists every port a slot's workers get", () => {
    const { webPort, apiPort, copyWebPort, copyApiPort } = stackFor({ slot: 1, worker: 2, database });
    const listed = workerPorts(1, 3);
    expect(listed).toHaveLength(12);
    expect(listed).toEqual(expect.arrayContaining([webPort, apiPort, copyWebPort, copyApiPort]));
  });

  it("never lets one port reach another, at the most runs and workers", () => {
    expect(new Set(everyPort).size).toBe(everyPort.length);
    expect(everyPort).toHaveLength(1 + MAX_RUNS + MAX_RUNS * MAX_WORKERS * 4);
  });

  it("stays clear of the app's own ports, the older test ports and the ports handed out for connections", () => {
    for (const port of everyPort) {
      // Past npm run dev's 5173 and 8765, npm start's 8000, and the 5200 to 8963 that tests used before slots.
      expect(port).toBeGreaterThan(8963);
      // Linux hands out ports for connections from 32768, and macOS and Windows from 49152.
      expect(port).toBeLessThan(32768);
    }
  });
});
