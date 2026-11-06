Recorded conformance fixtures belong in this directory.

Two directories are written by hand instead, as specification files of an
API: `api/` (recorded exchanges of the space sign-in) and `places/` (the
places of a space: examples, the matrix of the most recent edit, the rule of
possible duplicates). Each has its own README.
One file at the root is written by hand too, with no specification entry:
`journal-sessions.json` (the Journal's list: a table of
sessions and, for each filter and each page, the list the service, the web and
the phone must answer; `tests/journal-reference.mjs` is its reference reading).

The `journal-exchange-<name>.json` files at the root are **recorded answers of
the service**: each one is a request and what the
real route handlers and services answered to it, in a scratch space of invented
nights. They are generated — never written by hand — from the specification
`journal-exchange-spec/<name>.json` (the request, the handler that answers it,
the schema the answer must satisfy, a sentence on what it shows and on the
space it was asked in; an optional `order` puts a write after the others of its
phase, so that the identifiers the others were recorded with do not move); the
clock and the identifiers are fixed, so a second run writes the same files.
`packages/astro-core/tests/fixtures-conformance.test.mjs` checks that each
recording has its specification. They are not modules of `spec/`: nothing
replays them against a function. The clients read them to prove their parsers
read the real service.

The `captures-exchange-<name>.json` files at the root are recorded answers of
the service too, of the same family (a capture
written by two hands): the page of a capture with its two qualities, an
intermediate capture of a multi-night plan, the image of a plan, the list, a
`409 capture_conflict` for each kind of field (the title, the tags, the stage,
a line of « Intégrations », a synchronisation), a device's write and the answer
of « Synchroniser avec la session ». Generated from
`captures-exchange-spec/<name>.json`; the specification of each recording is
checked by `packages/astro-core/tests/fixtures-conformance.test.mjs`.

Every `<module>.json` file here is generated — never hand-edited — from the
specification kept in `spec/`: **one file per fixture module**,
`spec/<module>.json`, holding the one entry of that module. There is no
combined list: nothing is edited by hand except the module's own file, so two
changes that each add a module never touch the same file. The generator and
the replay tests read the directory in the order of its file names.

A specification file is `{ module, package, file, export, cases }`. `module`
is the file name without `.json` (the readers refuse a file whose `module`
differs); `package` is `astro-core` by default, or `portal`, `astro-contracts`
or `planner` (the open planner's rules, such as the range selector's
`schedule-start-update` and `schedule-window-shift`); `file` is the
exported function's dist-relative module path, defaulting to the fixture's own
`module` id when a single source file backs only one fixture; `export` is the
exported function; `cases` are `{ id, args }` (never a `result`). The
generator imports the package's compiled `dist/` output, calls the export with
each case's `args`, and writes back `{id, args, result}` triples.

## Adding a fixture module

1. Write `spec/<module>.json` (copy a neighbour; the module name is
   kebab-case and equals the file name).
2. Build the packages and run the fixture generator. This writes
   `<module>.json` here. Never edit a generated file; change the spec and
   regenerate.

`packages/astro-contracts/tests/fixtures-conformance.test.mjs` replays every
entry against its recorded package and asserts the result still matches;
`packages/astro-core/tests/fixtures-conformance.test.mjs` separately replays
only the `astro-core` subset against its own `dist/`.

## Not yet extractable

Some rules have no fixture here, because no pure, JSON-args-compatible
implementation exists for them yet; each is listed with its current
implementation so that a later extraction can revisit it.

- **`field-of-view.json`** — no implementation exists under `packages/`;
  writing one here would mean originating the optics formula rather than
  fixturing an existing pure function.
- **`night-geometry.json`** — only its "night-of-date label" clause is
  covered, by the `night-date-label` fixture (`nightDateLabel`,
  `packages/portal/src/planner/state.js:444-465`). The astronomical night
  window, 10-minute sampling, and altitude/azimuth/Moon-separation series have
  no pure equivalent to fixture.
- **`ics-export.json`** — `planCalendarIcs` and `weatherReminderIcs`
  (`packages/portal/src/planner/export.js:32-66` and `:68-95`) each embed a
  `DTSTAMP` derived from `new Date()` (current wall-clock time) inside their
  single string return value. A recorded fixture would only match at the
  exact moment it was generated and fail on every later run. Isolating the
  deterministic VALARM-timing parts (15-minute plan reminder; 18-hour/
  immediate-trigger weather reminder) would require refactoring these
  functions to accept an injectable `now` or to return a structured object
  instead of a raw ICS string. The unrelated, fully deterministic
  `planShareText` from the same file is fixtured as `share-summary.json`.
- **Weather/sky-quality cache and backoff orchestration** —
  `createWeatherCache` (`packages/portal/src/astronomy-weather.server.js:35-238`)
  and `createPlannerSkyQualityCache`
  (`packages/portal/src/planner/sky-quality.server.js:68-161`) take injectable
  `fetcher`/`now` functions specifically so they can be unit-tested with
  fakes, but the fixture mechanism's `args` must be JSON-serializable values —
  a function cannot be expressed as a fixture argument. Their pure pieces are
  fixtured instead: `weather-fallback.json`/`weather-fallback-symbol.json`
  (`normalizeMetNorwayForecast`, `metNorwayWeatherCode` in
  `packages/portal/src/met-norway-forecast.js`) and `sky-quality.json`/
  `sky-quality-bortle.json` (`sqmFromArtificialBrightness`, `bortleFromSqm` in
  `packages/portal/src/sky-quality.js`). The coordinate-rounding detail of
  `skyQualityFeatureInfoUrl` (`packages/portal/src/planner/sky-quality.server.js:21-63`)
  is likewise not fixtured: it returns a `URL` object, which does not survive
  the generator's `JSON.stringify`.
- **`place-resolution.json`'s elevation-source tri-state** (`provided` /
  `open-meteo` / `unavailable`) is decided inline inside the async, network-
  calling `resolvePlannerPlace`
  (`packages/portal/src/planner/location.server.js:113-150`), not by a
  standalone pure function. The rest of the rule — invalid-coordinate
  rejection, timezone resolution, and the >10 km relocation-warning distance
  — is fixtured via `place-resolution.json` (`placeCoordinates`),
  `place-resolution-timezone.json` (`timeZoneForCoordinates`), and
  `place-resolution-distance.json` (`placeDistanceKm`).
- **`plan-lifecycle.json`'s transition guards** ("delete only from
  pending/abandoned", "archive only from executed") are enforced procedurally
  inside SQL-transaction methods such as `archivePlannerPayload` in
  `packages/portal/src/persistence/planner-state-repository.js`, not exposed
  as standalone pure predicates. The status vocabulary itself — unknown
  status falls back to "pending", and the internal/API spelling map
  ("pending" &#8594; "active") — is fixtured via `plan-lifecycle.json`
  (`apiPlanStatus`, exported for this purpose; see that file's comment).
