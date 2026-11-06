# apps/portal-oss — the Astro Portal application

This is Astro Portal as a person runs it on their own server: the
application of `packages/portal-app` (every route, page and the start of the
service). It holds no code of its own: its files only point at that package:

- `src/app/**` — one thin file per route or page, re-exporting
  `portal-app/routes/<the same path>` (and the segment settings Next.js
  reads from the shell's file);
- `server.mjs` — the start of the service (`portal-app/server/start.js`);
- `next.config.mjs`, `public/` (a link to the repository's Stellarium
  assets), `Dockerfile`.

From the repository's root:

```sh
npm ci
npm run build          # the packages, then this application
npm start              # http://localhost:8787
npm test               # the tests of every package and of this shell
```

Setting it up for real use — the sign-in, the data folders, launchd,
systemd or Docker, backups, releases — is described in
[docs/SELF_HOSTING.md](../../docs/SELF_HOSTING.md).
