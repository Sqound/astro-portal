# Architecture

## Overview

```text
browser
   │
   ├── Next.js gallery and target pages
   ├── catalog API ───── image scanner + JSON records
   ├── media routes ──── read-only originals
   ├── plate-solve API ─ Astrometry.net + HYG + WCS cache
   └── admin API ─────── IP access control + atomic JSON writes
```

The custom HTTP server does not replace Next.js. It prepares the application,
injects the trusted TCP peer address into each request, and then delegates to
the Next handler. This prevents administration from trusting a header supplied
by the browser.

## Modules

One implementation, thin shells. The application — every route, page and
server-side module, and the start of the service — lives in
`packages/portal-app`; the open-source composition (`apps/portal-oss`) is a
thin shell that re-exports it (`apps/portal-oss/tests/shell.test.mjs` checks
that the shell holds nothing else).

- `packages/portal-app/src/routes/`: App Router pages and API routes, at the
  path the shells serve them;
- `packages/portal-app/src/lib/config.server.js`: paths and commands;
- `packages/portal-app/src/lib/catalog.server.js`: scanning, association,
  and enrichment;
- `packages/portal-app/src/lib/plate-solving.server.js`: solving and WCS
  cache;
- `packages/portal-app/src/lib/media.server.js`: streaming and TIFF
  protection;
- `packages/portal-app/src/lib/admin.server.js`: address rules;
- `packages/portal-app/src/lib/metadata-store.server.js`: atomic reads and
  writes;
- `packages/portal-app/src/lib/service-extensions.js`: the points where a
  composition adds to the application;
- `packages/portal/src/persistence/migration-registry.ts`: the migrations a
  composition adds to the core's chain, whole or as the complement of one of
  the core's;
- `packages/portal-app/src/server/start.js`: the start of the service;
- `packages/portal/src/components/`: the gallery, the detail pages, the
  plate-solving overlay, the sessions, the account;
- `packages/planner/`: the night planner.

## Data boundary

The application code contains no target-specific knowledge. Tags, instruments,
objects, variants, maps, and solving hints come from JSON. Only synthetic
illustrations under `examples/` are versioned.

Media routes validate each resolved path against its configured root before
opening the file. Data is streamed and never passes through an image encoder.

## Browser state

The target and selected version are encoded in the URL. Temporary preferences,
such as gallery position and collapsed-panel state, use `sessionStorage`. They
contain no metadata or secret.
