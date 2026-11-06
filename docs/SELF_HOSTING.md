# Self-hosting Astro Portal

Astro Portal (`apps/portal-oss`) is your astrophotography gallery (originals
served without
recompression), the journal and debriefing of your sessions, the night
planner with its sky map, and the server the PlanAstro mobile
application and Astro Sync connect to as a **private server**. A
private server is one person's: its owner signs in, visitors see what the
owner publishes.

The French version of this page is [fr/SELF_HOSTING.md](fr/SELF_HOSTING.md).

## Install in one command

On Linux or macOS, install Docker with its Compose plugin, then:

```bash
git clone https://github.com/sqound/astro-portal.git
cd astro-portal
sh deploy/install.sh
```

The installer asks only for the port (8787, the image's `PORT`), the data
folder (`$HOME/astro-portal-data`) and the address the port is published on
(`0.0.0.0`, every interface; `127.0.0.1` behind a tunnel or a reverse proxy on
the same machine, see « Reverse proxy or tunnel »). It builds `astro-portal:local`, starts the
portal with PostgreSQL 17, waits for `/api/v1/service`, and displays the address,
`/auth/bootstrap` and a bootstrap secret once. Open that page and create the
owner's account; press Enter in the terminal when the account exists. The
sample is installed into that owner's empty space by default. If the sample
records or image pack are not published yet, one line explains this and the
installation still succeeds, with the command to run later.

`--port <port>`, `--data-dir <folder>` and `--bind-address <address>` supply
the answers; the address is written into `portal.env` only when it is not
`0.0.0.0`. `--yes` uses the
defaults without a question or waiting for owner setup, and prints the command
for the sample after sign-in. `--no-sample` skips the sample step. The host needs
OpenSSL for secret generation; no host Node or npm is needed for installation.
On Windows, run the same script in WSL with Docker's WSL integration enabled.

The data folder must be outside the checkout (single quotes and newlines in its
path are refused). It holds:

```text
astro-portal-data/
  portal.env       # mode 600: generated credentials, port, host UID/GID
  portal/          # mounted on /data: images, captures, runtime files
  postgres/        # PostgreSQL database
```

Compose runs the portal with the installing user's UID/GID, so `portal/` is
writable on Linux and macOS without root or a world-writable directory.
The Next.js image cache is also bound to `portal/next-cache/`. Keep
these IDs when reusing the folder. The PostgreSQL image initializes its own
subdirectory. The installer never overwrites an existing `portal.env`: settings
and secrets are reused, and the bootstrap secret is not printed again.
Every setting of `portal.env` reaches the portal's container (the table of
« Settings »: the public address, the client header, the sign-in…); after
editing it, run the `up -d` command below again.

Alternatively copy `deploy/self-hosting.env.example` to the chosen data folder,
replace its placeholders, set the UID/GID from `id -u` / `id -g`, create `portal/next-cache/`
and `postgres/`, and run `chmod 600` on the environment file. From the checkout:

```bash
docker compose --env-file "$HOME/astro-portal-data/portal.env" up -d --build
```

Update with `git pull`, then run the same Compose command again. View logs or
stop your installation with:

```bash
docker compose --env-file "$HOME/astro-portal-data/portal.env" logs --tail 100 portal
docker compose --env-file "$HOME/astro-portal-data/portal.env" down
```

The data stays in the chosen folder. PostgreSQL is reachable inside Compose
only; it is not published to the host. The service makes **no automatic
PostgreSQL backup**. For the existing backup tools, install Node.js 24.21.0
(the version of `.nvmrc`) and `npm ci` in the checkout. Give `backup:runtime` a
reachable `ASTRO_PORTAL_DATABASE_URL` (for example through a private Compose
override publishing PostgreSQL on loopback only), and the PostgreSQL container
ID in `ASTRO_PORTAL_POSTGRES_CONTAINER`:

```bash
ASTRO_PORTAL_POSTGRES_CONTAINER=$(docker compose --env-file "$HOME/astro-portal-data/portal.env" ps -q postgres) \
  npm run backup:runtime -- --out /path/to/private-backups
```

Keep the database URL in a private environment, rather than shell history.
For PostgreSQL restore, set the same container variable and use
`npm run restore:runtime -- --backup /path/to/private-backups --target-database-url <empty-database-url>`;
the target must be an empty database. The SQLite `docker run` variant is
still described under [Docker](#docker).

## Requirements

- Node.js 24.21.0 (the version of `.nvmrc`; `node:sqlite` is used for SQLite).
- About 2 GB of disk for the installation and its build; your images and
  captures on top.
- macOS, Linux, or any system that runs Node.js. PostgreSQL is optional.

## Installation

```bash
git clone <address of the astro-portal repository> astro-portal
cd astro-portal
npm ci
npm run build
npm start
```

The portal answers on `http://localhost:8787` (`PORT`, `HOST` to change
it). Without settings it runs **without sign-in** (`ASTRO_PORTAL_AUTH_MODE`
unset: the public gallery and the planner only). Set it up as below before
opening it to anyone.

## Settings

Put the settings in an environment file readable by the service's user alone
(`chmod 600`), outside the repository and the releases: never in Git, a
release directory or a shell history. `node --env-file=<file>` reads it
(the launchd and systemd examples below do). The service refuses to start
while a setting it needs is missing or wrong, and names the setting, never
its value.

| Setting                                                                             | Value                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                                                                          | `production` for a real server.                                                                                                                                                                                                                                                                  |
| `HOST`, `PORT`                                                                      | Where the server listens (default `0.0.0.0:8787`). `127.0.0.1` when only a reverse proxy or a tunnel reaches it.                                                                                                                                                                                 |
| `ASTRO_PORTAL_DATABASE_PATH`                                                        | The SQLite database (a file below your private root). Created and migrated at start.                                                                                                                                                                                                             |
| `ASTRO_PORTAL_DATABASE_URL`                                                         | Instead of SQLite: a PostgreSQL URL.                                                                                                                                                                                                                                                             |
| `ASTRO_PORTAL_RUNTIME_DIR`                                                          | The private runtime directory: captures, plate-solving, caches, the fake mailbox, backups by default. Default `.astro-portal/` in the repository — set it outside for a real server.                                                                                                             |
| `ASTRO_PORTAL_GALLERY_SOURCE`                                                       | What the home page shows: `captures` (default), the public captures of the spaces; `files`, the file gallery of the two folders below, with its editor in the administration.                                                                                                                    |
| `ASTRO_PORTAL_IMAGES_DIR`, `ASTRO_PORTAL_METADATA_DIR`                              | The folders of the gallery's images and of its JSON catalogue (default: the demonstration catalogue of `examples/`).                                                                                                                                                                             |
| `ASTRO_PORTAL_CAPTURES_DIR`                                                         | Where the captures sent by the applications are stored (default `<runtime>/captures`).                                                                                                                                                                                                           |
| `ASTRO_PORTAL_AUTH_MODE`                                                            | `password` or `email-code` (see below); `disabled` (default) has no private API.                                                                                                                                                                                                                 |
| `ASTRO_PORTAL_SIGN_IN_KEY`                                                          | Required by both modes: `openssl rand -base64 32`. Changing it invalidates the recovery codes.                                                                                                                                                                                                   |
| `ASTRO_PORTAL_BOOTSTRAP_SECRET`                                                     | A long random secret, typed once at `/auth/bootstrap` to create the owner's account; useless afterwards.                                                                                                                                                                                         |
| `ASTRO_PORTAL_PUBLIC_URL`                                                           | `email-code`: the address of the portal as you open it (`https://…`, or `http://…` on the local network), used in the link of the message.                                                                                                                                                       |
| `ASTRO_PORTAL_MAIL_SENDER`, `ASTRO_PORTAL_SMTP_URL`, `…_MAIL_FROM`                  | `email-code`: `smtp` and its address (`smtps://user:password@host:465` or `smtp://…:587`, STARTTLS required), or `file` for a test (the fake mailbox, `ASTRO_PORTAL_MAIL_FILE_ALLOWED=1` in production). `ASTRO_PORTAL_SMTP_ALLOW_INSECURE=1` for a relay of the local network without TLS only. |
| `ASTRO_PORTAL_COOKIE_SECURE`                                                        | Unset: the web session's cookies are `Secure` in production (https or `localhost` only). `false`: plain cookies, the web session holds over `http://` — **a server of the local network, never exposed to the Internet**.                                                                        |
| `ASTRO_PORTAL_CLIENT_IP_HEADER`, `ASTRO_PORTAL_TRUSTED_PROXIES`                     | Behind a reverse proxy or a tunnel that alone reaches the server: where the limits read a visitor's address (for example `cf-connecting-ip`, or `x-forwarded-for` with the number of proxies). Never on a server others reach directly.                                                          |
| `ASTRO_PORTAL_ADMIN_ALLOWED_IPS`                                                    | The addresses or IPv4 networks allowed to use the administration besides `localhost` (for example `192.168.1.0/24`).                                                                                                                                                                             |
| `ASTRO_PORTAL_STORAGE_MAX_FILE_BYTES`, `ASTRO_PORTAL_STORAGE_QUOTA_BYTES`           | Optional caps, in bytes, on one file and on all the captures the applications send. Unset: no cap (your disk is the limit).                                                                                                                                                                      |
| `ASTRO_PORTAL_BACKUP_DIR`, `…_BACKUP_MAX_AGE_DAYS`, `…_KEEP_LATEST`, `…_KEEP_DAILY` | The service's SQLite backups (at start before a migration, every hour when a maximum age is set). Default `<runtime>/backups`.                                                                                                                                                                   |
| `ASTRO_PORTAL_SKY_CHECK`                                                            | `auto` (default) or `off`: the automatic check of each capture after its upload (the sky or a landscape, a person, neither), run by the server itself, people found by a small detector shipped with the portal. `off`: every capture is `undetermined`.                                         |
| `ASTRO_PORTAL_CHECK_NOTICE_DAYS`                                                    | The delay of the notice on a private capture that did not pass the check, in days (default 14); with the current rule no notice is given.                                                                                                                                                        |
| `ASTRO_PORTAL_SQLITE_LEASE`                                                         | `off` disables the lease that keeps a second process off the SQLite database (useful only on a network file system that cannot hold it).                                                                                                                                                         |
| `ASTRO_PORTAL_PLACES`, `ASTRO_PORTAL_PLACES_URL`                                    | Suggested places ([PLACES.md](PLACES.md)): the server queries OpenStreetMap itself through the Overpass instance of the URL (default `https://overpass-api.de/api/interpreter`); `off` switches them off.                                                                                        |
| `ASTRO_PORTAL_CONFIG`, `ASTRO_PORTAL_PRODUCT_NAME`, `…_DEFAULT_LOCALE`              | Optional: a `portal.config.json` (languages, public address, translations), the displayed name, the default language.                                                                                                                                                                            |

The full reference of the sign-in is [PRIVATE_NOTEBOOK_AUTH.md](PRIVATE_NOTEBOOK_AUTH.md).

**Where the captures live.** The files of the captures stay on your disk,
in the captures directory (`ASTRO_PORTAL_CAPTURES_DIR`): each original as it
was sent, named by its SHA-256, its thumbnail and shared copy beside it under
`derived/`, the uploads being received under `uploads/`; back it up with the
runtime directory. `ASTRO_PORTAL_CAPTURE_STORE` names the store of the
service: a private server has one, `disk` (the default), and any other value
stops the service at start with the reason. The owner downloads an original
from « Mon espace › Captures » (the owner's media route with `?download=1`),
a TIFF included, from wherever they are signed in; a gallery only ever serves
the shared copy.

### Signing in

- **`password`**: you sign in with your address and a password (14
  characters or more); the phone and Astro Sync are paired with the code the
  account page shows. Nothing else to set up.
- **`email-code`**: you sign in with your address and a six-digit code
  received by e-mail; the phone and Astro Sync sign in the same way. Needs a
  mail server (`smtp`).

The web sign-in page depends on the mode: `/auth/sign-in` with `email-code`,
`/auth/login` with `password`. The page of the other mode answers 404.

The first time, open `/auth/bootstrap`, type the bootstrap secret and your
address (with `password`, also the password you choose): the account created is
the owner's, the only one of the server. With `email-code`, the page also sends
a six-digit code to that address and asks for it before it creates the account:
it checks that the server can send e-mail, so the mail settings (`smtp`, or
`file` for a test) must already work at the installation. Keep the ten recovery
codes it shows.

Astro Sync on a computer is connected to a `password` server with the code of
the account page (« Pair a new device »), in its window or from the command line
with `astro-sync pair`; with `email-code` it signs in with `astro-sync sign-in`,
like the phone.

**A private server has one account**, the administrator's. It is never given
a second one: another e-mail address that asks for a code is told « Ce
portail appartient à quelqu’un d’autre. » (in the web page, in the
application and in Astro Sync, in the ten languages) and receives nothing.
To show your captures to someone, give them the address of your private
gallery in the mode « Accessible à tous par son adresse »: the visitor needs
no account.

What a private server offers is its open-source profile
(`GET /api/v1/capabilities`): several plans, no cap on plans, captures,
storage or history, framings saved and edited, mosaics included. The server
never restricts what it serves. `GET /api/v1/entitlements` answers the same
capabilities with no purchase (`"purchases": []`): the applications read it
the same way on any server.

`pointing.solve` stays `false` in that profile, and it is not a restriction: the
aiming of the phone application (the plate-solving screen that points the
telescope) is a right of the application itself, which a server never grants.
The server neither opens nor closes it; the application decides from its own
rights.

Multi-night plans are available without any restriction on a private server:
created, changed and archived on the web, their nights attached, the
integrations Astro Sync sends and the image of the plan received. The server
never restricts them.

## Running it

```bash
NODE_ENV=production node --env-file=/path/to/astro-portal.env apps/portal-oss/server.mjs
```

At start the service checks its sign-in settings, takes the SQLite lease,
refuses a database migrated by a newer version, takes a backup before any
migration, migrates, then serves. On `SIGTERM` it stops accepting, lets the
requests in flight finish (5 s at most) and exits.

### macOS with launchd

1. Create a deployment root (for example in your home folder) with a
   `logs/` folder and the environment file `astro-portal.env` (`chmod 600`).
2. Deploy a first release into it (see « Updating with releases » below), or
   point the plist at a checkout.
3. Copy [deploy/macos/org.astro-portal.plist.example](../deploy/macos/org.astro-portal.plist.example)
   to `~/Library/LaunchAgents/org.astro-portal.plist`, replace every
   `REPLACE_ME` value (`which node` for the Node path), then:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/org.astro-portal.plist
launchctl kickstart -k gui/$(id -u)/org.astro-portal   # restart
```

A launchd agent runs while its person is logged in; macOS must not sleep
while the portal serves (System Settings → Energy).

### Linux with systemd

Adapt [deploy/systemd/astro-portal.service.example](../deploy/systemd/astro-portal.service.example),
copy it to `/etc/systemd/system/astro-portal.service`, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now astro-portal
```

### Docker

[apps/portal-oss/Dockerfile](../apps/portal-oss/Dockerfile) builds a
distroless image from the repository's root; everything the service writes
goes to the `/data` volume:

```bash
docker build -f apps/portal-oss/Dockerfile -t astro-portal .
docker run -d -p 8787:8787 -v astro-portal-data:/data \
  --env-file /path/to/astro-portal.env astro-portal
```

### Reverse proxy or tunnel

To open the portal beyond your network, put it behind a reverse proxy that
terminates https (Caddy, nginx, …) or a tunnel of your choice, start it with
`HOST=127.0.0.1`, and set `ASTRO_PORTAL_CLIENT_IP_HEADER` (and
`ASTRO_PORTAL_TRUSTED_PROXIES`) to the header your proxy writes. Set
`ASTRO_PORTAL_PUBLIC_URL` to the https address. The administration stays
refused through a tunnel that adds its own headers; use it from the local
network.

With the installer's compose, the same three settings go into `portal.env`:
`ASTRO_PORTAL_BIND_ADDRESS=127.0.0.1` (the port is then published on this
machine only, so that nothing but the tunnel or the proxy reaches the portal),
`ASTRO_PORTAL_CLIENT_IP_HEADER` (`cf-connecting-ip` behind a Cloudflare
tunnel) and `ASTRO_PORTAL_PUBLIC_URL`. Without the first one, the port stays
open to the whole network and the client header must not be set: every visitor
coming through the tunnel then counts as one origin, for the sign-in limits as
for the reports of the public gallery.

### The tunnel as a container

A named Cloudflare tunnel can run beside the compose, from the official
`cloudflare/cloudflared` image, its credentials kept outside the checkout and
mounted read-only. In a folder outside the checkout (for example
`$HOME/astro-portal-tunnel/`), keep the tunnel's credentials file
(`<tunnel id>.json`) and a `config.yml`:

```yaml
tunnel: <tunnel id>
credentials-file: /etc/cloudflared/<tunnel id>.json
ingress:
  - hostname: portal.example.test
    service: http://portal:8787
  - service: http_status:404
```

and a `compose.tunnel.yaml` beside them:

```yaml
services:
  tunnel:
    image: cloudflare/cloudflared:<a version you choose>
    restart: unless-stopped
    user: "<uid>:<gid>"
    command: tunnel --no-autoupdate --config /etc/cloudflared/config.yml run
    volumes:
      - "${HOME}/astro-portal-tunnel:/etc/cloudflared:ro"
    depends_on:
      - portal
```

The image runs as an unprivileged user of its own, which cannot read a
credentials file that only you can read (and it should stay that way: the file
is a secret). `user:` makes the container run as you, so that it reads the
mounted folder: replace `<uid>:<gid>` with the output of `id -u` and `id -g`
joined by a colon. Without it, `docker compose … logs tunnel` ends with a
« permission denied » on the credentials file and the container restarts in a
loop.

Then, from the checkout:

```bash
docker compose --env-file "$HOME/astro-portal-data/portal.env" \
  -f compose.yaml -f "$HOME/astro-portal-tunnel/compose.tunnel.yaml" up -d
```

The ingress names the `portal` service of the compose's own network, never a
port of the host. Checks: `docker compose … logs tunnel` shows the
connections registered; `curl https://portal.example.test/api/v1/service`
answers; the administration opens at `http://localhost:<port>` on the machine
itself and is refused through the tunnel. To stop the tunnel alone:
`docker compose … -f compose.tunnel.yaml stop tunnel`.

### Colima on macOS: sharing the disk

Colima runs Docker in a small virtual machine and shares your files with it
only as far as you tell it to. By default it shares your home folder
**read-only**, and nothing else: a compose that mounts the data folder or the
tunnel's folder from an external drive finds an empty folder, or cannot write
into it (the database cannot open, the portal restarts). To share the folders
the compose mounts, list them when the machine starts, writable for the data
folder and read-only for the tunnel's:

```bash
colima stop
colima start --mount "/Volumes/<drive>/astro-portal-data:w" \
  --mount "$HOME/astro-portal-tunnel:ro"
```

(`:w` means writable.) The same list can be kept in the `mounts:` section of
Colima's configuration file (`colima start --edit`), so that every start
shares it. Checks: `docker run --rm -v "<a shared folder>:/data" alpine ls /data`
lists the folder's files, and `docker compose … logs portal` shows the portal
started on the data it should. The disk image of Colima is the virtual
machine's own; it is not moved the way Docker Desktop's is.

### Docker Desktop on macOS: its disk on an external drive

Docker Desktop keeps every image, container and volume in one disk image,
on the system disk by default. To put it on an external drive, before pulling
or building anything:

1. The drive is formatted APFS (`diskutil info /Volumes/<drive>` says
   « APFS »), and mounted before Docker Desktop starts: Docker Desktop does not
   start without its disk image.
2. Docker Desktop → Settings → Resources → Advanced → « Disk image location »:
   choose a folder of the external drive, then « Apply & restart ». Docker
   Desktop moves the disk image itself; do not copy it by hand.
3. Settings → Resources → File sharing: the drive's folders that a compose
   mounts (the data folder, the tunnel's folder) are shared; `/Volumes` is
   shared by default.
4. Checks: the disk image file (`Docker.raw`) is in the chosen folder and no
   longer at its former place
   (`~/Library/Containers/com.docker.docker/Data/vms/0/data/`); `docker info`
   answers; the system disk's free space (`df -h /`) is the same before and
   after pulling an image (`docker pull postgres:17-alpine`).

Keep the data folder of the portal on the same drive (`--data-dir` of the
installer).

## Backups and restore

- With SQLite, the service backs up its database before every migration, and every hour
  when `ASTRO_PORTAL_BACKUP_MAX_AGE_DAYS` is set; Administration → Backups
  lists them and requests a restore at the next start.
- `npm run backup:runtime -- --out <folder>` takes a backup by hand: the database
  (SQLite or PostgreSQL) and the manifest of the media files, and with
  `--with-media --media-dir <folder>` a copy of those files. The command does
  not read the environment file: give it `--database-path` (or
  `ASTRO_PORTAL_DATABASE_PATH`). Always give `--out` a folder outside
  `releases/` and `current/`: without it the backup lands in the release's
  own `backups/`, deleted with the release.
- `npm run restore:runtime -- --backup <folder> --target-path <empty folder>`
  restores a backup into an **empty** folder only (never over live data),
  then checks every table and file; point `ASTRO_PORTAL_DATABASE_PATH` (and
  the media folder) at the result and start the service.

## The target catalogue of a private portal

A portal with no initialization package ([STATIC_DATA.md](STATIC_DATA.md))
opens on its **curated catalogue**: 91 objects, the eleven bodies of the
Solar System and 80 curated deep-sky objects (mostly the Messier catalogue),
which is what the
planner's Catalogue tab counts. The hosted service holds the full library
(about seventeen thousand objects, imported from OpenNGC and curated in a
private package), which is why its planner suggests more targets for a night
than a fresh private portal: the two figures do not measure the same list.
The initialization package ([STATIC_DATA.md](STATIC_DATA.md)) brings a private
portal to the full library.

**Photographs.** The eleven Solar System photographs ship with the code and
with the image, in `examples/target-library-images/`, so a fresh portal shows
them without any import. They come from NASA's image library; the folder holds
their credits (`CREDITS.md`, `SOURCES.json`: NASA record, source, credit line,
licence). **They are NASA media used under the
[NASA media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/),
not part of Astro Portal's AGPL-3.0 source code.** The portal serves a file of
its own folder (`<runtime>/target-library/images/`) first and falls back to the
shipped one, so the import below is only needed to **refresh** them from NASA,
from a checkout of the repository, with the portal's data folder:

```sh
ASTRO_PORTAL_TARGET_LIBRARY_FILE=<data>/runtime/target-library/openngc.json \
  npm run import:solar-system-images -- --force
```

then restart the portal. The command needs the internet once and writes the
pictures and their `images.json` list; without `--force` it keeps what it has.
To refresh the pictures that ship with the code instead (a maintainer's
step), run `npm run import:solar-system-images -- --bundle` and check
`CREDITS.md` and `SOURCES.json`. The photographs of the deep-sky objects are
not shipped: without the library's images, those cards show the figure of
their object's type.

## Sample data

`npm run sample:install` installs the public sample night (plans, sessions,
captures) into the owner's space of a portal already set up:
see [SAMPLE_DATA.md](SAMPLE_DATA.md).

## Updating with releases

`npm run deploy:release` deploys the checked-out commit as an immutable
release, from the repository itself: `git archive` into
`<root>/releases/<commit>`, `npm ci`, the build, a candidate started on a
loopback port without your data and probed, a verified snapshot of the
SQLite database, the atomic switch of `<root>/current`, the restart of the
service, a probe of the live service, and the removal of old releases (three
are kept). A candidate that fails leaves `current` untouched; a live service
that does not answer after the switch puts `current` back on the previous
release and restarts it.

```bash
ASTRO_PORTAL_PRIVATE_ROOT=/path/to/deployment-root \
ASTRO_PORTAL_DATABASE_PATH=/path/to/deployment-root/private/portal.sqlite \
ASTRO_PORTAL_LAUNCHD_LABEL=org.astro-portal \
ASTRO_PORTAL_LIVE_URL=http://127.0.0.1:8787 \
npm run deploy:release -- --local
```

- `--local` deploys a commit of a repository without a remote; without it
  the commit must be pushed to its upstream.
- `ASTRO_PORTAL_RESTART_COMMAND` replaces launchd (for example
  `sudo systemctl restart astro-portal`); `--no-launchd` restarts nothing.
- `ASTRO_PORTAL_CANDIDATE_PORT` (default 8878) is the candidate's port.

Keep the database, the environment file and your data below the deployment
root but outside `releases/` and `current/`: a release holds code only.

## Moving from another portal

Stop the old service, copy its database (a `VACUUM INTO` snapshot, or the
file of a stopped service) and its data folders below the new deployment
root, set `ASTRO_PORTAL_DATABASE_PATH` and the folders to the copies, then
start: the service backs the database up and migrates it. Keep the original
untouched until the new portal has been checked.

The database of an earlier Astro Portal migrates this way, from whichever
schema version: its owner stays the owner and signs in with the same address. What
else to carry over, and where the new service looks for it:

| Data of the earlier portal                                    | Setting (default)                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Images and JSON catalogue of the gallery                      | `ASTRO_PORTAL_IMAGES_DIR`, `ASTRO_PORTAL_METADATA_DIR`                                            |
| `target-library/`, `plate-solves/`, `quality/`, `astrometry/` | below `ASTRO_PORTAL_RUNTIME_DIR`                                                                  |
| `static-data/` (the initialization package)                   | `ASTRO_PORTAL_STATIC_DATA_DIR` (`static-data/` next to the runtime directory)                     |
| The sky map previews of the gallery (`stellarium-previews/`)  | `ASTRO_PORTAL_STELLARIUM_DIR` (`stellarium-previews/` inside the catalogue folder): set it if not |
| `portal.config.json` (languages, public address)              | `ASTRO_PORTAL_CONFIG` (none)                                                                      |
| The sky-quality raster, which an earlier portal may not have  | `static-data/sky-quality/`, prepared as [SKY_QUALITY_RASTER.md](SKY_QUALITY_RASTER.md) says       |

Without the raster the planner says the light-pollution estimate is
unavailable. On macOS, `cp -cR` copies a folder of the same APFS volume
without taking its space again. The recovery codes and the authenticator of
an earlier portal no longer work: until the mail server is proven, keep the
fake mailbox at hand (`ASTRO_PORTAL_MAIL_SENDER=file` with
`ASTRO_PORTAL_MAIL_FILE_ALLOWED=1`, the code is read on the server).

## Read-only demonstration

Use the same open-source image with its **SQLite** default, on a dedicated
demonstration data volume. The PostgreSQL compose installation is not the
demonstration setup. First run without demo mode, create the owner's account
at `/auth/bootstrap`, and install the published sample with
`node scripts/sample-data/install.mjs --yes --database /data/astro-portal.sqlite
--images-dir /data/images --captures-dir /data/runtime/captures` after the owner's first sign-in
([SAMPLE_DATA.md](SAMPLE_DATA.md)).

Start the service with **exactly** `ASTRO_PORTAL_DEMO=1`. Every method except
`GET`, `HEAD` and `OPTIONS` is refused before routing or authentication,
including sign-in, bootstrap, administration and pack preparation: HTTP
`403`, `Cache-Control: no-store`, v1 error code `demo_read_only`, and
“This demonstration is read-only: nothing can be changed.” in the requested
language (English if none is known). No banner or extra screen is added.
Visitors see only the owner's gallery and guest planner, as
on any private portal. Forms already displaying a server error show this
message in place; forms using a generic error keep that existing text.

To put the demonstration back as it was, stop the service and restore a copy
of its data volume (database, images and captures) taken before it was opened
to visitors. Keep that copy private: it contains the owner's account as well as
the demonstration data.

For the files this private portal serves and how to add them, see
[Adding packs to a private portal](OFFLINE_PACKS.md#adding-packs-to-a-private-portal).
