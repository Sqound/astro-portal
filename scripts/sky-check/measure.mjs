#!/usr/bin/env node
/**
 * The measurement harness of the sky check (packages/portal/src/sky-check):
 * reads a folder of files and its manifest, runs the check on each file in
 * a child process (to read its memory), and writes the results and a
 * summary.
 *
 *   node scripts/sky-check/measure.mjs --set <folder> --manifest <manifest.json>
 *     --out <results.json> [--summary <summary.md>] [--label <machine>]
 *     [--only <subclass,...>] [--settings '<json>']
 *
 * The manifest is `{ "files": [ { "id", "file", "subclass", "expected",
 * "acceptable"?, "source"?, "licence"? } ] }`; `file` is relative to the
 * folder (or absolute). `expected` and `acceptable` are outcomes of the
 * rule (`sky` — the sky or a landscape —, `person`, `undetermined`,
 * `other` — painted); `acceptable` lists the outcomes that are not errors
 * for that file (the expected one by default).
 *
 * Nothing of a file is copied or written: the results name each file by its
 * identifier and its sub-class only — no file name, no path, no metadata
 * value (the check itself keeps derived signals only).
 */

import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
/** The outcomes of the rule (`rule.js`), the rows and columns of the tables. */
export const RESULTS = ["sky", "person", "undetermined", "other"];

/** The outcome of a verdict: its own, or read from its stored form. */
const outcomeOfVerdict = (verdict) =>
  verdict.outcome ??
  (verdict.result === "undetermined" && verdict.reason === "person_detected"
    ? "person"
    : verdict.result);

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index].replace(/^--/, "");
    options[key] = argv[index + 1];
  }
  return options;
}

const percentile = (values, share) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)
  ];
};

/** Runs one file through check-one.mjs and answers its line of JSON. */
async function checkInChild(path, originalName, settings) {
  const { stdout } = await run(
    process.execPath,
    [
      join(here, "check-one.mjs"),
      path,
      originalName,
      settings ? JSON.stringify(settings) : "",
    ],
    { maxBuffer: 16 * 2 ** 20, timeout: 120_000 },
  );
  return JSON.parse(stdout.trim().split("\n").pop());
}

/** The 4 × 4 tables (expected × answered), per sub-class and in all. */
export function confusion(results) {
  const table = {};
  for (const entry of results) {
    for (const key of [entry.subclass, "all"]) {
      table[key] ??= Object.fromEntries(
        RESULTS.map((expected) => [
          expected,
          Object.fromEntries(RESULTS.map((r) => [r, 0])),
        ]),
      );
      table[key][entry.expected][entry.result] += 1;
    }
  }
  return table;
}

/** The figures of a run: errors, times and memory. */
export function summarise(results) {
  const times = results.map((entry) => entry.milliseconds);
  const added = results.map((entry) => entry.addedRssMb);
  return {
    files: results.length,
    errors: results.filter((entry) => !entry.ok).length,
    nonSkyAnsweredSky: results.filter(
      (entry) => entry.result === "sky" && !entry.acceptable.includes("sky"),
    ).length,
    personAnsweredSky: results.filter(
      (entry) => entry.result === "sky" && entry.expected === "person",
    ).length,
    astronomicalAnsweredOther: results.filter(
      (entry) => entry.result === "other" && entry.astronomical,
    ).length,
    medianMs: percentile(times, 0.5),
    p95Ms: percentile(times, 0.95),
    maxMs: percentile(times, 1),
    medianAddedRssMb: percentile(added, 0.5),
    p95AddedRssMb: percentile(added, 0.95),
    maxAddedRssMb: percentile(added, 1),
    maxPeakRssMb: percentile(
      results.map((entry) => entry.peakRssMb),
      1,
    ),
  };
}

/** A Markdown summary: the figures, then the tables per sub-class. */
export function summaryMarkdown({ label, summary, table, subclasses }) {
  const lines = [
    `# Sky check — ${label}`,
    "",
    `Files: ${summary.files} · errors: ${summary.errors} · non-sky answered sky: ${summary.nonSkyAnsweredSky} · person answered sky: ${summary.personAnsweredSky} · astronomical answered other: ${summary.astronomicalAnsweredOther}`,
    "",
    `Time per file: median ${summary.medianMs} ms, 95th percentile ${summary.p95Ms} ms, max ${summary.maxMs} ms. Memory added: median ${summary.medianAddedRssMb} MB, 95th percentile ${summary.p95AddedRssMb} MB, max ${summary.maxAddedRssMb} MB (peak of the process ${summary.maxPeakRssMb} MB).`,
    "",
    "| Sub-class | Expected | → sky | → person | → undetermined | → other |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
  ];
  for (const subclass of [...subclasses, "all"]) {
    for (const expected of RESULTS) {
      const row = table[subclass]?.[expected];
      if (!row || RESULTS.every((result) => row[result] === 0)) continue;
      lines.push(
        `| ${subclass} | ${expected} | ${row.sky} | ${row.person} | ${row.undetermined} | ${row.other} |`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

export async function measure({ set, manifest, only, settings, onProgress }) {
  const { files } = JSON.parse(await readFile(manifest, "utf8"));
  const wanted = only ? new Set(only.split(",")) : null;
  const results = [];
  for (const entry of files) {
    if (wanted && !wanted.has(entry.subclass)) continue;
    const path = isAbsolute(entry.file) ? entry.file : join(set, entry.file);
    const acceptable = entry.acceptable || [entry.expected];
    let line;
    try {
      // The original name only carries the extension, as an upload does.
      line = await checkInChild(
        path,
        `capture${extname(entry.file)}`,
        settings,
      );
    } catch (error) {
      line = {
        verdict: {
          result: "undetermined",
          reason: "harness_failure",
          signals: { failure: String(error.code || "error") },
          milliseconds: null,
        },
        elapsedMs: null,
        baselineRssMb: null,
        peakRssMb: null,
      };
    }
    const { verdict } = line;
    const result = {
      id: entry.id,
      subclass: entry.subclass,
      expected: entry.expected,
      acceptable,
      astronomical: Boolean(entry.astronomical),
      result: outcomeOfVerdict(verdict),
      stored: verdict.result,
      reason: verdict.reason,
      ruleVersion: verdict.ruleVersion ?? null,
      ok: acceptable.includes(outcomeOfVerdict(verdict)),
      milliseconds: verdict.milliseconds,
      peakRssMb: line.peakRssMb,
      addedRssMb:
        line.peakRssMb === null ? null : line.peakRssMb - line.baselineRssMb,
      signals: verdict.signals,
    };
    results.push(result);
    onProgress?.(result);
  }
  return results;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.set || !options.manifest || !options.out) {
    console.error(
      "usage: measure.mjs --set <folder> --manifest <file> --out <results.json> [--summary <file>] [--label <name>] [--only <subclasses>] [--settings <json>]",
    );
    process.exit(2);
  }
  const results = await measure({
    set: resolve(options.set),
    manifest: resolve(options.manifest),
    only: options.only,
    settings: options.settings ? JSON.parse(options.settings) : undefined,
    onProgress: (result) =>
      process.stderr.write(
        `${result.ok ? " " : "✗"} ${result.id} ${result.subclass}: ${result.result} (${result.reason}) ${result.milliseconds} ms\n`,
      ),
  });
  const summary = summarise(results);
  const table = confusion(results);
  const subclasses = [...new Set(results.map((entry) => entry.subclass))];
  const label = options.label || "this machine";
  await writeFile(
    options.out,
    `${JSON.stringify(
      {
        label,
        ruleVersion: results[0]?.ruleVersion ?? null,
        summary,
        table,
        results,
      },
      null,
      1,
    )}\n`,
  );
  if (options.summary)
    await writeFile(
      options.summary,
      summaryMarkdown({ label, summary, table, subclasses }),
    );
  process.stdout.write(summaryMarkdown({ label, summary, table, subclasses }));
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
