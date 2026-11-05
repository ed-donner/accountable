import net from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { joinTestRuns } from "./test-runs.mjs";

const POLL_MS = 10;
// Long enough that a run nothing was holding back would have gone on by then.
const SETTLE_MS = 100;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const servers = [];
const runs = [];

afterEach(async () => {
  await Promise.all(runs.splice(0).map((run) => run.leave()));
  await Promise.all(servers.splice(0).map(close));
});

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

/** Listens on a port the system picks, answering with nothing, like a program that isn't a test run. */
function listenAnywhere() {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => socket.end());
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function anotherProgramsPort() {
  const server = await listenAnywhere();
  servers.push(server);
  return server.address().port;
}

/** Ports the system says are free, so these tests never touch a real run's ports. */
async function someFreePorts(count) {
  const held = await Promise.all(Array.from({ length: count }, listenAnywhere));
  const ports = held.map((server) => server.address().port);
  await Promise.all(held.map(close));
  return ports;
}

/** The speed tests' turn and two slots. */
async function testPorts() {
  const [speedTurn, ...slotPorts] = await someFreePorts(3);
  return { speedTurn, slots: slotPorts };
}

async function join(ports, options = {}) {
  const run = await joinTestRuns({ ports, pollMs: POLL_MS, ...options });
  runs.push(run);
  return run;
}

/** Whether the promise has settled within SETTLE_MS. */
async function settles(promise) {
  let settled = false;
  promise.then(() => (settled = true));
  await pause(SETTLE_MS);
  return settled;
}

describe("joinTestRuns", () => {
  it("gives two runs at once different slots, and a slot back once its run leaves", async () => {
    const ports = await testPorts();
    const first = await join(ports);
    const second = await join(ports);
    expect(second.slot).not.toBe(first.slot);

    await first.leave();
    expect((await join(ports)).slot).toBe(first.slot);
  });

  it("passes over a slot where another program has one of the run's ports", async () => {
    const ports = await testPorts();
    const taken = await anotherProgramsPort();
    const run = await join(ports, { portsFor: (slot) => (slot === 0 ? [taken] : []) });
    expect(run.slot).toBe(1);
  });

  it("says plainly when every slot is taken", async () => {
    const ports = await testPorts();
    await join(ports);
    await join(ports);
    await expect(join(ports)).rejects.toThrow("There are already 2 test runs on this computer");
  });

  it("tells the other runs when it's busy", async () => {
    const ports = await testPorts();
    const run = await join(ports);
    const other = await join(ports);
    expect(await other.otherBusyRuns()).toBe(0);
    await run.startBusy();
    expect(await other.otherBusyRuns()).toBe(1);
    run.stopBusy();
    expect(await other.otherBusyRuns()).toBe(0);
  });

  it("starts the speed tests only once no other run is busy, and says once that it's waiting", async () => {
    const ports = await testPorts();
    const busy = await join(ports);
    const speed = await join(ports);
    await busy.startBusy();

    const onWait = vi.fn();
    const turn = speed.takeSpeedTurn(onWait);
    expect(await settles(turn)).toBe(false);
    expect(onWait).toHaveBeenCalledTimes(1);

    busy.stopBusy();
    await (
      await turn
    )();
  });

  it("waits to get busy while another run has the speed tests' turn", async () => {
    const ports = await testPorts();
    const speed = await join(ports);
    const other = await join(ports);
    const handBack = await speed.takeSpeedTurn();

    const busy = other.startBusy();
    expect(await settles(busy)).toBe(false);
    expect(await speed.otherBusyRuns()).toBe(0);

    await handBack();
    await busy;
    expect(await speed.otherBusyRuns()).toBe(1);
  });

  it("gives the speed tests' turn to one run at a time", async () => {
    const ports = await testPorts();
    const first = await join(ports);
    const second = await join(ports);
    const handBack = await first.takeSpeedTurn();

    const secondTurn = second.takeSpeedTurn();
    expect(await settles(secondTurn)).toBe(false);

    await handBack();
    await (
      await secondTurn
    )();
  });

  it("stops with a message when another program has the speed tests' port", async () => {
    const ports = await testPorts();
    const speedTurn = await anotherProgramsPort();
    const run = await join({ ...ports, speedTurn });
    await expect(run.takeSpeedTurn()).rejects.toThrow(`Port ${speedTurn} is in use by another program`);
  });
});
