// TF17: the generated API types match the backend's current schema (R16).
import { readFileSync } from "node:fs";
import { generateTypes, TYPES_FILE } from "../../../scripts/types.mjs";

test(
  "api-types.ts is up to date with the backend (run `npm run types` if this fails)",
  async () => {
    const fresh = await generateTypes();
    expect(readFileSync(TYPES_FILE, "utf8")).toBe(fresh);
  },
  60_000,
);
