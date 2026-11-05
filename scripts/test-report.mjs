// Reads what each test runner wrote and turns it into the summary that ends npm test.

const MOST_NAMES_SHOWN = 15;

// Every unit test should take under a second here, because CI runs on a much slower machine.
export const SLOW_UNIT_TEST_MS = 1000;

function unescapeXml(text) {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

export function readPytest(xml) {
  const total = (name) => Number(xml.match(new RegExp(`<testsuite\\b[^>]*\\b${name}="(\\d+)"`))?.[1] ?? 0);
  const attribute = (text, name) => unescapeXml(text.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? "");

  const tests = xml.split("<testcase ").slice(1);
  const nameOf = (test) => [attribute(test, "classname"), attribute(test, "name")].filter(Boolean).join("::");

  // A test that passed closes itself with "/>", so only these go straight into a problem.
  const failures = tests.filter((test) => /^[^>]*[^/]>\s*<(failure|error)\b/.test(test)).map(nameOf);
  const slow = slowest(tests.map((test) => ({ name: nameOf(test), ms: Number(attribute(test, "time")) * 1000 })));

  const failed = total("failures") + total("errors");
  const skipped = total("skipped");
  return { passed: total("tests") - failed - skipped, failed, skipped, failures, slow };
}

/** The tests that took a second or more, slowest first. */
function slowest(timings) {
  return timings.filter(({ ms }) => ms >= SLOW_UNIT_TEST_MS).sort((a, b) => b.ms - a.ms);
}

export function readVitest(json, root) {
  const report = JSON.parse(json);
  const relative = (file) => (file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file);

  const failures = report.testResults.flatMap((file) => {
    const failedTests = file.assertionResults.filter((test) => test.status === "failed");
    // A file that can't load has no tests to name, so the file stands in for them.
    if (failedTests.length === 0) return file.status === "failed" ? [relative(file.name)] : [];
    return failedTests.map((test) => `${relative(file.name)} > ${test.fullName}`);
  });

  const timings = report.testResults.flatMap((file) =>
    file.assertionResults.map((test) => ({
      name: `${relative(file.name)} > ${test.fullName}`,
      ms: test.duration ?? 0,
    })),
  );

  return {
    passed: report.numPassedTests,
    failed: failures.length,
    skipped: report.numPendingTests + report.numTodoTests,
    failures,
    slow: slowest(timings),
  };
}

export function readPlaywright(json) {
  const report = JSON.parse(json);
  const failures = [];

  function walk(suite) {
    for (const spec of suite.specs ?? []) {
      if (!spec.ok) failures.push(`${spec.file}:${spec.line} > ${spec.title}`);
    }
    for (const inner of suite.suites ?? []) walk(inner);
  }
  for (const suite of report.suites ?? []) walk(suite);

  // Problems outside any test, such as a spec file that can't load.
  for (const error of report.errors ?? []) failures.push(error.message.split("\n")[0]);

  return { passed: report.stats.expected, failed: failures.length, skipped: report.stats.skipped, failures };
}

function seconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function duration(ms) {
  const total = Math.round(ms / 1000);
  return total < 60 ? `${total}s` : `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
}

/** A layer passes only if it exited cleanly, reported no failures and, if it runs tests, ran some. */
function didPass({ code, results, runsTests }) {
  if (code !== 0) return false;
  if (!runsTests) return true;
  return results !== null && results.failed === 0 && results.passed > 0;
}

function resultText(layer, passed) {
  const { results, runsTests } = layer;
  if (!runsTests) return passed ? "passed" : "FAILED";
  if (results === null) return "FAILED, no results";

  const parts = [`${results.passed} passed`];
  if (results.failed > 0) parts.push(`${results.failed} FAILED`);
  if (results.skipped > 0) parts.push(`${results.skipped} skipped`);
  if (results.failed === 0 && !passed) parts.push(results.passed === 0 ? "FAILED, ran no tests" : "FAILED");
  return parts.join(", ");
}

/** Information only: a slow test doesn't fail the run. */
function slowLines(counted, othersBusy) {
  const slow = counted
    .flatMap((row) => (row.results.slow ?? []).map((test) => ({ ...test, layer: row.name })))
    .sort((a, b) => b.ms - a.ms);
  if (slow.length === 0) return [];
  const listed = slow.map((test) => `  ${seconds(test.ms).padStart(5)}  ${test.layer}: ${test.name}`);
  const note = othersBusy
    ? ["Another test run on this computer was busy while these ran, which slows them, so they may be quick alone."]
    : [];
  return ["Unit tests that took a second or more", ...listed, ...note, ""];
}

/**
 * Layers are { name, code, ms, runsTests, results }, where results is null if none were written.
 * othersBusy says another test run on this computer was busy while the unit tests ran.
 */
export function summarize(layers, elapsedMs, { othersBusy = false } = {}) {
  const rows = layers.map((layer) => {
    const passed = didPass(layer);
    return { ...layer, passed, text: resultText(layer, passed) };
  });

  const nameWidth = Math.max(...rows.map((row) => row.name.length));
  const textWidth = Math.max(...rows.map((row) => row.text.length));
  const table = rows.map(
    (row) => `  ${row.name.padEnd(nameWidth)}  ${row.text.padEnd(textWidth)}  ${seconds(row.ms).padStart(7)}`,
  );

  const counted = rows.filter((row) => row.results !== null && row.results !== undefined);
  const count = (field) => counted.reduce((sum, row) => sum + row.results[field], 0);
  const lines = ["", "Summary", ...table, "", ...slowLines(counted, othersBusy)];

  const failing = rows.filter((row) => !row.passed);
  if (failing.length === 0) {
    lines.push(`All ${count("passed")} tests passed in ${duration(elapsedMs)}.`);
    return { passed: true, text: lines.join("\n") };
  }

  const names = counted.flatMap((row) => (row.results.failures ?? []).map((failure) => `  ${row.name}: ${failure}`));
  if (names.length > 0) {
    lines.push("Failed tests", ...names.slice(0, MOST_NAMES_SHOWN));
    if (names.length > MOST_NAMES_SHOWN) lines.push(`  and ${names.length - MOST_NAMES_SHOWN} more`);
    lines.push("");
  }
  lines.push(
    `Failed: ${failing.map((row) => row.name).join(", ")}. ${count("failed")} failed, ${count("passed")} passed in ${duration(elapsedMs)}.`,
  );
  return { passed: false, text: lines.join("\n") };
}
