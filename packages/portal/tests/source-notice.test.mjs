import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The public publisher is the legal entity Sqound, never the name of a
// person: the footer of every page names it, once, in the one component
// all ten languages share. The component is JSX and is not imported by
// the Node tests, so the source is read.

const source = readFileSync(
  new URL("../src/components/SourceNotice.js", import.meta.url),
  "utf8",
);

test("the footer is signed Sqound and carries no person's name", () => {
  assert.equal(source.match(/© 2026 [^·]*·/gu).length, 1);
  assert.ok(
    source.includes("<span>© 2026 Sqound · {words.warranty} · </span>"),
  );
  // The author's first name, spelled in two pieces so that no file of the
  // public repository holds it.
  assert.equal(source.includes(["Da", "vid"].join("")), false);
});

test("the footer keeps the ten languages' warranty and source words", () => {
  const table = source.slice(
    source.indexOf("const notices = {"),
    source.indexOf("};", source.indexOf("const notices = {")),
  );
  for (const locale of [
    "en",
    "fr",
    "ja",
    "de",
    "es",
    "it",
    '"pt-BR"',
    '"zh-Hans"',
    '"zh-Hant"',
    "ru",
  ]) {
    const entry = table.slice(table.indexOf(`  ${locale}: {`));
    const own = entry.slice(0, entry.indexOf("}"));
    for (const word of ["warranty:", "source:"])
      assert.ok(own.includes(word), `${locale} ${word}`);
  }
  assert.ok(
    !table.includes("feedback"),
    "the link of a composition is its own",
  );
});

test("a composition's link follows the source link and precedes the build, the core draws none by itself", () => {
  // The link is added to the footer's line (`extra`, given by the layout
  // from the composition's `footer.link`) and never replaces its three words.
  assert.ok(
    source.indexOf("{words.source} · GNU AGPL v3") < source.indexOf("{extra}"),
  );
  assert.ok(
    source.indexOf("{extra}") < source.indexOf("source-notice-version"),
  );
  assert.match(source, /extra = null,/);
  assert.ok(!/feedback/i.test(source));
});

test("the footer decides from the page's address whether it draws the build, with the rule of source-notice-scope.js", () => {
  // The version and the commit belong to the footer of the administration
  // only; the copyright and licence line stays everywhere (AGPL).
  assert.match(
    source,
    /import \{\s*isFullViewportPath,\s*showsBuildIdentity,?\s*\} from "\.\.\/source-notice-scope\.js";/,
  );
  assert.match(source, /if \(isFullViewportPath\(pathname\)\) return null;/);
  assert.match(source, /const buildShown = showsBuildIdentity\(pathname\);/);
  assert.equal(
    source.match(/data-build-version/g).length,
    1,
    "the build is drawn in one place only",
  );
});
