// npm run seed and npm run empty: setup, then cli.py with the keyboard attached.

import { runSync, setup } from "./setup.mjs";

setup();

const command = ["run", "--no-sync", "python", "-m", "accountable.cli", ...process.argv.slice(2)];
process.exit(runSync("uv", command).status ?? 1);
