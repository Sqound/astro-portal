#!/usr/bin/env node
// Builds the public sample of Astro Portal from a portal database: the
// records (small JSON files, kept in the code repository under sample/) and
// the pack of images (an archive published separately). See docs/SAMPLE_DATA.md.
import { resolve } from "node:path";
import { UsageError, parseArguments, splitCommas } from "./lib/cli.mjs";
import { runExport } from "./lib/export-run.mjs";

const usage = `Usage: node scripts/sample-data/export.mjs --database <sqlite file | postgres url>
         (--sessions <id,id…> | --equipment "<name>" [--from <date>] [--to <date>])
         [--captures-dir <dir>]… [--images-dir <dir>]… [--forbid <word>]…
         [--forbid-near <lat>,<lon>,<km>] [--tenant <space id>]
         [--records-out <dir>] [--pack-out <dir>] [--pack-version <n>] [--pack-url <url>]
         [--date <YYYY-MM-DD>] [--replace] [--allow-urls]
         [--allow-media-licence <regex>]… [--with-session-documents]

  --captures-dir / --images-dir  folders searched for the bytes of the captures (equivalent; the
                                 portal's own store is found by name, anything else by SHA-256)
  --forbid                       a word that must appear nowhere (repeatable; never stored)
  --forbid-near                  refuse any coordinate within <km> of this point (never stored)
  --records-out                  default: sample/ of the repository
  --pack-out                     default: build/sample-data/ of the repository`;

const spec = {
  "--database": { key: "database", type: "string" },
  "--sessions": { key: "sessions", type: "list" },
  "--equipment": { key: "equipment", type: "list" },
  "--from": { key: "from", type: "string" },
  "--to": { key: "to", type: "string" },
  "--tenant": { key: "tenant", type: "string" },
  "--captures-dir": { key: "capturesDirs", type: "list" },
  "--images-dir": { key: "imagesDirs", type: "list" },
  "--forbid": { key: "forbid", type: "list" },
  "--forbid-near": { key: "near", type: "string" },
  "--allow-urls": { key: "allowUrls", type: "boolean" },
  "--allow-media-licence": { key: "allowMediaLicences", type: "list" },
  "--with-session-documents": { key: "withSessionDocuments", type: "boolean" },
  "--records-out": { key: "recordsOut", type: "string" },
  "--pack-out": { key: "packOut", type: "string" },
  "--pack-version": { key: "packVersion", type: "integer" },
  "--pack-url": { key: "packUrl", type: "string" },
  "--date": { key: "date", type: "string" },
  "--replace": { key: "replace", type: "boolean" },
  "--help": { key: "help", type: "boolean" },
};

async function main() {
  const args = parseArguments(process.argv.slice(2), spec);
  if (args.help) {
    console.log(usage);
    return;
  }
  const result = await runExport({
    database: args.database
      ? /^postgres(?:ql)?:\/\//i.test(args.database)
        ? args.database
        : resolve(args.database)
      : null,
    capturesDirs: [...args.capturesDirs, ...args.imagesDirs],
    sessions: splitCommas(args.sessions),
    equipment: args.equipment,
    from: args.from ?? null,
    to: args.to ?? null,
    tenant: args.tenant ?? null,
    forbid: args.forbid,
    near: args.near ?? null,
    allowUrls: Boolean(args.allowUrls),
    allowMediaLicences: args.allowMediaLicences,
    withSessionDocuments: Boolean(args.withSessionDocuments),
    ...(args.recordsOut ? { recordsOut: resolve(args.recordsOut) } : {}),
    ...(args.packOut ? { packOut: resolve(args.packOut) } : {}),
    ...(args.packVersion ? { packVersion: args.packVersion } : {}),
    packUrl: args.packUrl ?? null,
    ...(args.date ? { date: args.date } : {}),
    replace: Boolean(args.replace),
  });
  const lines = [
    `Records written to ${result.recordsOut}`,
    `Image pack written to ${result.archive} (${result.archiveBytes} bytes, SHA-256 ${result.archiveSha256})`,
    "Rows per table:",
    ...Object.entries(result.counts).map(
      ([table, count]) => `  ${table}: ${count}`,
    ),
    `Images: ${result.images} (${result.imageBytes} bytes)`,
    "What the tool changed or left out (counts only):",
    ...Object.entries(result.report).map(
      ([key, count]) => `  ${key}: ${count}`,
    ),
    result.verification,
  ];
  console.log(lines.join("\n"));
}

main().catch((error) => {
  console.error(error.message || error);
  if (error instanceof UsageError) console.error(`\n${usage}`);
  process.exitCode = error instanceof UsageError ? 2 : 1;
});
