# Private server: persistence and sign-in

A private server is a space for one person: its owner, the one administrator
created at its installation. It has one account and never creates a second:
another e-mail address is refused, and no one is invited. The JSON catalogue and
every original, TIFF, PNG, preview, and plate-solving asset stay outside the
database; SQLite (or PostgreSQL) holds the private, changing data: the
organization, the owner and its membership, hashed recovery codes, server
sessions, devices, plans and locations, the counters of the sign-in, and
minimal audit records.

SQLite uses the built-in `node:sqlite` driver. The repository boundary and SQL
use UUIDs, UTC ISO timestamps, `tenant_id`, text JSON documents, and standard
upsert syntax, so that the PostgreSQL driver replaces only the driver and the
migration runner.

## Two ways to sign in

Authentication is **disabled by default** (`ASTRO_PORTAL_AUTH_MODE=disabled`:
no private API, the public catalogue only). A private server chooses one of
two modes:

| Mode         | The owner signs in with                                                           | Devices (PlanAstro, Astro Sync)                                                                | Needs                         |
| ------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------- |
| `email-code` | the owner's e-mail address, then a six-digit code received by e-mail; no password | sign in by themselves, the same way, and appear in « Mes appareils » (renamed, detached there) | a way to send e-mail (`smtp`) |
| `password`   | the owner's e-mail address and a password of 14 characters or more                | are paired with the code the account page shows (« Associer un nouvel appareil »)              | nothing beyond the server     |

`email-code` is the sign-in by a code sent by e-mail, for one address: the server announces `signIn: { method: "email-code", spaceCreation:
"closed", codeLength: 6 }` in `GET /api/v1/service`. Any other address is
refused plainly — « Ce portail appartient à quelqu’un d’autre. » (`403`
`not_owner`) — and receives nothing: a private server has nothing to hide
from enumeration. Before the installation every address is refused with
`409` `not_initialized`, which names `/auth/bootstrap`. There is no deletion
of the space: the owner deletes the server. Choose `password` when the
server cannot send e-mail.

`totp`, the authenticator of the first private servers, **no longer exists**:
a server set to `ASTRO_PORTAL_AUTH_MODE=totp` does not start, and says which
two modes to choose. Its `totp_credentials` and `bootstrap_enrollments`
tables stay in the schema, unused (no destructive migration). To move a
server that used it: set the new mode and its settings, then sign in once
with a recovery code (the `password` mode asks for the new password at that
moment).

## Settings

Put them in the private environment of the service (never
`portal.config.json`, a release directory, Git, or a shell history). The
service refuses to start while one it needs is missing or wrong, and names
the setting — never its value.

| Setting                                         | Modes                    | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ASTRO_PORTAL_AUTH_MODE`                        | all                      | `disabled` (default), `password` or `email-code`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `ASTRO_PORTAL_DATABASE_PATH` or `_DATABASE_URL` | both                     | The private database (a SQLite path below the private root, or a PostgreSQL URL). Required once the sign-in is on.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ASTRO_PORTAL_BOOTSTRAP_SECRET`                 | both                     | A long random secret, typed once at `/auth/bootstrap`; it works only while no account exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `ASTRO_PORTAL_SIGN_IN_KEY`                      | both                     | **Required.** 32 random bytes in base64 (`openssl rand -base64 32`): the key of the codes sent by e-mail, of the counters of the locks and of the recovery codes. Changing it invalidates the recovery codes.                                                                                                                                                                                                                                                                                                                                                                                |
| `ASTRO_PORTAL_PUBLIC_URL`                       | `email-code`             | **Required.** The address of the portal as its owner opens it, used in the link of the message: `https://…`, or `http://…` on a private server of the local network.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `ASTRO_PORTAL_MAIL_SENDER`                      | `email-code`             | **Required.** `smtp`, or `file` (the fake mailbox, for a test). Without a sender no code can leave, and the service does not start.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ASTRO_PORTAL_SMTP_URL`                         | `email-code` with `smtp` | `smtps://user:password@host:465` (TLS from the first byte) or `smtp://user:password@host:587` (STARTTLS, required). An `@`, `:` or `/` of the user name or of the password is written `%40`, `%3A`, `%2F`.                                                                                                                                                                                                                                                                                                                                                                                   |
| `ASTRO_PORTAL_SMTP_ALLOW_INSECURE`              | `email-code` with `smtp` | `1` for a relay of the local network that offers no TLS, or whose certificate cannot be verified. Never for a server reached across the Internet.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `ASTRO_PORTAL_MAIL_FROM`                        | `email-code` with `smtp` | **Required.** The sender of every message, e.g. `Astro Portal <vous@example.com>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ASTRO_PORTAL_MAIL_FILE_DIR`                    | `email-code` with `file` | Where the fake mailbox writes its messages (default `<runtime>/mailbox`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ASTRO_PORTAL_MAIL_FILE_ALLOWED`                | `email-code` with `file` | `1` to allow the fake mailbox in production: it writes the codes on disk. Tests and trials only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ASTRO_PORTAL_MAIL_HOURLY_BUDGET`, `_MINUTE_…`  | `email-code`             | The e-mail budget of the server (default 80 an hour, 20 a minute).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ASTRO_PORTAL_COOKIE_SECURE`                    | both                     | Unset: the session cookies are `Secure` (`__Host-`) when `NODE_ENV=production`, so a browser keeps the web session only over https or on `localhost`; `true` makes them `Secure` in development too. `false`, said explicitly, is honoured by a private server only: its cookies are then plain, and the web session holds over `http://` — **for a server of the local network, never exposed to the Internet** (the service says so in its log at start). Otherwise open the portal over https (a reverse proxy, a tunnel). The applications, which use a device token, are not concerned. |
| `ASTRO_PORTAL_CLIENT_IP_HEADER`                 | both                     | The header naming a visitor's address behind a reverse proxy (`x-forwarded-for`, `cf-connecting-ip`…), or `socket`. Every lock counts against this origin.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `ASTRO_PORTAL_TRUSTED_PROXIES`                  | both                     | How many proxies stand in front of the service (1 to 10, default 1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `ASTRO_PORTAL_HOSTED_SPACES`                    | `email-code`             | `off` so that `email-code` is the private server's own, for its owner. The open-source server does not need it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

`ASTRO_PORTAL_TOTP_ENCRYPTION_KEY` is gone: remove it.

At start, a server in the `email-code` mode says once in its log how its
codes leave, for instance `by smtp through smtp.example.com:587 (STARTTLS
required)`: the host and the port, never the address, which holds the
password.

## Installing (`/auth/bootstrap`)

Open `/auth/bootstrap` before the first account exists, with the bootstrap
secret:

- `email-code`: the secret, the name of the organization and the owner's
  address. A code leaves **at once** for that address; typing it creates the
  account and signs the browser in. A sender set up wrong is seen at the
  installation, not on the first night out.
- `password`: the secret, the organization, the address and a password of 14
  characters or more (twice). The account is created and the browser signed
  in at once.

In both modes the page then shows **ten recovery codes, once**. Keep them
offline. The installation happens once: do not delete rows to reopen it.

## Signing in

- `email-code`: `/auth/sign-in` — the owner's address, then the six-digit
  code of the message (or its link, which opens the application or the page
  `/auth/link`). The page speaks of « votre portail », never of creating a
  space.
- `password`: `/auth/login` — the address and the password.

A signed-out visitor of a private page is sent to the page of the mode, and
comes back to the page it asked for.

## Recovery codes (`/auth/recovery`)

A recovery code signs in whatever the mode — the way back when the e-mail no
longer leaves, or when the password is lost — and is used up once it has.
In the `password` mode it comes with a **new password**, set at once: this is
how a lost password is replaced, and how a server moved from `email-code` to
`password` gets its first password. After every code is used, recovery
requires restoring a verified backup.

## Devices

- `email-code`: a device signs in by itself with the owner's address and a
  code, and receives its own token. The account page is the space page,
  « Compte »: « Mes appareils » lists the devices, which are renamed and
  detached there, in the words of a portal of one person (« votre portail »).
  Astro Sync signs in the same way (`application: "sync"`) and is never
  counted against the rule of one device, one space.
- `password`: the account page shows « Associer un nouvel appareil »: an
  eight-character code (and its QR code) that the device claims
  (`POST /api/v1/devices/claim`), as before.

## The locks

Every counter is a keyed digest under `ASTRO_PORTAL_SIGN_IN_KEY`; no address
and no network address is stored.

- **Codes by e-mail**: a code lives 10 minutes
  and can be tried 5 times; at most 5 codes an hour per address, one a
  minute; five failures of an address from one network origin, or twenty from
  every origin within the hour, lock the address for 15 minutes, then 1 hour,
  then 24 hours when it comes back within 24 hours. The link of the message is
  never locked.
- **Password**: five failures for an address from one origin lock that pair
  for 15 minutes, then 1 hour, then 24 hours, as the codes; twenty failures
  of the address from every origin within the hour lock the address; thirty
  failures from one origin within the hour, whatever the address, refuse that
  origin until the hour ends. The page says until when (« Trop d’essais :
  cette adresse ne peut plus se connecter d’ici avant 21:40. »). Someone who
  knows the address can, from one origin, only hold back themselves.
- A **recovery code** is never held back by the lock of an address: it is the
  way back of the owner whom someone else locked out. Only the budget of its
  own origin counts it.

Passwords use scrypt (N=32768, r=8, p=1) with unique random salts. Session
and CSRF tokens, device tokens and recovery codes are never stored in
plaintext; the session cookie is HttpOnly, Secure when configured, and
SameSite=Lax. All mutating authenticated APIs validate a separate CSRF token.

## Sending the codes: SMTP recipes

Use an application password where the provider has one, never the password of
the mailbox. `vous@example.com` stands for your own address.

- **iCloud Mail** (an address `@icloud.com`, `@me.com`, or a custom domain of
  iCloud+): create an app-specific password at appleid.apple.com, then

  ```text
  ASTRO_PORTAL_MAIL_SENDER=smtp
  ASTRO_PORTAL_SMTP_URL=smtp://vous%40example.com:app-specific-password@smtp.mail.me.com:587
  ASTRO_PORTAL_MAIL_FROM=vous@example.com
  ```

  Port 587, STARTTLS; the user name is the whole address, its `@` written
  `%40`.

- **Gmail**: turn on 2-step verification, create an app password (Google
  Account → Security → App passwords), then

  ```text
  ASTRO_PORTAL_MAIL_SENDER=smtp
  ASTRO_PORTAL_SMTP_URL=smtps://vous%40example.com:app-password@smtp.gmail.com:465
  ASTRO_PORTAL_MAIL_FROM=vous@example.com
  ```

- **Any provider**: its submission server, with TLS from the first byte on
  465 (`smtps://`) or STARTTLS on 587 (`smtp://`), and the credentials it
  gives:

  ```text
  ASTRO_PORTAL_MAIL_SENDER=smtp
  ASTRO_PORTAL_SMTP_URL=smtps://user:password@smtp.provider.example:465
  ASTRO_PORTAL_MAIL_FROM=Astro Portal <vous@example.com>
  ```

- **A relay of your own network** without TLS (a NAS, a home router):
  `smtp://relay.local:25` with `ASTRO_PORTAL_SMTP_ALLOW_INSECURE=1`. Only on
  your own network.

A message the mail server does not accept answers `502`
`email_delivery_failed`: nothing is counted as sent, and the page says so. To
try the server without a mail server, `ASTRO_PORTAL_MAIL_SENDER=file` writes
each message as JSON in the fake mailbox (with
`ASTRO_PORTAL_MAIL_FILE_ALLOWED=1` in production).

## Protected paths

When the sign-in is on, the planner page stays public so it can offer its
guest or sign-in choice. The custom Node server requires a valid session for
private plan data (`/api/plans`) and the administration (localized admin
paths and `/api/admin/*`). The public catalogue and media remain public. A
broken private configuration fails closed with HTTP 503 for those protected
paths.

## Planner transition

The existing `astro-portal:planner:v1` localStorage value is retained. The
planner first offers a guest or sign-in choice. Guest mode stays entirely in
localStorage. When a browser that holds guest plans signs in, an empty server
takes them without asking, a server that already holds plans asks « Vous avez N
plans dans ce navigateur. Les ajouter à votre portail ? », and what is taken
leaves the browser's store. Imports are idempotent: a plan the server
already holds is never sent twice. Subsequent planner changes are saved
automatically to the authenticated tenant server-side (and a copy of the
server's plans, kept under its own key, remains a fallback for the observing
site with no reception). The unobtrusive saving indicator is part of the
current plan card and does not shift the editor. Each plan also has local
undo/redo for title, plan items, location, equipment, and minimum-altitude
editing context; this is convenience history, not an audit-log rollback. The
API never mixes tenant IDs.

## Backup, restore, and PostgreSQL migration

Stop the service or take a SQLite-consistent backup before every migration:

```bash
sqlite3 "$ASTRO_PORTAL_DATABASE_PATH" '.backup /private/backups/portal-YYYYMMDD.sqlite'
sqlite3 /private/backups/portal-YYYYMMDD.sqlite 'PRAGMA integrity_check'
```

Keep the verified backup offline or in independently protected storage. To
restore, stop the service, preserve the failed database as a separate forensic
copy, replace only the exact configured database path with the verified backup,
then start the service and inspect `/api/auth/status`. Never restore into a
release directory.

For PostgreSQL, first take and verify this SQLite backup, run an explicit
one-way export/import that preserves UUIDs and UTC values, validate row counts
per tenant and authenticated API reads in a candidate environment, then change
only the private runtime configuration. The current release script must remain
data-free and must not run a production migration during candidate probing.
