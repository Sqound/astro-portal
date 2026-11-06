/**
 * The addresses a server that opens spaces accepts in its settings: `https`, or
 * `http` on the machine itself only (localhost, 127.0.0.1, [::1]), for
 * development. A code, a link or a key never travels over plain `http`
 * across a network. A private server may name an `http` address of its own
 * network (configuration.js `allowPlainHttp`): it is the address its owner
 * already uses, and its sessions travel the same way.
 */

/** `localhost`, `127.0.0.1` or `[::1]`, as a URL's `hostname` writes them. */
export function isLoopbackHost(hostname) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(
    String(hostname).toLowerCase(),
  );
}

export function isSecureOrLocalUrl(url) {
  return (
    url.protocol === "https:" ||
    (url.protocol === "http:" && isLoopbackHost(url.hostname))
  );
}
