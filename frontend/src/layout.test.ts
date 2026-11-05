import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SOURCE = path.dirname(fileURLToPath(import.meta.url));

function filesIn(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const file = path.join(folder, name);
    return statSync(file).isDirectory() ? filesIn(file) : [file];
  });
}

function code(folder: string) {
  return filesIn(path.join(SOURCE, folder)).filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));
}

// Each business area's folder, found by its queries, so a later area is held to the rules too.
const AREAS = readdirSync(SOURCE).filter((name) => existsSync(path.join(SOURCE, name, "queries.ts")));

describe("the layout rules", () => {
  it("find every area", () => {
    expect(AREAS).toEqual(["crm", "products"]);
  });

  it.each(AREAS)("let only App.tsx name %s/, so components/, lib/ and every other area never import it", (area) => {
    const naming = code(".")
      .map((file) => path.relative(SOURCE, file))
      .filter((file) => !file.startsWith(`${area}/`) && !path.basename(file).startsWith("test-"))
      .filter((file) => new RegExp(`from "[^"]*/${area}/`).test(readFileSync(path.join(SOURCE, file), "utf8")));
    expect(naming).toEqual(["App.tsx"]);
  });
});

describe("the company settings", () => {
  it("are named only by App.tsx among the top-level files, components/ and lib/, which every area shares", () => {
    const shared = code(".")
      .map((file) => path.relative(SOURCE, file))
      .filter((file) => !file.includes("/") || file.startsWith("components/") || file.startsWith("lib/"))
      .filter((file) => !path.basename(file).startsWith("test-"));
    expect(shared).toContain("components/UserMenu.tsx"); // The check is looking in the right place.
    const namingCompany = shared.filter((file) =>
      /from "[^"]*\/company\//.test(readFileSync(path.join(SOURCE, file), "utf8")),
    );
    expect(namingCompany).toEqual(["App.tsx"]);
  });
});

describe("talking to the backend", () => {
  it("only happens in the fetch client, so every reply gets the same error handling", () => {
    const callers = filesIn(SOURCE)
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file) && !file.endsWith("test-utils.tsx"))
      .filter((file) => /\bfetch\(/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(SOURCE, file));
    expect(callers).toEqual(["lib/api.ts"]);
  });
});

describe("files that read data", () => {
  it("never pass a plain date to new Date, which reads it as UTC", () => {
    const allowed = /new Date\((\)|shown\))/; // shown comes from a date and time box, which has no zone either way.
    for (const file of code(".")) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (line.includes("new Date(")) expect(line, file).toMatch(allowed);
      }
    }
  });
});
