# Deployment

## Local network

Build the application and start the server on every interface:

```bash
npm ci
npm run build
HOST=0.0.0.0 PORT=8787 npm start
```

Then open `http://<lan-address>:8787`. A firewall can restrict the port to the
trusted home subnet.

## macOS with launchd, Linux with systemd

Astro Portal (`apps/portal-oss`) runs as a launchd agent or a
systemd service from the examples
[deploy/macos/org.astro-portal.plist.example](../deploy/macos/org.astro-portal.plist.example)
and [deploy/systemd/astro-portal.service.example](../deploy/systemd/astro-portal.service.example):
see [SELF_HOSTING.md](SELF_HOSTING.md), « Running it ». Both start the
server with `node apps/portal-oss/server.mjs` (what `npm start` runs), from the
folder of the checkout.

## Cloudflare tunnel

A Quick Tunnel can expose the portal temporarily:

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

Pages and previews remain accessible. `/admin`, `/api/admin`, and TIFF downloads
are denied when Cloudflare adds its headers. A Quick Tunnel URL changes on each
reconnection. Use a named tunnel and your own domain for a stable URL.

Behind a tunnel every visitor reaches the portal from the tunnel's own
address, so the limits (the sign-in, the pairing of a device, the client log,
the preparation of a sky backdrop) would count them as one and a single
visitor could use them up for everybody. When nothing but the tunnel can
reach the portal (started with `HOST=127.0.0.1`), set
`ASTRO_PORTAL_CLIENT_IP_HEADER=cf-connecting-ip`. A portal that is also open
on the local network must not: anyone there could write that header and
choose the origin the limits count them as. The administration's own
allowlist of addresses is not affected: it reads the connection's address.

A public tunnel exposes descriptions, dates, celestial coordinates, and every
other catalog field. Enable `ASTRO_PORTAL_REDACT_LOCATIONS=true` and read
[PRIVACY.md](PRIVACY.md) before sharing the URL.

## Star catalogue of the sky annotations

The gallery's sky annotations name their stars from the HYG v4.1 catalogue
(David Nash, astronexus.com, CC BY-SA 4.0). A server started without
`ASTRO_PORTAL_HYG_CATALOG` on disk fetches it by itself, checks its SHA-256
and keeps it at `<runtime>/astrometry/catalogs/hyg_v41.csv`;
`ASTRO_PORTAL_HYG_DOWNLOAD=off` stops that (copy `hygdata_v41.csv` there as
`hyg_v41.csv` yourself), and `npm run install:hyg-catalog` fetches it before a
start. Without the file the annotations hold the catalogue's objects only and
the viewer says « Stars unavailable on this server ».

## Immutable releases and rollback

For a private installation, keep images, metadata, maps, and astrometry data
outside the checkout. Set `ASTRO_PORTAL_PRIVATE_ROOT` to a deployment root
containing `releases/` and `current`, then run this from a clean checkout:

```bash
ASTRO_PORTAL_PRIVATE_ROOT=/srv/astro-portal \
ASTRO_PORTAL_LAUNCHD_LABEL=org.astro-portal \
ASTRO_PORTAL_DATABASE_PATH=/srv/astro-portal/private/portal.sqlite \
ASTRO_PORTAL_LIVE_URL=http://127.0.0.1:8787 \
npm run deploy:release -- --app portal-oss
```

The release command exports the exact Git SHA, installs locked dependencies,
builds and probes it on a temporary loopback port (without the live
database), verifies a consistent SQLite snapshot in `backups/` when
`ASTRO_PORTAL_DATABASE_PATH` is supplied, atomically replaces the `current`
symlink, restarts the service (launchd, `ASTRO_PORTAL_RESTART_COMMAND`, or
nothing with `--no-launchd`) and, with `ASTRO_PORTAL_LIVE_URL`, probes the
live service: when it does not answer, `current` goes back to the previous
release, which is restarted. It never synchronizes or deletes private data.
`--app portal-oss` (the default) deploys the application in `apps/portal-oss`;
`--local` accepts a commit that has no upstream. Every setting is in
[SELF_HOSTING.md](SELF_HOSTING.md), « Updating with releases ».

Keep the SQLite database and the sign-in settings below the private root but
outside `current/` and `releases/`. The candidate deliberately has no database
path, so its dependency installation, build, and probe cannot create or migrate
the production database. The release snapshot is a verified `VACUUM INTO`
backup, safe with SQLite's journal modes; the recovery and PostgreSQL runbook is in
[PRIVATE_NOTEBOOK_AUTH.md](PRIVATE_NOTEBOOK_AUTH.md). A documentation-only
change does not require a portal release.

The optional local deep-sky catalogue is runtime data as well. Keep its file,
`openngc.json`, outside the release tree, for example in
`/srv/astro-portal/runtime/target-library/`. The application reads this default
location automatically when its runtime directory is
`/srv/astro-portal/runtime`.

`portal.config.json` may declare `supportedLocales` and `defaultLocale`.
Locale URLs are stable (`/en/`, `/fr/`, `/ja/`); keep absolute paths and tunnel
credentials in an untracked environment file.
