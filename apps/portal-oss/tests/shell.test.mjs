import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The application holds no code of its own: every route and page
// of `src/app` re-exports the core's implementation in
// `packages/portal-app/src/routes`, at the same path, and declares the
// segment settings Next.js reads from the shell's file only.

const app = fileURLToPath(new URL("../src/app/", import.meta.url));
const core = fileURLToPath(
  new URL("../../../packages/portal-app/src/routes/", import.meta.url),
);
// Every file Next.js reads as part of a route: a `not-found.js` (the private
// gallery's one 404 page) is a route file of the core too.
const ROUTE =
  /(?:^|\/)(?:route|page|layout|not-found|error|loading|template|default)\.js$/;
const SEGMENT =
  /^export const (?:runtime|dynamic|revalidate|dynamicParams|fetchCache|maxDuration|preferredRegion) = .+;$/;

function files(directory) {
  const found = [];
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else found.push(relative(directory, path).split("\\").join("/"));
    }
  };
  walk(directory);
  return found.sort();
}

const routes = files(app).filter((path) => ROUTE.test(path));

test("the shell serves every route of the core, and nothing else", () => {
  assert.ok(routes.length > 100, `${routes.length} routes`);
  assert.deepEqual(
    routes,
    files(core).filter((path) => ROUTE.test(path)),
  );
  assert.deepEqual(
    files(app).filter((path) => !ROUTE.test(path) && !path.endsWith(".svg")),
    [],
  );
});

test("every file of the shell only re-exports the core's route at the same path", () => {
  for (const path of routes) {
    const specifier = `portal-app/routes/${path}`;
    assert.ok(existsSync(join(core, path)), path);
    const statements = readFileSync(join(app, path), "utf8")
      .replace(/\s+/g, " ")
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    assert.ok(
      statements.some((statement) =>
        statement.endsWith(` from "${specifier}"`),
      ),
      `${path} does not re-export ${specifier}`,
    );
    for (const statement of statements)
      assert.ok(
        SEGMENT.test(`${statement};`) ||
          statement === 'import "portal-app/styles/portal.css"' ||
          // Next.js reads the directive from the shell's own file: an `error`
          // file must be a Client Component.
          (statement === '"use client"' && path.endsWith("error.js")) ||
          (statement.startsWith("export { ") &&
            statement.endsWith(` from "${specifier}"`)),
        `${path}: ${statement}`,
      );
  }
});

test("the shell serves the Stellarium assets of the repository", () => {
  const vendor = fileURLToPath(
    new URL("../public/vendor/stellarium/", import.meta.url),
  );
  assert.ok(existsSync(join(vendor, "stellarium-web-engine.js")));
  assert.ok(existsSync(join(vendor, "stellarium-web-engine.wasm")));
});
