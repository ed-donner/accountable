// Reads what each test runner wrote and turns it into the summary that ends npm test.

const MOST_NAMES_SHOWN = 15;

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

  // A test that passed closes itself with "/>", so only these go straight into a problem.
  const failures = xml
    .split("<testcase ")
    .slice(1)
    .filter((test) => /^[^>]*[^/]>\s*<(failure|error)\b/.test(test))
    .map((test) => [attribute(test, "classname"), attribute(test, "name")].filter(Boolean).join("::"));

  const failed = total("failures") + total("errors");
  const skipped = total("skipped");
  return { passed: total("tests") - failed - skipped, failed, skipped, failures };
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

  return {
    passed: report.numPassedTests,
    failed: failures.length,
    skipped: report.numPendingTests + report.numTodoTests,
    failures,
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

/** Layers are { name, code, ms, runsTests, results }, where results is null if none were written. */
export function summarize(layers, elapsedMs) {
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
  const lines = ["", "Summary", ...table, ""];

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
