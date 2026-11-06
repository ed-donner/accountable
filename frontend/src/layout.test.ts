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
// The books have no queries yet, because their pages read nothing, so they're listed by name.
const AREAS = readdirSync(SOURCE).filter(
  (name) => name === "books" || existsSync(path.join(SOURCE, name, "queries.ts")),
);
// The areas the later ones build on. A later area, such as invoices, may import their
// queries, for their types and reads, and the CRM's deals.ts, such as which stages are
// open, and nothing else of theirs. Later areas never import each other, and the first
// ones never import them.
const FIRST_AREAS = ["crm", "products"];
// The one part of the books any area may import: the Accounting panel on its records (J19).
const SHARED_FROM_BOOKS = "books/AccountingPanel.tsx";
const BUILT_ON: Record<string, string[]> = {
  crm: ["crm/queries.ts", "crm/deals.ts"],
  products: ["products/queries.ts"],
  books: [SHARED_FROM_BOOKS],
};

function areaOf(file: string) {
  const first = file.split("/")[0];
  return AREAS.includes(first) ? first : undefined;
}

function isLaterArea(file: string) {
  const area = areaOf(file);
  return area !== undefined && !FIRST_AREAS.includes(area);
}

function laterAreaMayImport(target: string) {
  return Object.values(BUILT_ON).some((files) => files.includes(target));
}

/** The file an import names, as a path from src, such as "crm/queries.ts". */
function resolved(file: string, specifier: string) {
  const target = path.relative(SOURCE, path.resolve(path.dirname(path.join(SOURCE, file)), specifier));
  const found = ["", ".ts", ".tsx"].find((ending) => {
    const candidate = path.join(SOURCE, target + ending);
    return existsSync(candidate) && statSync(candidate).isFile();
  });
  return target + (found ?? "");
}

/** Every file in src that a file imports, as paths from src. */
function imported(file: string) {
  const source = readFileSync(path.join(SOURCE, file), "utf8");
  return [...source.matchAll(/from "(\.[^"]*)"/g)].map(([, specifier]) => resolved(file, specifier));
}

/** The app's own code, as paths from src, leaving out the tests' helpers. */
function appCode() {
  return code(".")
    .map((file) => path.relative(SOURCE, file))
    .filter((file) => !path.basename(file).startsWith("test-"));
}

describe("the layout rules", () => {
  it("find every area", () => {
    expect(AREAS).toEqual(["bills", "books", "cashflow", "crm", "invoices", "products", "quotes"]);
  });

  it("read where each import leads", () => {
    expect(imported("App.tsx")).toEqual(expect.arrayContaining(["crm/pages/Deal.tsx", "components/Shell.tsx"]));
  });

  it.each([
    ["crm/queries.ts", true],
    ["crm/deals.ts", true],
    ["products/queries.ts", true],
    ["books/AccountingPanel.tsx", true],
    ["books/queries.ts", false],
    ["books/EntryList.tsx", false],
    ["crm/pages/Deal.tsx", false],
    ["crm/StageChip.tsx", false],
    ["products/ProductForm.tsx", false],
  ])("let a later area import %s: %s", (target, allowed) => {
    expect(laterAreaMayImport(target)).toBe(allowed);
  });

  it.each(FIRST_AREAS)(
    "let only App.tsx and later areas import %s/, so components/, lib/ and the other first area never do",
    (area) => {
      const importing = appCode()
        .filter((file) => areaOf(file) !== area)
        .flatMap((file) => imported(file).map((target) => ({ file, target })))
        .filter(({ target }) => target.startsWith(`${area}/`));
      expect(importing.map(({ file }) => file)).toContain("App.tsx"); // The check is looking in the right place.
      const wrong = importing.filter(
        ({ file, target }) => file !== "App.tsx" && !(isLaterArea(file) && laterAreaMayImport(target)),
      );
      expect(wrong).toEqual([]);
    },
  );

  it.each(FIRST_AREAS)("never let %s/ import another area, later ones included", (area) => {
    const importing = appCode()
      .filter((file) => areaOf(file) === area)
      .flatMap((file) => imported(file).map((target) => ({ file, target })));
    expect(importing.some(({ target }) => target.startsWith(`${area}/`))).toBe(true); // Looking in the right place.
    expect(importing.filter(({ target }) => ![undefined, area].includes(areaOf(target)))).toEqual([]);
  });

  it("let invoices/ build only on what a later area may, and company/", () => {
    const importing = appCode()
      .filter((file) => areaOf(file) === "invoices")
      .flatMap((file) => imported(file))
      .filter((target) => !target.startsWith("invoices/") && areaOf(target) !== undefined);
    expect(importing).toContain("crm/queries.ts"); // The check is looking in the right place.
    expect(importing.filter((target) => !laterAreaMayImport(target))).toEqual([]);
  });

  it("never let a later area import another", () => {
    // The check is looking in the right place.
    expect(appCode().filter(isLaterArea)).toEqual(
      expect.arrayContaining(["bills/queries.ts", "invoices/queries.ts", "quotes/queries.ts"]),
    );
    const wrong = appCode()
      .filter(isLaterArea)
      .flatMap((file) => imported(file).map((target) => ({ file, target })))
      .filter(({ file, target }) => isLaterArea(target) && areaOf(target) !== areaOf(file))
      .filter(({ target }) => target !== SHARED_FROM_BOOKS);
    expect(wrong).toEqual([]);
  });
});

describe("the cash flow", () => {
  it("imports no area, the CRM's queries included", () => {
    const importing = appCode()
      .filter((file) => areaOf(file) === "cashflow")
      .flatMap((file) => imported(file).map((target) => ({ file, target })));
    expect(importing.some(({ target }) => target.startsWith("cashflow/"))).toBe(true); // Looking in the right place.
    expect(importing.filter(({ target }) => ![undefined, "cashflow"].includes(areaOf(target)))).toEqual([]);
  });
});

describe("the books", () => {
  const own = () => appCode().filter((file) => areaOf(file) === "books");
  const outsideImportsOfBooks = () =>
    appCode()
      .filter((file) => areaOf(file) !== "books")
      .flatMap((file) => imported(file).map((target) => ({ file, target })))
      .filter(({ target }) => areaOf(target) === "books");

  it("import no other area", () => {
    expect(own()).toContain("books/AccountingPanel.tsx"); // The check is looking in the right place.
    const importing = own().flatMap((file) => imported(file));
    expect(importing.filter((target) => ![undefined, "books"].includes(areaOf(target)))).toEqual([]);
  });

  it("are named by App.tsx and, for the Accounting panel alone, by the invoice and bill pages", () => {
    const wrong = outsideImportsOfBooks().filter(
      ({ file, target }) => file !== "App.tsx" && target !== SHARED_FROM_BOOKS,
    );
    expect(wrong).toEqual([]);
    const panelUsers = outsideImportsOfBooks()
      .filter(({ target }) => target === SHARED_FROM_BOOKS)
      .map(({ file }) => file);
    expect(panelUsers.sort()).toEqual(["bills/pages/Bill.tsx", "invoices/pages/Invoice.tsx"]);
  });

  it("let any area import the Accounting panel and nothing else of theirs", () => {
    const outside = outsideImportsOfBooks().filter(({ file }) => file !== "App.tsx");
    expect(outside.length).toBeGreaterThan(0); // The check is looking in the right place.
    expect(outside.every(({ target }) => target === SHARED_FROM_BOOKS)).toBe(true);
    // Anything else of the books named from another area would show up here.
    expect(outside.filter(({ target }) => target.startsWith("books/queries"))).toEqual([]);
  });

  it("keep the Accounting panel's own imports to the books and the shared parts", () => {
    const panel = imported("books/AccountingPanel.tsx");
    expect(panel.every((target) => [undefined, "books"].includes(areaOf(target)))).toBe(true);
  });
});

describe("the company settings", () => {
  it("never import an area, so the settings page shows the invoices' sample only through App.tsx", () => {
    const importing = appCode()
      .filter((file) => file.startsWith("company/"))
      .flatMap((file) => imported(file).map((target) => ({ file, target })));
    expect(importing.some(({ target }) => target.startsWith("company/"))).toBe(true); // Looking in the right place.
    expect(importing.filter(({ target }) => areaOf(target) !== undefined)).toEqual([]);
  });

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
