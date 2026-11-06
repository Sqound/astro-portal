# Security policy

Please do not publish an exploitable vulnerability in a public issue. Use the
repository's private **Report a vulnerability** feature, or write to
[dev@sqound.jp](mailto:dev@sqound.jp). Include the affected version and
route, the conditions of exploitation, and a minimal reproduction without
personal data.

## Security model

- A private server is one person's. Its owner signs in by password or by a
  code received by e-mail (docs/PRIVATE_NOTEBOOK_AUTH.md); devices hold a
  token of their own, which the owner can detach. Without
  `ASTRO_PORTAL_AUTH_MODE`, the service has no private API at all.
- The web session's cookies are `Secure` in production. A server of the
  local network may turn that off (`ASTRO_PORTAL_COOKIE_SECURE=false`); such
  a server must never be exposed to the Internet.
- The administration is allowed from `localhost` and from the addresses you
  list (`ASTRO_PORTAL_ADMIN_ALLOWED_IPS`), and refused through a tunnel that
  adds its own headers. An IP address is not authentication for an
  Internet-facing administration: behind another reverse proxy, add strong
  proxy-level authentication and deny the administration routes by default.
- Media paths are confined to their configured folders; no answer of the
  service is reinterpreted by a browser as another type
  (`X-Content-Type-Options: nosniff`), and a person's files are served with
  a sandboxing content policy.
- Behind a proxy or a tunnel, the limits (sign-in, pairing, logs) read a
  visitor's address only from the header you name
  (`ASTRO_PORTAL_CLIENT_IP_HEADER`), and only when nothing else reaches the
  service.
