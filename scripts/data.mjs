// npm run seed and npm run empty: setup, then cli.py with the keyboard attached.
// They only ever touch the local copy, so the shared app's settings are left out.

import { localEnv, runSync, setup } from "./setup.mjs";

setup();

const command = ["run", "--no-sync", "python", "-m", "accountable.cli", ...process.argv.slice(2)];
process.exit(runSync("uv", command, { env: localEnv() }).status ?? 1);
