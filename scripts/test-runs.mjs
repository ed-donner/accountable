// Lets the test runs on this computer share it, such as npm run check in several worktrees at once.
//
// Each run holds a slot by listening on the slot's port, and the slot reserves a block of
// ports for the run's servers. The operating system frees a port when the run ends, even if
// it crashes, so there's no lock file to clean up after it. A run says what it's doing to
// anyone who connects to its slot's port.
//
// More than two runs at once overload the computer, so a run waits for a turn before its
// checks, and holds it through its end-to-end tests, by listening on the turn's port. Runs
// waiting for a turn queue in the order they joined, so each gets one in the end.
//
// The speed tests need a quiet machine. One run at a time holds the speed tests' turn, and
// starts them once no other run is busy. Runs waiting for a turn let the speed tests of a run
// that's finished its end-to-end tests go first, so the speed tests' turn comes in the end too.

import net from "node:net";

import { portIsFree } from "./setup.mjs";
import { RUN_PORTS } from "./test-plan.mjs";

const HOST = "127.0.0.1";

// What a run says on its slot's port.
const IDLE = "idle";
const QUEUED = "queued";
// Has a turn: running its checks or end-to-end tests. Runs on older branches look for this word.
const BUSY = "busy";
// Has finished its end-to-end tests, and is waiting for its speed tests or running them.
const SPEED = "speed";

// What a turn's port says.
const TURN = "turn";
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

/**
 * A turn that one run at a time holds, by listening on its port. The function it returns
 * tries to take the turn, and resolves the server that holds it, or null while a run has it.
 */
function turnAt(port, name) {
  let strangerAnswered = false;
  return async function take() {
    const turn = await listen(port, () => name);
    if (turn) return turn;
    const holder = await ask(port);
    const stranger = holder !== null && holder !== name;
    // A run handing the turn back can drop a connection unanswered as it closes, as another
    // program would answer. That run is gone by the next try, and another program isn't.
    if (stranger && strangerAnswered) {
      throw new Error(`Port ${port} is in use by another program, and the test runs need it to take turns.`);
    }
    strangerAnswered = stranger;
    return null;
  };
}

/** What another run says on its slot's port, and when it joined the queue, if it's waiting there. */
function readRun(reply, slot) {
  const [state, joined] = (reply ?? "").split(" ");
  return { slot, state, joined: Number(joined) };
}

function once(callback = () => {}) {
  let called = false;
  return () => {
    if (!called) callback();
    called = true;
  };
}

/**
 * Calls tell(reason) once a reason has held for two looks in a row, and not again until
 * another has. A reason that lasts one look, such as runs that joined the queue a moment
 * earlier and are taking the free turns, would be out of date as soon as it was said.
 */
function onLastingChange(tell = () => {}) {
  let seen = null;
  let told = null;
  return (reason) => {
    const key = JSON.stringify(reason);
    if (key === seen && key !== told) {
      tell(reason);
      told = key;
    }
    seen = key;
  };
}

/**
 * Takes a slot for this run. portsFor(slot) lists the ports the run's servers would use in
 * that slot, and a slot with any of them taken is passed over.
 */
export async function joinTestRuns({ ports = RUN_PORTS, portsFor = () => [], pollMs = 250 } = {}) {
  let state = IDLE;
  let joinedQueue = null;
  const say = () => (state === QUEUED ? `${QUEUED} ${joinedQueue}` : state);
  const { slot, server } = await claimSlot(ports.slots, portsFor, say);

  const others = ports.slots.map((port, index) => ({ port, slot: index })).filter((other) => other.slot !== slot);
  const turns = ports.turns.map((port) => turnAt(port, TURN));
  const takeSpeedTurnPort = turnAt(ports.speedTurn, SPEED_TURN);
  let turn = null;

  const otherRuns = async () =>
    (await Promise.all(others.map((other) => ask(other.port)))).map((reply, index) =>
      readRun(reply, others[index].slot),
    );
  const otherBusyRuns = async () => (await otherRuns()).filter((run) => run.state === BUSY).length;
  const speedTestsGoFirst = async (runs) =>
    runs.some((run) => run.state === SPEED) || (await ask(ports.speedTurn)) === SPEED_TURN;
  // The same moment goes to the lower slot, so every run agrees on the order.
  const isAhead = (run) =>
    run.state === QUEUED && (run.joined < joinedQueue || (run.joined === joinedQueue && run.slot < slot));

  async function takeFreeTurn() {
    for (const take of turns) {
      const taken = await take();
      if (taken) return taken;
    }
    return null;
  }

  async function handBackTurn() {
    if (turn) await close(turn);
    turn = null;
  }

  /** Takes a turn and gets busy, if it can. Resolves null once it has, or the reason it has to wait. */
  async function tryToGo() {
    const runs = await otherRuns();
    if (await speedTestsGoFirst(runs)) return { waitingFor: "speed tests" };
    const ahead = runs.filter(isAhead).length;
    const freeTurns = turns.length - runs.filter((run) => run.state === BUSY).length;
    if (ahead >= freeTurns) return { waitingFor: "turn", ahead };
    turn = await takeFreeTurn();
    if (!turn) return { waitingFor: "turn", ahead };

    // Busy first, then the look at the speed tests, so a run starting them at the same moment sees this one.
    state = BUSY;
    if (!(await speedTestsGoFirst(await otherRuns()))) return null;
    state = QUEUED;
    await handBackTurn();
    return { waitingFor: "speed tests" };
  }

  /**
   * Waits for a turn, behind the runs that joined the queue first and any run's speed tests,
   * then tells the others this run is busy. onWait gets the reason to wait, each time a new
   * one lasts: { waitingFor: "speed tests" }, or { waitingFor: "turn", ahead } with the number
   * of runs ahead of this one in the queue.
   */
  async function takeTurn(onWait) {
    const tell = onLastingChange(onWait);
    joinedQueue = Date.now();
    state = QUEUED;
    for (;;) {
      const reason = await tryToGo();
      if (!reason) return;
      tell(reason);
      await pause(pollMs);
    }
  }

  /**
   * Hands this run's turn back, takes the speed tests' turn, then waits until no other run
   * is busy. Resolves with a function that hands the speed tests' turn back.
   */
  async function takeSpeedTurn(onWait) {
    const waiting = once(onWait);
    // Before the turn goes back, so the run at the front of the queue lets these speed tests go first.
    state = SPEED;
    await handBackTurn();
    let speedTurn;
    while (!(speedTurn = await takeSpeedTurnPort())) {
      waiting();
      await pause(pollMs);
    }
    while ((await otherBusyRuns()) > 0) {
      waiting();
      await pause(pollMs);
    }
    return async () => {
      state = IDLE;
      await close(speedTurn);
    };
  }

  return {
    slot,
    otherBusyRuns,
    takeTurn,
    takeSpeedTurn,
    leave: async () => {
      await handBackTurn();
      await close(server);
    },
  };
}
