import net from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { joinTestRuns } from "./test-runs.mjs";

const POLL_MS = 10;
// Long enough that a run nothing was holding back would have gone on by then.
const SETTLE_MS = 100;
// For a run that looks rarely, so that a run polling every POLL_MS has every chance to get in before it.
const SLOW_POLL_MS = 300;

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

/** Listens on a turn's port as a run does, answering "turn". */
function holdTurn(port) {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => socket.end("turn"));
    servers.push(server);
    server.listen(port, "127.0.0.1", () => resolve(server));
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

/** The speed tests' turn, the slots and the two turns to go. */
async function testPorts({ slots = 2 } = {}) {
  const [speedTurn, ...others] = await someFreePorts(1 + slots + 2);
  return { speedTurn, slots: others.slice(0, slots), turns: others.slice(slots) };
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

  it("tells the other runs it's busy from its turn until its speed tests", async () => {
    const ports = await testPorts();
    const run = await join(ports);
    const other = await join(ports);
    expect(await other.otherBusyRuns()).toBe(0);
    await run.takeTurn();
    expect(await other.otherBusyRuns()).toBe(1);
    await (
      await run.takeSpeedTurn()
    )();
    expect(await other.otherBusyRuns()).toBe(0);
  });

  it("lets no more than two runs go at once, and the next waits for a turn, saying so", async () => {
    const ports = await testPorts({ slots: 3 });
    const first = await join(ports);
    const second = await join(ports);
    const third = await join(ports);
    await first.takeTurn();
    await second.takeTurn();

    const onWait = vi.fn();
    const turn = third.takeTurn(onWait);
    expect(await settles(turn)).toBe(false);
    expect(onWait).toHaveBeenCalledTimes(1);
    expect(onWait).toHaveBeenCalledWith({ waitingFor: "turn", ahead: 0 });
    expect(await third.otherBusyRuns()).toBe(2);

    await first.leave();
    await turn;
    expect(await second.otherBusyRuns()).toBe(1);
  });

  it("says why it's waiting once the reason lasts, not while the runs that came first take the free turns", async () => {
    const ports = await testPorts({ slots: 3 });
    const runs = [await join(ports), await join(ports), await join(ports)];
    const onWait = vi.fn();
    const turns = runs.map((run) => run.takeTurn(onWait));

    await pause(SETTLE_MS);
    expect(onWait).toHaveBeenCalledExactlyOnceWith({ waitingFor: "turn", ahead: 0 });

    await Promise.all(runs.map((run) => run.leave()));
    await Promise.all(turns);
  });

  it("never takes a turn another run holds, even before that run says it's busy", async () => {
    const ports = await testPorts();
    const [, second] = await Promise.all(ports.turns.map(holdTurn));
    const run = await join(ports);

    const turn = run.takeTurn();
    expect(await settles(turn)).toBe(false);

    await close(second);
    await turn;
  });

  it("gives the turns in the order the runs started waiting, whatever their slots", async () => {
    const ports = await testPorts({ slots: 4 });
    const first = await join(ports);
    const second = await join(ports);
    await first.takeTurn();
    await second.takeTurn();
    const lowerSlot = await join(ports);
    const higherSlot = await join(ports, { pollMs: SLOW_POLL_MS });

    const earlierTurn = higherSlot.takeTurn();
    expect(await settles(earlierTurn)).toBe(false);
    const laterWaits = vi.fn();
    const laterTurn = lowerSlot.takeTurn(laterWaits);
    expect(await settles(laterTurn)).toBe(false);
    expect(laterWaits).toHaveBeenCalledWith({ waitingFor: "turn", ahead: 1 });

    await first.leave();
    expect(await settles(laterTurn)).toBe(false);
    await earlierTurn;
    expect(await settles(laterTurn)).toBe(false);

    await second.leave();
    await laterTurn;
  });

  it("starts the speed tests only once no other run is busy, and says once that it's waiting", async () => {
    const ports = await testPorts();
    const busy = await join(ports);
    const speed = await join(ports);
    await busy.takeTurn();

    const onWait = vi.fn();
    const turn = speed.takeSpeedTurn(onWait);
    expect(await settles(turn)).toBe(false);
    expect(onWait).toHaveBeenCalledTimes(1);

    await busy.leave();
    await (
      await turn
    )();
  });

  it("waits for a turn while another run has the speed tests' turn", async () => {
    const ports = await testPorts();
    const speed = await join(ports);
    const other = await join(ports);
    const handBack = await speed.takeSpeedTurn();

    const onWait = vi.fn();
    const busy = other.takeTurn(onWait);
    expect(await settles(busy)).toBe(false);
    expect(onWait).toHaveBeenCalledWith({ waitingFor: "speed tests" });
    expect(await speed.otherBusyRuns()).toBe(0);

    await handBack();
    await busy;
    expect(await speed.otherBusyRuns()).toBe(1);
  });

  it("lets every run that has finished its end-to-end tests have its speed tests before the next run gets a turn", async () => {
    const ports = await testPorts({ slots: 3 });
    const first = await join(ports);
    const second = await join(ports, { pollMs: SLOW_POLL_MS });
    const waiting = await join(ports);
    await second.takeTurn();
    const firstSpeedTurn = first.takeSpeedTurn();
    expect(await settles(firstSpeedTurn)).toBe(false);

    const onWait = vi.fn();
    const turn = waiting.takeTurn(onWait);
    const secondSpeedTurn = second.takeSpeedTurn();
    // A run waiting for a turn isn't busy, so the speed tests don't wait for it.
    await (
      await firstSpeedTurn
    )();
    expect(await settles(turn)).toBe(false);
    expect(onWait).toHaveBeenCalledExactlyOnceWith({ waitingFor: "speed tests" });

    await (
      await secondSpeedTurn
    )();
    await turn;
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

  it("takes the turn from a run handing it back, which can drop a connection without answering", async () => {
    const ports = await testPorts();
    // As a run closes its turn, a connection the system has already taken can end with no answer.
    const handingBack = net.createServer((socket) => {
      socket.end();
      handingBack.close();
    });
    await new Promise((resolve) => handingBack.listen(ports.speedTurn, "127.0.0.1", resolve));
    const run = await join(ports);
    await (
      await run.takeSpeedTurn()
    )();
  });

  it("stops with a message when other programs have the turns' ports", async () => {
    const ports = await testPorts();
    const turns = [await anotherProgramsPort(), await anotherProgramsPort()];
    const run = await join({ ...ports, turns });
    await expect(run.takeTurn()).rejects.toThrow(`Port ${turns[0]} is in use by another program`);
  });

  it("stops with a message when another program has the speed tests' port", async () => {
    const ports = await testPorts();
    const speedTurn = await anotherProgramsPort();
    const run = await join({ ...ports, speedTurn });
    await expect(run.takeSpeedTurn()).rejects.toThrow(`Port ${speedTurn} is in use by another program`);
  });
});
