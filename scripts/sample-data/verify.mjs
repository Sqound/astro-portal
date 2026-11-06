#!/usr/bin/env node
// Checks a finished sample, independently of how it was made: every rule of
// the anonymisation is replayed on the records (and on the image pack when
// given). Prints a readable report; the exit code is 0 when nothing is found,
// 1 otherwise, 2 for a usage error.
import { resolve } from "node:path";
import { UsageError, parseArguments } from "./lib/cli.mjs";
import { repositoryRoot } from "./lib/export-run.mjs";
import { parseNear, prepareForbidden } from "./lib/patterns.mjs";
import { verifyDataset, verifyReport } from "./lib/verify-run.mjs";

const usage = `Usage: node scripts/sample-data/verify.mjs [<records dir>] [--pack <archive>]
         [--forbid <word>]… [--forbid-near <lat>,<lon>,<km>] [--allow-urls]

  <records dir>   default: sample/ of the repository
  --pack          the image pack to check as well (its manifest.json beside it is checked too)
  --forbid        a word that must appear nowhere (repeatable; never stored)
  --forbid-near   refuse any coordinate within <km> of this point (never stored)`;

const spec = {
  "--pack": { key: "pack", type: "string" },
  "--forbid": { key: "forbid", type: "list" },
  "--forbid-near": { key: "near", type: "string" },
  "--allow-urls": { key: "allowUrls", type: "boolean" },
  "--help": { key: "help", type: "boolean" },
};

async function main() {
  const argv = process.argv.slice(2);
  const positional = argv[0] && !argv[0].startsWith("--") ? argv.shift() : null;
  const args = parseArguments(argv, spec);
  if (args.help) {
    console.log(usage);
    return;
  }
  const result = await verifyDataset({
    recordsDir: resolve(positional || `${repositoryRoot}/sample`),
    packFile: args.pack ? resolve(args.pack) : null,
    forbid: prepareForbidden(args.forbid),
    near: args.near ? parseNear(args.near) : null,
    allowUrls: Boolean(args.allowUrls),
  });
  console.log(verifyReport(result));
  process.exitCode = result.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(error.message || error);
  if (error instanceof UsageError) console.error(`\n${usage}`);
  process.exitCode = error instanceof UsageError ? 2 : 1;
});
