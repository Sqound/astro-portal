import { sitePath } from "./safe-redirect.js";

/**
 * Where « Se connecter » leads: one answer for every page that draws a
 * link to the sign-in (the header's account menu, the empty public
 * gallery, the planner's entry), so none of them guesses.
 *
 * A private server signing in with its authenticator (the `password` mode)
 * has `/auth/login`; every other service signs in by e-mail code, at
 * `/auth/sign-in` (a server in `email-code`).
 * `/auth/login` does not exist there: a link to it is a 404. The service
 * itself says its page (`signInPath` of `GET /api/auth/status`, read on the
 * server by the root layout); only
 * when it did not (a read that failed) the page follows from the method.
 */
export const PASSWORD_SIGN_IN_PATH = "/auth/login";
export const EMAIL_CODE_SIGN_IN_PATH = "/auth/sign-in";

/**
 * The sign-in page of the service described by `authentication` (the shape
 * of `GET /api/auth/status`): the one it names when it is a path of this
 * site, else the one of its method.
 */
export function signInPageOf(authentication) {
  const named =
    typeof authentication?.signInPath === "string"
      ? sitePath(authentication.signInPath)
      : null;
  if (named && !/[?#]/.test(named)) return named;
  return authentication?.method === "password"
    ? PASSWORD_SIGN_IN_PATH
    : EMAIL_CODE_SIGN_IN_PATH;
}

/** The sign-in page, asked to bring the person back to `next` (a site path). */
export function signInHrefFor(authentication, next) {
  const page = signInPageOf(authentication);
  return next ? `${page}?next=${encodeURIComponent(next)}` : page;
}
