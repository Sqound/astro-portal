import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

// The portal's React components are published as plain JavaScript with JSX in
// `dist/` (Next compiles them when it serves the page). To render one in a
// test, this reads the component and everything it imports by a relative path,
// turns the JSX into calls of the JSX runtime with the compiler Next serves
// the pages with (SWC), and writes the copies under `node_modules/.cache/` —
// inside the repository, so `react`, `portal/…` and the other packages
// resolve exactly as they do for the real files. Nothing here is a
// dependency of its own: the compiler comes with `next`, which the portal
// already depends on.

const swc = createRequire(import.meta.url)("next/dist/build/swc");
const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../../../..");
const cacheRoot = join(
  repository,
  "node_modules",
  ".cache",
  `astro-jsx-tests-${process.pid}`,
);
const distRoot = resolve(repository, "packages/portal/dist");
const done = new Map();

async function transpile(distFile) {
  const known = done.get(distFile);
  if (known) return known;
  const target = join(cacheRoot, relative(distRoot, distFile));
  done.set(distFile, target);
  await swc.loadBindings();
  let { code } = await swc.transform(readFileSync(distFile, "utf8"), {
    jsc: {
      parser: { syntax: "ecmascript", jsx: true },
      transform: { react: { runtime: "automatic" } },
      target: "es2022",
    },
    module: { type: "es6" },
    filename: distFile.replace(/\.js$/, ".jsx"),
  });
  // Next's own entry points are CommonJS files without an extension in
  // their name; Node's ES loader needs it.
  code = code.replace(/from "(next\/[a-z-]+)"/g, 'from "$1.js"');
  // The files this one imports by a relative path come along.
  for (const match of code.matchAll(/from "(\.{1,2}\/[^"]+)"/g))
    await transpile(resolve(dirname(distFile), match[1]));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, code);
  return target;
}

/** Imports a component of `packages/portal/dist` with its JSX made runnable. */
export async function loadJsxModule(pathInDist) {
  const target = await transpile(resolve(distRoot, pathInDist));
  return import(pathToFileURL(target).href);
}

/** Removes the copies; call it once the tests are over. */
export function cleanJsxModules() {
  rmSync(cacheRoot, { recursive: true, force: true });
}
