import { describe, expect, it } from "vitest";

import { readPlaywright, readPytest, readVitest, summarize } from "./test-report.mjs";

describe("readPytest", () => {
  const xml = [
    '<?xml version="1.0" encoding="utf-8"?><testsuites name="pytest tests">',
    '<testsuite name="pytest" errors="1" failures="1" skipped="1" tests="5" time="1.2">',
    '<testcase classname="backend.tests.test_rules" name="test_passes" time="0.1" />',
    '<testcase classname="backend.tests.test_rules" name="test_fails[a&gt;b]" time="0.1"><failure message="assert 1 == 2">details</failure></testcase>',
    '<testcase classname="backend.tests.test_rules" name="test_also_passes" time="0.1" />',
    '<testcase classname="" name="backend.tests.test_broken" time="0.0"><error message="collection failure">details</error></testcase>',
    '<testcase classname="backend.tests.test_rules" name="test_skipped" time="0.0"><skipped message="later" /></testcase>',
    "</testsuite></testsuites>",
  ].join("");

  it("counts every outcome", () => {
    const { passed, failed, skipped } = readPytest(xml);
    expect({ passed, failed, skipped }).toEqual({ passed: 2, failed: 2, skipped: 1 });
  });

  it("names only the tests that failed, including a file that couldn't load", () => {
    expect(readPytest(xml).failures).toEqual(["backend.tests.test_rules::test_fails[a>b]", "backend.tests.test_broken"]);
  });
});

describe("readVitest", () => {
  const root = "/project";
  const report = {
    numPassedTests: 3,
    numFailedTests: 1,
    numPendingTests: 1,
    numTodoTests: 1,
    testResults: [
      {
        name: "/project/frontend/src/a.test.ts",
        status: "failed",
        assertionResults: [
          { status: "passed", fullName: "a works" },
          { status: "failed", fullName: "a breaks" },
        ],
      },
      { name: "/project/frontend/src/b.test.ts", status: "passed", assertionResults: [{ status: "passed", fullName: "b works" }] },
    ],
  };

  it("counts every outcome and names what failed", () => {
    expect(readVitest(JSON.stringify(report), root)).toEqual({
      passed: 3,
      failed: 1,
      skipped: 2,
      failures: ["frontend/src/a.test.ts > a breaks"],
    });
  });

  it("counts a file that couldn't load, which has no tests of its own to fail", () => {
    const broken = { name: "/project/frontend/src/c.test.ts", status: "failed", assertionResults: [] };
    const result = readVitest(JSON.stringify({ ...report, testResults: [...report.testResults, broken] }), root);
    expect(result.failed).toBe(2);
    expect(result.failures).toContain("frontend/src/c.test.ts");
  });
});

describe("readPlaywright", () => {
  const report = {
    stats: { expected: 4, unexpected: 1, skipped: 1, flaky: 0 },
    errors: [],
    suites: [
      {
        specs: [{ title: "top level", ok: true, file: "a.spec.ts", line: 3 }],
        suites: [{ suites: [{ specs: [{ title: "deep down", ok: false, file: "a.spec.ts", line: 9 }] }] }],
      },
    ],
  };

  it("finds a failure however deep its suite is", () => {
    expect(readPlaywright(JSON.stringify(report))).toEqual({ passed: 4, failed: 1, skipped: 1, failures: ["a.spec.ts:9 > deep down"] });
  });

  it("counts a problem outside any test, such as a spec file that can't load", () => {
    const result = readPlaywright(JSON.stringify({ ...report, errors: [{ message: "SyntaxError: bad\nmore lines" }] }));
    expect(result.failed).toBe(2);
    expect(result.failures).toContain("SyntaxError: bad");
  });
});

describe("summarize", () => {
  const typeCheck = { name: "Type check", code: 0, ms: 700, runsTests: false, results: null };
  const backend = { name: "Backend", code: 0, ms: 4600, runsTests: true, results: { passed: 331, failed: 0, skipped: 0, failures: [] } };
  const browser = { name: "End-to-end", code: 0, ms: 45_000, runsTests: true, results: { passed: 106, failed: 0, skipped: 0, failures: [] } };
  const failing = (layer, failures) => ({
    ...layer,
    code: 1,
    results: { ...layer.results, passed: layer.results.passed - failures.length, failed: failures.length, failures },
  });

  it("ends a clean run with one line of totals", () => {
    const { passed, text } = summarize([typeCheck, backend, browser], 72_000);
    expect(passed).toBe(true);
    expect(text).toContain("331 passed");
    expect(text.trimEnd().split("\n").at(-1)).toBe("All 437 tests passed in 1m 12s.");
  });

  it("fails if any one layer fails, and says which test", () => {
    const { passed, text } = summarize([typeCheck, failing(backend, ["test_x"]), browser], 50_000);
    expect(passed).toBe(false);
    expect(text).toContain("330 passed, 1 FAILED");
    expect(text).toContain("Backend: test_x");
    expect(text.trimEnd().split("\n").at(-1)).toBe("Failed: Backend. 1 failed, 436 passed in 50s.");
  });

  it("fails when a type check fails, which has no tests to count", () => {
    const { passed, text } = summarize([{ ...typeCheck, code: 2 }, backend], 5000);
    expect(passed).toBe(false);
    expect(text).toMatch(/Type check\s+FAILED/);
  });

  it("fails when a runner crashes and writes no results", () => {
    const { passed, text } = summarize([{ ...backend, code: 1, results: null }], 5000);
    expect(passed).toBe(false);
    expect(text).toContain("FAILED, no results");
  });

  it("fails when a runner exits cleanly without writing results", () => {
    expect(summarize([{ ...backend, code: 0, results: null }], 5000).passed).toBe(false);
  });

  it("fails when a runner exits cleanly having run no tests", () => {
    const { passed, text } = summarize([{ ...backend, results: { passed: 0, failed: 0, skipped: 0, failures: [] } }], 5000);
    expect(passed).toBe(false);
    expect(text).toContain("FAILED, ran no tests");
  });

  it("fails when a runner exits with an error despite every test passing", () => {
    expect(summarize([{ ...backend, code: 1 }], 5000).passed).toBe(false);
  });

  it("fails when a runner reports a failure despite exiting cleanly", () => {
    expect(summarize([{ ...failing(backend, ["test_x"]), code: 0 }], 5000).passed).toBe(false);
  });

  it("shows skipped tests, so they can't go unnoticed", () => {
    const { passed, text } = summarize([{ ...backend, results: { ...backend.results, skipped: 2 } }], 5000);
    expect(passed).toBe(true);
    expect(text).toContain("331 passed, 2 skipped");
  });

  it("keeps a long list of failures short", () => {
    const names = Array.from({ length: 20 }, (_, index) => `test_${index}`);
    const { text } = summarize([failing(backend, names)], 5000);
    expect(text).toContain("Backend: test_14");
    expect(text).not.toContain("Backend: test_15");
    expect(text).toContain("and 5 more");
  });
});
