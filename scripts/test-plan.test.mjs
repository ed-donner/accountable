import { describe, expect, it } from "vitest";

import { MAX_WORKERS, chooseWorkers, stackFor } from "./test-plan.mjs";

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

  it("lets a chosen number win, for a run on a busy machine", () => {
    expect(chooseWorkers({ cores: 10, memoryGb: 32, requested: "2" })).toBe(2);
  });

  it.each(["0", "-1", "1.5", "lots", "65"])("refuses a chosen number of %s", (requested) => {
    expect(() => chooseWorkers({ cores: 10, memoryGb: 32, requested })).toThrow("ACCOUNTABLE_TEST_WORKERS");
  });
});

describe("stackFor", () => {
  it("gives each worker its own ports and database", () => {
    const first = stackFor(0, "/tmp/run/test.db");
    const second = stackFor(1, "/tmp/run/test.db");
    for (const key of ["webPort", "apiPort", "copyWebPort", "copyApiPort", "database"]) {
      expect(first[key]).not.toBe(second[key]);
    }
  });

  it("keeps every worker's database in the run's temporary folder", () => {
    expect(stackFor(3, "/tmp/run/test.db").database).toBe("/tmp/run/worker-3/test.db");
  });

  it("never lets one range of ports reach another, even at the most workers", () => {
    const ports = (index) =>
      Object.values(stackFor(index, "/tmp/run/test.db")).filter((value) => typeof value === "number");
    const all = Array.from({ length: MAX_WORKERS }, (_, index) => ports(index)).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all).not.toContain(5173);
    expect(all).not.toContain(8765);
  });
});
