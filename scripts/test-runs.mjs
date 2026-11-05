// Lets the test runs on this computer share it, such as npm run check in two worktrees at once.
//
// Each run holds a slot by listening on the slot's port, and the slot reserves a block of
// ports for the run's servers. The operating system frees the port when the run ends, even
// if it crashes, so there's no lock file to clean up after it.
//
// The speed tests need a quiet machine. A run says whether it's busy, with its checks or its
// end-to-end tests, to anyone who connects to its slot's port. One run at a time holds the
// speed tests' turn, by listening on the turn's port, and starts them once no other run is
// busy. A run waits to get busy while another holds the turn, so the turn comes in the end.

import net from "node:net";

import { portIsFree } from "./setup.mjs";
import { RUN_PORTS } from "./test-plan.mjs";

const HOST = "127.0.0.1";
const BUSY = "busy";
const IDLE = "idle";
const SPEED_TURN = "speed tests";
// Only a program that isn't a test run takes this long, by taking the connection and saying nothing.
const ASK_TIMEOUT_MS = 5000;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Listens on the port, answering each connection with what say() returns. Resolves null if the port is taken. */
function listen(port, say) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      // A caller that gives up early resets the connection, which mustn't stop this run.
      socket.on("error", () => {});
      socket.end(say());
    });
    server.once("error", (error) => (error.code === "EADDRINUSE" ? resolve(null) : reject(error)));
    server.listen(port, HOST, () => resolve(server.unref()));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

/** What the program on this port says, or null if nothing is listening there. */
function ask(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, HOST);
    let connected = false;
    let reply = "";
    socket.setEncoding("utf8");
    socket.setTimeout(ASK_TIMEOUT_MS, () => socket.destroy());
    socket.on("connect", () => (connected = true));
    socket.on("data", (chunk) => (reply += chunk));
    socket.on("error", () => {});
    socket.on("close", () => resolve(connected ? reply : null));
  });
}

async function allFree(ports) {
  return (await Promise.all(ports.map(portIsFree))).every(Boolean);
}

/** The first slot that's free and whose servers' ports are all free too. */
async function claimSlot(slotPorts, portsFor, say) {
  for (const [slot, port] of slotPorts.entries()) {
    const server = await listen(port, say);
    if (!server) continue;
    if (await allFree(portsFor(slot))) return { slot, server };
    await close(server);
  }
  throw new Error(
    `There are already ${slotPorts.length} test runs on this computer, or other programs are using their ports. Wait for one to finish and try again.`,
  );
}

function once(callback = () => {}) {
  let called = false;
  return () => {
    if (!called) callback();
    called = true;
  };
}

/**
 * Takes a slot for this run. portsFor(slot) lists the ports the run's servers would use in
 * that slot, and a slot with any of them taken is passed over.
 */
export async function joinTestRuns({ ports = RUN_PORTS, portsFor = () => [], pollMs = 250 } = {}) {
  let state = IDLE;
  const { slot, server } = await claimSlot(ports.slots, portsFor, () => state);
  const otherSlots = ports.slots.filter((_, index) => index !== slot);

  const otherBusyRuns = async () => (await Promise.all(otherSlots.map(ask))).filter((reply) => reply === BUSY).length;
  const speedTurnIsTaken = async () => (await ask(ports.speedTurn)) === SPEED_TURN;

  /** Waits while another run has the speed tests' turn, then tells the others this run is busy. */
  async function startBusy(onWait) {
    const waiting = once(onWait);
    for (;;) {
      // Busy first, then the look at the turn, so a run taking the turn at the same moment sees this one.
      state = BUSY;
      if (!(await speedTurnIsTaken())) return;
      state = IDLE;
      waiting();
      while (await speedTurnIsTaken()) await pause(pollMs);
    }
  }

  /** Takes the speed tests' turn, then waits until no other run is busy. Resolves with a function that hands the turn back. */
  async function takeSpeedTurn(onWait) {
    const waiting = once(onWait);
    let turn;
    while (!(turn = await listen(ports.speedTurn, () => SPEED_TURN))) {
      const holder = await ask(ports.speedTurn);
      if (holder !== null && holder !== SPEED_TURN) {
        throw new Error(`Port ${ports.speedTurn} is in use by another program, and the speed tests need it.`);
      }
      waiting();
      await pause(pollMs);
    }
    while ((await otherBusyRuns()) > 0) {
      waiting();
      await pause(pollMs);
    }
    return () => close(turn);
  }

  return {
    slot,
    otherBusyRuns,
    startBusy,
    stopBusy: () => (state = IDLE),
    takeSpeedTurn,
    leave: () => close(server),
  };
}
