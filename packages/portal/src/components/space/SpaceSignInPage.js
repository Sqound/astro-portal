"use client";

import { useEffect, useRef, useState } from "react";
import { signInCopyFor } from "./sign-in-copy.js";
import { otpDigitOfKey, otpDigits, otpInsert } from "../otp-code.js";
import { signInDestination } from "./destination.js";
import {
  askLaterNotice,
  clock,
  noticeContent,
  noticeUntil,
  refusalNotice,
  secondsUntil,
} from "./sign-in-notices.js";

/**
 * The web sign-in by e-mail code: an address, then the six-digit code received by
 * e-mail. Where spaces are open to any address (`spaceCreation: "open"`) one entry: an
 * address without a space gets one. On a private server (`"closed"`) only
 * its owner's address receives a code, and a recovery code is the way back
 * when the e-mail no longer leaves (`/auth/recovery`). The language is the
 * page's (`locale`), the same as the header's selector.
 */
const CODE_ROUTE = "/api/v1/sign-in/code";
const VERIFY_ROUTE = "/api/v1/sign-in/verify";
const STARTING_RETRIES = 6;

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function post(route, body) {
  let response;
  try {
    response = await fetch(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return { offline: true };
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  // A gateway in front of a sleeping service answers without the envelope.
  if (!payload?.error && [502, 503, 504].includes(response.status))
    return { status: response.status, error: { code: "service_starting" } };
  // `Retry-After` says, in seconds, what the body's `retryAt` says as a date.
  return {
    status: response.status,
    retryAfter: response.headers.get("retry-after"),
    ...(payload || {}),
  };
}

function CodeInput({ value, onChange, onComplete, disabled, copy }) {
  const inputs = useRef([]);
  const digits = otpDigits(value);
  const update = (next) => {
    const joined = next.join("");
    onChange(joined);
    if (joined.length === 6 && !joined.includes(" ")) onComplete?.(joined);
  };
  const insert = (index, raw) => {
    const written = otpInsert(digits, index, raw);
    if (!written) return;
    update(written.next);
    inputs.current[written.focus]?.focus();
  };
  return (
    <div className="otp-input" role="group" aria-label={copy.codeGroup}>
      {digits.map((digit, index) => (
        <input
          aria-label={copy.digit(index + 1)}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          autoFocus={index === 0}
          className="otp-digit"
          disabled={disabled}
          inputMode="numeric"
          key={index}
          maxLength={1}
          onChange={(event) => {
            if (event.target.value) insert(index, event.target.value);
            else {
              const next = [...digits];
              next[index] = "";
              onChange(next.join(""));
            }
          }}
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => {
            const typed = otpDigitOfKey(event);
            if (typed) {
              // A digit is written from the key itself: a cell that holds one
              // takes the new one, and no `input` event is waited for.
              event.preventDefault();
              insert(index, typed);
              return;
            }
            if (event.key === "Backspace" && !digits[index] && index > 0)
              inputs.current[index - 1]?.focus();
          }}
          onPaste={(event) => {
            event.preventDefault();
            insert(index, event.clipboardData.getData("text"));
          }}
          ref={(element) => {
            inputs.current[index] = element;
          }}
          type="text"
          value={digit}
        />
      ))}
    </div>
  );
}

/**
 * `aboveForm` is what the composition says above the form (a node drawn as it
 * is, once the page is reached from a link of its own), and `initialEmail`
 * the address it fills in, which stays editable; everything else is the
 * same.
 */
export function SpaceSignInPage({
  locale = "en",
  next = null,
  termsUrl = null,
  privacyUrl = null,
  spaceCreation = "open",
  aboveForm = null,
  initialEmail = "",
}) {
  const copy = signInCopyFor(locale, { spaceCreation });
  const closed = spaceCreation === "closed";
  const recoveryHref = `/auth/recovery${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState(initialEmail);
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const requestingRef = useRef(false);
  const [notice, setNotice] = useState(null);
  const [resendAt, setResendAt] = useState(null);
  // The address a new code has just left for, from the code step: the
  // previous code is replaced, and the page says so.
  const [resentTo, setResentTo] = useState(null);
  const [lockedUntil, setLockedUntil] = useState(null);
  // The service said it sends no code until then (`503 sign_in_unavailable`
  // with a date): nothing asks for one before.
  const [suspendedUntil, setSuspendedUntil] = useState(null);
  const [, setTick] = useState(0);
  const now = Date.now();
  const resendSeconds = secondsUntil(resendAt, now);
  const lockedSeconds = secondsUntil(lockedUntil, now);
  const suspendedSeconds = secondsUntil(suspendedUntil, now);
  const suspended = suspendedSeconds > 0;
  // A notice counts to an instant of its own, and is drawn from the clock:
  // « dans 0:24 » is never written once and left standing.
  const noticeSeconds = secondsUntil(noticeUntil(notice), now);

  useEffect(() => {
    if (!resendSeconds && !lockedSeconds && !suspendedSeconds && !noticeSeconds)
      return undefined;
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [resendSeconds, lockedSeconds, suspendedSeconds, noticeSeconds]);

  const refusal = (answer, { requesting = false } = {}) =>
    refusalNotice(answer, copy, { requesting, now: Date.now() });

  async function send(route, body, { requesting }) {
    for (let attempt = 0; ; attempt += 1) {
      const answer = await post(route, body);
      if (
        answer.error?.code !== "service_starting" ||
        attempt >= STARTING_RETRIES
      )
        return answer;
      setNotice({
        title: copy.startingTitle,
        body: requesting ? copy.startingRequestBody : copy.startingBody,
      });
      await wait(Math.max(2, secondsUntil(answer.retryAt) || 10) * 1000);
    }
  }

  async function requestCode(event) {
    event?.preventDefault();
    // Nothing is asked of a service that said it sends no code for now (the
    // buttons are locked, the keyboard's Enter is not).
    // One request at a time, held by a ref -- `busy` is a state, read from
    // the render a second submit of the same task still holds. That second
    // request answered `429 sign_in_rate_limited` beside the first one's
    // `202`: the page said a code was sent and the console logged the
    // refusal.
    if (busy || suspended || requestingRef.current) return;
    requestingRef.current = true;
    setBusy(true);
    setNotice(null);
    let answer;
    try {
      answer = await send(
        CODE_ROUTE,
        // The code is typed on this page: the message says so.
        { email, language: locale, client: "web" },
        { requesting: true },
      );
    } finally {
      requestingRef.current = false;
    }
    setBusy(false);
    if (answer.status === 202) {
      setResentTo(step === "code" ? answer.email : null);
      setSentTo(answer.email);
      setResendAt(answer.resendAt);
      setLockedUntil(null);
      setSuspendedUntil(null);
      setCode("");
      setStep("code");
      return;
    }
    if (answer.error?.code === "sign_in_locked") {
      setLockedUntil(answer.retryAt);
      setStep("code");
    } else if (
      answer.error?.code === "sign_in_rate_limited" ||
      // A `429` that is not the service's envelope (a gateway in front of it,
      // a limit of its own) is a wait too: from the address step it never
      // reads as a code that left.
      (answer.status === 429 && !answer.error?.code)
    ) {
      // From the address step nothing left from this page: it says to wait,
      // and stays on the address -- never « Nous avons envoyé un code ». From
      // the code step (a resend) the code of this page is still the last one:
      // the resend waits, the notice says so.
      if (step === "email") {
        setNotice(askLaterNotice(answer, copy, Date.now()));
        return;
      }
      setResendAt(answer.retryAt ?? null);
    }
    const problem = refusal(answer, { requesting: true });
    if (problem.kind === "sending-suspended") setSuspendedUntil(problem.until);
    setNotice(problem);
  }

  async function verify(candidate = code) {
    if (busy || candidate.length !== 6) return;
    setBusy(true);
    setNotice(null);
    setResentTo(null);
    const answer = await send(
      VERIFY_ROUTE,
      { email: sentTo, code: candidate, client: "web" },
      { requesting: false },
    );
    if (answer.status === 200 && answer.space) {
      window.location.assign(
        signInDestination(next, locale, window.location.origin),
      );
      return;
    }
    setBusy(false);
    if (answer.error?.code === "sign_in_locked") setLockedUntil(answer.retryAt);
    if (answer.error?.code === "sign_in_code_incorrect") setCode("");
    setNotice(refusal(answer));
  }

  const shown = noticeContent(notice, copy, { now, locale });
  const notification = shown ? (
    <div className="auth-error" role="alert">
      {shown.title ? <p>{shown.title}</p> : null}
      {shown.body ? <p>{shown.body}</p> : null}
      {shown.link ? (
        <p>
          <a className="btn-link" href={shown.link.href}>
            {shown.link.label}
          </a>
        </p>
      ) : null}
    </div>
  ) : null;
  // A private server's way back, when the e-mail no longer leaves.
  const recovery = closed ? (
    <div className="auth-secondary-actions">
      <a className="btn-link" href={recoveryHref}>
        {copy.recoveryLink}
      </a>
    </div>
  ) : null;

  if (step === "email")
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
          {aboveForm}
          <form className="auth-form auth-fields" onSubmit={requestCode}>
            <label htmlFor="space-email">{copy.emailLabel}</label>
            <input
              id="space-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              aria-describedby="space-email-help"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <p id="space-email-help" className="auth-help">
              {copy.emailHelp}
            </p>
            <button
              className="btn-primary auth-primary"
              type="submit"
              disabled={busy || suspended}
            >
              {busy ? copy.requesting : copy.requestCode}
            </button>
            {termsUrl && privacyUrl ? (
              <p className="auth-help">
                {copy.legalBefore}
                <a href={termsUrl}>{copy.terms}</a>
                {copy.legalBetween}
                <a href={privacyUrl}>{copy.privacy}</a>
                {copy.legalAfter}
              </p>
            ) : null}
          </form>
          {notification}
          {recovery}
        </section>
      </main>
    );

  const locked = lockedSeconds > 0;
  // What waits before a code may be asked for again: a lock, or a
  // suspension of the sending (the six boxes of a code already received are
  // locked by the first only). « Renvoyer le code » also waits for the wait
  // between two messages.
  const askSeconds = Math.max(lockedSeconds, suspendedSeconds);
  const resendWait = Math.max(resendSeconds, suspendedSeconds);
  const expiredNotice =
    shown?.title === copy.expiredTitle || shown?.title === copy.lockedTitle;
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>{copy.codeTitle}</h1>
        <p>
          {copy.codeSentTo}
          <strong>{sentTo}</strong>
          {copy.codeSentAfter}
        </p>
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            verify();
          }}
        >
          <CodeInput
            value={code}
            onChange={setCode}
            onComplete={verify}
            disabled={busy || locked}
            copy={copy}
          />
          <p className="auth-help">{copy.validity}</p>
          {resentTo && !notification ? (
            <p className="auth-help auth-resent" role="status">
              {copy.resent(resentTo)}
            </p>
          ) : null}
          {notification}
          {expiredNotice ? (
            <button
              className="btn-primary auth-primary"
              type="button"
              disabled={busy || askSeconds > 0}
              onClick={requestCode}
            >
              {askSeconds > 0
                ? copy.newCodeIn(clock(askSeconds))
                : copy.newCode}
            </button>
          ) : (
            <button
              className="btn-primary auth-primary"
              type="submit"
              disabled={busy || locked || code.length !== 6}
            >
              {busy ? copy.verifying : copy.verify}
            </button>
          )}
        </form>
        <p className="auth-help">{copy.nothingReceived}</p>
        <div className="auth-secondary-actions">
          <button
            className="btn-link"
            type="button"
            disabled={busy || locked || resendWait > 0}
            aria-label={
              resendWait > 0 ? copy.resendAria(resendWait) : undefined
            }
            onClick={requestCode}
          >
            {resendWait > 0 ? copy.resendIn(clock(resendWait)) : copy.resend}
          </button>
          <button
            className="btn-link"
            type="button"
            disabled={busy}
            onClick={() => {
              setStep("email");
              setNotice(null);
              setResentTo(null);
              setCode("");
            }}
          >
            {copy.changeAddress}
          </button>
          {closed ? (
            <a className="btn-link" href={recoveryHref}>
              {copy.recoveryLink}
            </a>
          ) : null}
        </div>
      </section>
    </main>
  );
}
