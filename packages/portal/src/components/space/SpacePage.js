"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { isShippedLocale } from "astro-contracts/locales";
import {
  WebConfirmDialog,
  WebDialog,
} from "portal/components/dialog/WebDialog.js";
import { DataExportSection } from "portal/components/account/DataExportSection.js";
import { DataImportSection } from "portal/components/account/DataImportSection.js";
import { LoadingState } from "portal/components/LoadingState.js";
import { csrfCookieValue } from "portal/csrf-cookie.js";
import {
  detachDevice,
  loadCalibration,
  loadDevices,
  loadSpace,
  nameProblem,
  renameDevice,
  setCalibration,
  signInPathFor,
  signOutBrowser,
  withdrawCalibration,
} from "./space-client.js";
import { spaceCopyFor } from "./space-copy.js";
import {
  MANAGE_TABS,
  manageCopyFor,
  managePath,
} from "../manage/manage-copy.js";
import { CapturesTab } from "../manage/CapturesTab.js";
import { EquipmentTab } from "../manage/EquipmentTab.js";
import { PortalTab } from "../manage/PortalTab.js";
import { PlansTab } from "../manage/PlansTab.js";
import { SessionsTab } from "../manage/SessionsTab.js";
import { getManageTab } from "../../manage/extensions.js";

/**
 * The page « Mon espace » on the web. Its head is the
 * identity card of the space — the address, the line of the service, the way
 * to sign in — then the tabs, one address each (`/{locale}/manage/<tab>`):
 * « Captures », « Galerie privée », « Appareils » (« Mes
 * appareils », renamed and detached from here), « Exports »
 * and « Réglages » (the calibration, this browser's sign-out, « Retours »,
 * then what the host application adds). Every section of the former space page
 * moved into a tab unchanged. It is the page of the space wherever a person
 * signs in by e-mail code: where spaces are open to any address (`spaceCreation: "open"`)
 * and on a private server (`"closed"`), whose words say « votre portail ». A
 * private server in the `password` mode keeps its own account page (devices
 * paired by code).
 *
 * The host application may add tabs (`portal/manage/extensions.js`) and a
 * zone: `renderAfter(context)` after the browser, which receives
 * what it needs of the page
 * (`context`: the number of devices, the `fetch`, the navigation, the
 * page's way out when the session ended, the CSRF token). A host application
 * that takes feedback draws its section at the foot of the page with
 * `renderFeedback(context)`, whose context adds `signedIn`, `signInHref`,
 * `signInLabel`, `spaceEmail` and `spacePath`; a private server draws none.
 *
 * The page asks the service for everything, in the browser, so that the
 * list is always the service's own, in its own order (the caller first,
 * PlanAstro before Astro Sync, then the most recently seen). It never
 * sorts, and after each write it reads the list again.
 */

const remember = (locale) => {
  try {
    document.cookie = `astro-portal-locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    // A page with no cookies still works: the next page speaks the default.
  }
};

const defaultNavigate = (path) => window.location.assign(path);
const defaultFetcher = (...args) => fetch(...args);

/** « 27 sept. » (with the year when it is not this year's). */
export function shortDate(value, locale, { timeZone, now = new Date() } = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const options = { day: "numeric", month: "short", timeZone };
  const year = (candidate) =>
    new Intl.DateTimeFormat("en", { year: "numeric", timeZone }).format(
      candidate,
    );
  if (year(date) !== year(now)) options.year = "numeric";
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/** What the line under a device says. */
export function deviceStatus(device, copy, { locale, timeZone, now } = {}) {
  if (device.current) return copy.activeNow;
  const synced = device.lastSyncAt || device.lastSeenAt;
  if (synced)
    return copy.syncedOn(shortDate(synced, locale, { timeZone, now }));
  return device.createdAt
    ? copy.attachedOn(shortDate(device.createdAt, locale, { timeZone, now }))
    : "";
}

const applicationName = (device) =>
  device.application === "sync" ? "Astro Sync" : "PlanAstro";

function deviceKind(device) {
  if (device.application === "sync") return "computer";
  if (["macos", "windows", "linux"].includes(device.platform))
    return "computer";
  if (
    String(device.name || "")
      .toLowerCase()
      .includes("ipad")
  )
    return "tablet";
  return "phone";
}

/**
 * What a failed call says, as `{ title, body }` (either may be absent).
 * `fallback` is what a failure of the service says; `offline` is what the
 * action itself says when the network is down (« rien n'a été détaché… »),
 * which then stands alone — without it, the network's own two sentences.
 */
export function failureWords(outcome, copy, { fallback, offline = null }) {
  switch (outcome?.kind) {
    case "offline":
      return offline
        ? { title: null, body: offline }
        : { title: copy.offlineTitle, body: copy.offlineBody };
    case "unreachable":
      return { title: copy.unreachableTitle, body: copy.unreachableBody };
    default:
      return { title: null, body: fallback };
  }
}

// ——— Icons ———

const Icon = ({ children, size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    {children}
  </svg>
);

const PhoneIcon = (props) => (
  <Icon {...props}>
    <rect x="6.5" y="3" width="11" height="18" rx="2.5" />
    <path d="M11 17.5h2" />
  </Icon>
);
const TabletIcon = (props) => (
  <Icon {...props}>
    <rect x="4.5" y="3" width="15" height="18" rx="2" />
    <path d="M11 17.5h2" />
  </Icon>
);
const ComputerIcon = (props) => (
  <Icon {...props}>
    <rect x="4.5" y="5" width="15" height="10.5" rx="1.5" />
    <path d="M3 19h18" />
  </Icon>
);
const PencilIcon = (props) => (
  <Icon {...props}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </Icon>
);
const UnlinkIcon = (props) => (
  <Icon {...props}>
    <path d="M9 7.5l1.2-1.2a4 4 0 0 1 5.7 5.7l-1.2 1.2" />
    <path d="M15 16.5l-1.2 1.2a4 4 0 0 1-5.7-5.7l1.2-1.2" />
    <path d="M4 4l16 16" />
  </Icon>
);
const UserIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="9" r="3.5" />
    <path d="M5.5 19c1.4-2.8 3.6-4.2 6.5-4.2s5.1 1.4 6.5 4.2" />
  </Icon>
);
const MailIcon = (props) => (
  <Icon {...props}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <path d="M4 7l8 6 8-6" />
  </Icon>
);
export const CrossIcon = (props) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
const CheckIcon = (props) => (
  <Icon {...props}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

const KIND_ICONS = {
  phone: PhoneIcon,
  tablet: TabletIcon,
  computer: ComputerIcon,
};

// ——— The bodies of the dialogs (exported: the tests read them, and the
// host application may draw its own with them) ———

export function Notice({ tone = "error", title = null, body = null }) {
  if (!title && !body) return null;
  return (
    <div
      className={`space-notice is-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {title ? <p className="space-notice-title">{title}</p> : null}
      {body ? <p>{body}</p> : null}
    </div>
  );
}

/** The rename dialog's field. `failure` is what the last attempt said. */
export function RenameForm({
  copy,
  formId,
  name,
  onName,
  onSubmit,
  busy = false,
  failure = null,
}) {
  const fieldId = useId();
  const problem = nameProblem(name);
  return (
    <form
      id={formId}
      className="space-rename-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!problem && !busy) onSubmit();
      }}
    >
      <label htmlFor={fieldId}>{copy.renameField}</label>
      <input
        id={fieldId}
        type="text"
        autoComplete="off"
        spellCheck="false"
        value={name}
        disabled={busy}
        aria-invalid={problem === "too-long" ? "true" : undefined}
        aria-describedby={
          problem === "too-long" ? `${fieldId}-help` : undefined
        }
        onChange={(event) => onName(event.target.value)}
      />
      {problem === "too-long" ? (
        <p id={`${fieldId}-help`} className="space-field-error" role="alert">
          {copy.renameTooLong}
        </p>
      ) : null}
      {failure ? <Notice title={failure.title} body={failure.body} /> : null}
    </form>
  );
}

export function DetachBody({ copy, failure = null }) {
  return (
    <div className="space-dialog-body">
      <ul className="space-consequences">
        <li>
          <UnlinkIcon size={18} />
          <span>{copy.detachAccessCut}</span>
        </li>
        <li>
          <PhoneIcon size={18} />
          <span>{copy.detachCopyErased}</span>
        </li>
        <li className="is-kept">
          <CheckIcon size={18} />
          <span>{copy.detachDataStays}</span>
        </li>
        <li>
          <UnlinkIcon size={18} />
          <span>{copy.detachReusable}</span>
        </li>
      </ul>
      {failure ? <Notice title={failure.title} body={failure.body} /> : null}
    </div>
  );
}

/**
 * The rename dialog. It is mounted only while it is open, so the field
 * starts with the device's current name each time.
 */
function RenameDialog({ copy, device, busy, failure, onClose, onSave }) {
  const formId = useId();
  const [name, setName] = useState(device.name);
  return (
    <WebDialog
      title={copy.renameTitle}
      closeLabel={copy.close}
      closeDisabled={busy}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn-link"
            disabled={busy}
            onClick={onClose}
          >
            {copy.cancel}
          </button>
          <button
            type="submit"
            form={formId}
            className="btn-primary"
            disabled={busy || Boolean(nameProblem(name))}
          >
            {copy.renameSave}
          </button>
        </>
      }
    >
      <RenameForm
        copy={copy}
        formId={formId}
        name={name}
        onName={setName}
        onSubmit={() => onSave(name)}
        busy={busy}
        failure={failure}
      />
    </WebDialog>
  );
}

// ——— The project's calibration set ———

/**
 * The rules of the calibration set, on the site in the page's language: the
 * privacy page, whose « sky calibration dataset » section states them (what
 * is kept, what never is, the withdrawal, a published release that cannot be
 * recalled). A stable page of `planastro.space` that exists in every shipped
 * language, not a repository path.
 */
export function contributionRulesUrl(locale) {
  const language = isShippedLocale(locale) ? locale : "en";
  return `https://www.planastro.space/${language}/privacy/`;
}

/**
 * The section as a function of its state (`calibration`, kept by
 * `CalibrationSection`): `loading`, `ready` (with `consent`, `busy`,
 * `withdrawing`, `error`, `notice`, `offline` when the last call found no
 * network — the last state then shows, read-only), `failed`. Off by default;
 * the switch is the only place the consent is asked; « Retirer mes
 * contributions » shows once something is kept.
 */
export function CalibrationView({
  copy,
  locale,
  calibration,
  timeZone,
  now,
  onSwitch,
  onWithdraw,
  onReload,
}) {
  const switchId = useId();
  const consent = calibration.consent;
  const ready = calibration.status === "ready" && consent;
  const locked =
    !ready ||
    calibration.busy ||
    calibration.withdrawing ||
    calibration.offline;
  const status = !ready
    ? null
    : consent.kept > 0
      ? copy.calibrationCount(
          consent.kept,
          shortDate(consent.lastKeptAt, locale, { timeZone, now }),
        )
      : consent.enabled
        ? copy.calibrationNoneYet
        : null;
  return (
    <section
      className="account-panel space-calibration"
      aria-labelledby="space-calibration-title"
      aria-busy={calibration.status === "loading" || calibration.busy}
      data-state={
        calibration.status !== "ready"
          ? calibration.status
          : calibration.withdrawing
            ? "withdrawing"
            : calibration.offline
              ? "offline"
              : consent?.enabled
                ? "on"
                : "off"
      }
    >
      <div className="account-panel-heading">
        <h2 id="space-calibration-title">{copy.calibrationTitle}</h2>
      </div>
      {calibration.status === "failed" ? (
        <div className="space-calibration-failure">
          <Notice
            {...failureWords(calibration.failure, copy, {
              fallback: copy.calibrationUnavailable,
            })}
          />
          <div className="space-actions">
            <button type="button" className="btn-link" onClick={onReload}>
              {copy.retry}
            </button>
          </div>
        </div>
      ) : (
        <>
          <label className="space-calibration-switch" htmlFor={switchId}>
            <span>{copy.calibrationSwitch}</span>
            <input
              id={switchId}
              type="checkbox"
              role="switch"
              checked={Boolean(consent?.enabled)}
              disabled={locked}
              aria-checked={Boolean(consent?.enabled)}
              onChange={(event) => onSwitch(event.target.checked)}
            />
            <span className="space-calibration-track" aria-hidden="true">
              <span />
            </span>
          </label>
          <p className="account-muted">{copy.calibrationIntro}</p>
          {status ? (
            <p className="space-calibration-status" role="status">
              {status}
            </p>
          ) : null}
          <ul className="space-calibration-terms">
            <li>{copy.calibrationKept}</li>
            <li>{copy.calibrationNotKept}</li>
            <li>{copy.calibrationRelease}</li>
            {consent?.enabled ? <li>{copy.calibrationOffKeeps}</li> : null}
          </ul>
          {calibration.offline ? (
            <Notice tone="info" body={copy.calibrationOffline} />
          ) : null}
          {calibration.error ? (
            <Notice
              title={calibration.error.title}
              body={calibration.error.body}
            />
          ) : null}
          {calibration.notice ? (
            <Notice tone="info" body={calibration.notice} />
          ) : null}
          <div className="space-actions space-calibration-actions">
            <a
              className="btn-link"
              href={contributionRulesUrl(locale)}
              target="_blank"
              rel="noreferrer"
            >
              {copy.calibrationRules}
            </a>
            {ready && consent.kept > 0 ? (
              <button
                type="button"
                className="btn-tertiary is-destructive"
                disabled={locked}
                onClick={onWithdraw}
              >
                {calibration.withdrawing
                  ? copy.calibrationWithdrawing
                  : copy.calibrationWithdraw}
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * The section of the space page where spaces are open to any address: it reads the consent
 * itself, switches it, and withdraws after a confirmation. A service that
 * keeps no calibration set (`not-available`) shows nothing.
 */
export function CalibrationSection({
  copy,
  locale,
  fetcher,
  csrf,
  leaves,
  timeZone,
  now,
  initial = null,
}) {
  const [calibration, setCalibrationState] = useState(
    () => initial || { status: "loading" },
  );
  const [confirming, setConfirming] = useState(false);
  const patch = (changes) =>
    setCalibrationState((current) => ({ ...current, ...changes }));

  const load = useCallback(async () => {
    setCalibrationState((current) =>
      current.status === "ready" ? current : { status: "loading" },
    );
    const outcome = await loadCalibration(fetcher);
    if (leaves(outcome)) return;
    setCalibrationState((current) =>
      outcome.kind === "ok"
        ? { status: "ready", consent: outcome.consent }
        : outcome.kind === "not-available"
          ? { status: "absent" }
          : outcome.kind === "offline" && current.status === "ready"
            ? { ...current, offline: true }
            : { status: "failed", failure: outcome },
    );
  }, [fetcher, leaves]);

  useEffect(() => {
    if (!initial) void load();
    // Once, at the opening of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const failed = (outcome) => {
    if (leaves(outcome)) return;
    if (outcome.kind === "offline")
      patch({ busy: false, withdrawing: false, offline: true });
    else
      patch({
        busy: false,
        withdrawing: false,
        error: failureWords(outcome, copy, {
          fallback: copy.calibrationFailed,
        }),
      });
  };

  async function onSwitch(enabled) {
    patch({ busy: true, error: null, notice: null, offline: false });
    const outcome = await setCalibration(fetcher, { enabled, csrf: csrf() });
    if (outcome.kind === "ok")
      setCalibrationState({ status: "ready", consent: outcome.consent });
    else failed(outcome);
  }

  async function withdraw() {
    setConfirming(false);
    patch({ withdrawing: true, error: null, notice: null, offline: false });
    const outcome = await withdrawCalibration(fetcher, { csrf: csrf() });
    if (outcome.kind === "ok")
      setCalibrationState({
        status: "ready",
        consent: outcome.consent,
        notice: copy.calibrationWithdrawn,
      });
    else failed(outcome);
  }

  if (calibration.status === "absent") return null;
  return (
    <>
      <CalibrationView
        copy={copy}
        locale={locale}
        calibration={calibration}
        timeZone={timeZone}
        now={now}
        onSwitch={onSwitch}
        onWithdraw={() => setConfirming(true)}
        onReload={() => void load()}
      />
      {confirming ? (
        <WebConfirmDialog
          title={copy.calibrationWithdrawTitle}
          cancelLabel={copy.cancel}
          closeLabel={copy.close}
          confirmLabel={copy.calibrationWithdraw}
          onCancel={() => setConfirming(false)}
          onConfirm={withdraw}
          tone="danger"
        >
          <div className="space-dialog-body">
            <p>{copy.calibrationWithdrawBody}</p>
          </div>
        </WebConfirmDialog>
      ) : null}
    </>
  );
}

// ——— The page ———

function DeviceRow({
  device,
  copy,
  locale,
  timeZone,
  now,
  onRename,
  onDetach,
}) {
  const Kind = KIND_ICONS[deviceKind(device)];
  const status = deviceStatus(device, copy, { locale, timeZone, now });
  return (
    <li className="space-device" data-device-id={device.id}>
      <Kind className="space-device-icon" size={22} />
      <div className="space-device-text">
        <p className="space-device-name">
          <span>{device.name}</span>
          <span className="space-device-app">{applicationName(device)}</span>
        </p>
        {status ? <p className="space-device-status">{status}</p> : null}
      </div>
      <div className="space-device-actions">
        <button
          type="button"
          className="space-icon-action"
          aria-label={copy.renameTooltip(device.name)}
          title={copy.renameTooltip(device.name)}
          onClick={() => onRename(device)}
        >
          <PencilIcon />
        </button>
        <button
          type="button"
          className="space-icon-action space-icon-action-danger"
          aria-label={copy.detachTooltip(device.name)}
          title={copy.detachTooltip(device.name)}
          onClick={() => onDetach(device)}
        >
          <UnlinkIcon />
        </button>
      </div>
    </li>
  );
}

/**
 * The tabs drawn: the core's, then each tab a host application added
 * (`added`, in the order it registered them) after the one it names
 * (`after`, in `portal/manage/extensions.js`), or at the end.
 */
export function tabsWith(core, added) {
  const shown = [...core];
  const placed = new Map();
  for (const candidate of added) {
    const anchor = getManageTab(candidate)?.after;
    const at = anchor ? shown.indexOf(anchor) : -1;
    if (at < 0) {
      shown.push(candidate);
      continue;
    }
    const count = placed.get(anchor) ?? 0;
    shown.splice(at + 1 + count, 0, candidate);
    placed.set(anchor, count + 1);
  }
  return shown;
}

/**
 * The page as a function of its state: `state` is what `SpacePage` keeps,
 * `actions` what it does (and `timeZone` and `now`, what dates are read
 * against, which a test may fix). `after` is what the host application draws
 * after this browser's zone.
 */
export function SpaceView({
  locale = "en",
  state,
  actions,
  tab = "captures",
  tabs = null,
  captures = null,
  plans = null,
  sessions = null,
  equipment = null,
  portal = null,
  calibration = null,
  dataExport = null,
  dataImport = null,
  feedback = null,
  after = null,
  // The tabs the host application adds for this request (`portal/manage/
  // extensions.js`), drawn after the core's, and the panel of the open one.
  extraTabs = [],
  extension = null,
  spaceCreation = "open",
  timeZone,
  now,
}) {
  const copy = spaceCopyFor(locale, { spaceCreation });
  const manage = manageCopyFor(locale);
  const { space, devices, dialog, notice, browser } = state;
  const added = extraTabs.filter((candidate) => getManageTab(candidate));
  const shownTabs = tabsWith(tabs || MANAGE_TABS, added);
  const tabLabel = (candidate) =>
    manage.tabs[candidate] ?? getManageTab(candidate)?.label(locale);

  if (state.ended === "signed-out")
    return (
      <main className="account-page space-page">
        <section
          className="account-panel space-ended"
          aria-labelledby="space-ended-title"
        >
          <h1 id="space-ended-title">{copy.sessionEndedTitle}</h1>
          <p className="account-muted">{copy.sessionEndedBody}</p>
          <div className="space-actions">
            <a className="btn-primary" href={signInPathFor(state.returnTo)}>
              {copy.signInAgain}
            </a>
          </div>
        </section>
        {feedback}
      </main>
    );

  const failureNotice = (section, fallback) => {
    const words = failureWords(section.failure, copy, { fallback });
    return (
      <div className="space-failure">
        <Notice title={words.title} body={words.body} />
        <div className="space-actions">
          <button type="button" className="btn-link" onClick={actions.reload}>
            {copy.retry}
          </button>
        </div>
      </div>
    );
  };

  const identity = (
    <section
      className="account-panel space-identity"
      aria-label={manage.identityLabel}
      aria-busy={space.status === "loading"}
    >
      <div className="space-identity-main">
        <span className="space-avatar" aria-hidden="true">
          <UserIcon size={22} />
        </span>
        <div className="space-identity-text">
          {space.status === "ready" ? (
            <>
              <h1 id="space-address" className="space-address">
                {space.email}
              </h1>
              <p className="account-muted">{copy.hostedLine}</p>
            </>
          ) : space.status === "failed" ? (
            <h1 id="space-address" className="space-address is-pending">
              {copy.hostedLine}
            </h1>
          ) : (
            <h1 id="space-address" className="space-address is-pending">
              {copy.connecting}
            </h1>
          )}
        </div>
      </div>
      {space.status === "failed" ? (
        failureNotice(space, copy.failed)
      ) : (
        <p className="space-method">
          <MailIcon size={18} />
          <span>{copy.signInMethod}</span>
        </p>
      )}
    </section>
  );

  // One address per tab: a tab is a link, the selected one in the
  // secondary look; the list wraps, never a label.
  const tabList = (
    <div className="manage-tabs" role="tablist" aria-label={manage.tabsLabel}>
      {shownTabs.map((candidate) => (
        <a
          key={candidate}
          role="tab"
          id={`manage-tab-${candidate}`}
          aria-selected={candidate === tab}
          aria-controls="manage-panel"
          className={candidate === tab ? "is-active" : undefined}
          href={managePath(locale, candidate)}
        >
          {tabLabel(candidate)}
        </a>
      ))}
    </div>
  );

  const devicesSection = (
    <section
      className="account-panel space-devices"
      aria-labelledby="space-devices-title"
    >
      <div className="account-panel-heading">
        <h2 id="space-devices-title">{copy.devicesTitle}</h2>
      </div>
      {devices.status === "loading" ? (
        <LoadingState layout="inline">{copy.devicesLoading}</LoadingState>
      ) : devices.status === "failed" ? (
        failureNotice(devices, copy.devicesUnavailable)
      ) : devices.list.length ? (
        <ul className="space-device-list" aria-busy={devices.refreshing}>
          {devices.list.map((device) => (
            <DeviceRow
              key={device.id}
              device={device}
              copy={copy}
              locale={locale}
              timeZone={timeZone}
              now={now}
              onRename={actions.askRename}
              onDetach={actions.askDetach}
            />
          ))}
        </ul>
      ) : (
        <div className="space-empty">
          <p>{copy.devicesEmpty}</p>
          <p className="account-muted">{copy.devicesEmptyHint}</p>
        </div>
      )}
      <p className="account-muted space-note">{copy.devicesNote}</p>
    </section>
  );

  const browserSection = (
    <section
      className="account-panel space-browser"
      aria-labelledby="space-browser-title"
    >
      <div className="account-panel-heading">
        <div>
          <h2 id="space-browser-title">{copy.browserTitle}</h2>
          <p>{copy.browserBody}</p>
        </div>
      </div>
      {browser.error ? (
        <Notice title={browser.error.title} body={browser.error.body} />
      ) : null}
      <div className="space-actions">
        <button
          type="button"
          className="btn-tertiary"
          disabled={browser.busy}
          onClick={actions.signOut}
        >
          {browser.busy ? copy.signingOut : copy.signOut}
        </button>
      </div>
    </section>
  );

  return (
    <main
      className="account-page space-page manage-page"
      data-tab={tab}
      data-devices={devices.status}
    >
      <div className="manage-head">
        {identity}
        {tabList}
      </div>

      {notice ? (
        <Notice tone={notice.tone} title={notice.title} body={notice.body} />
      ) : null}

      <div
        id="manage-panel"
        className="manage-panel"
        role="tabpanel"
        aria-labelledby={`manage-tab-${tab}`}
      >
        {tab === "captures" ? captures : null}
        {tab === "plans" ? plans : null}
        {tab === "sessions" ? sessions : null}
        {tab === "equipment" ? equipment : null}
        {tab === "portal" ? portal : null}
        {tab === "devices" ? devicesSection : null}
        {tab === "exports" ? (
          <>
            {dataExport}
            {dataImport}
          </>
        ) : null}
        {tab === "settings" ? (
          <>
            {calibration}
            {browserSection}
            {feedback}
            {after}
          </>
        ) : null}
        {added.includes(tab) ? extension : null}
      </div>

      {dialog?.kind === "rename" ? (
        <RenameDialog
          copy={copy}
          device={dialog.device}
          busy={dialog.busy}
          failure={dialog.failure}
          onClose={actions.closeDialog}
          onSave={(name) => actions.rename(dialog.device, name)}
        />
      ) : null}

      {dialog?.kind === "detach" ? (
        <WebConfirmDialog
          title={copy.detachTitle}
          eyebrow={dialog.device.name}
          cancelLabel={copy.cancel}
          closeLabel={copy.close}
          confirmLabel={dialog.busy ? copy.detaching : copy.detachConfirm}
          busy={dialog.busy}
          onCancel={actions.closeDialog}
          onConfirm={() => actions.detach(dialog.device)}
          tone="danger"
        >
          <DetachBody copy={copy} failure={dialog.failure} />
        </WebConfirmDialog>
      ) : null}
    </main>
  );
}

const initialState = (returnTo) => ({
  space: { status: "loading" },
  devices: { status: "loading", list: [], refreshing: false },
  ended: null,
  notice: null,
  dialog: null,
  browser: { busy: false, error: null },
  returnTo,
});

/**
 * The page. `fetcher` and `navigate` are the browser's own by default;
 * `offersHref` is where the host application sells (a link of the tabs that
 * meet a limit), `null` where it sells nothing; `portalMode` is the third
 * mode of the tab « Galerie privée » the host adds (PortalTab.js);
 * `extensionData[tab]` is what it hands to the component of a tab it added.
 * `renderAfter(context)` what the host application draws after the browser (see
 * SpaceView). `spaceDeletedPath` is where the page goes when the service answers `space_deleted`;
 * without it, the page says the session ended.
 */
export function SpacePage({
  locale = "en",
  tab = "captures",
  captureId = null,
  // The tabs the host application adds for this request, and the rest of the
  // address of the open one (`/{locale}/manage/<tab>/<item>`).
  extraTabs = [],
  item = null,
  spaceCreation = "open",
  offersHref = null,
  extensionData = {},
  renderAfter = null,
  renderFeedback = null,
  portalMode = null,
  spaceDeletedPath = null,
  fetcher = defaultFetcher,
  navigate = defaultNavigate,
  timeZone,
}) {
  const copy = spaceCopyFor(locale, { spaceCreation });
  // Where a sign-in brings the person back: the tab being read.
  const returnTo =
    tab === "captures" && captureId
      ? managePath(locale, "captures", captureId)
      : item
        ? managePath(locale, tab, item)
        : managePath(locale, tab);
  const [state, setState] = useState(() => initialState(returnTo));
  const patch = useCallback(
    (changes) => setState((current) => ({ ...current, ...changes })),
    [],
  );
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const csrf = () => csrfCookieValue();

  // What every call may end with besides its own answers: the session
  // ended, or the space is gone. Returns true when the page moved on.
  const leaves = useCallback(
    (outcome) => {
      if (outcome.kind === "signed-out") {
        remember(locale);
        patch({ ended: "signed-out", dialog: null });
        return true;
      }
      if (outcome.kind === "space-deleted") {
        remember(locale);
        if (spaceDeletedPath) navigate(spaceDeletedPath);
        else patch({ ended: "signed-out", dialog: null });
        return true;
      }
      return false;
    },
    [locale, navigate, patch, spaceDeletedPath],
  );

  const loadList = useCallback(
    async ({ quiet = false } = {}) => {
      if (!quiet)
        setState((current) => ({
          ...current,
          devices: { status: "loading", list: [], refreshing: false },
        }));
      else
        setState((current) => ({
          ...current,
          devices: { ...current.devices, refreshing: true },
        }));
      const outcome = await loadDevices(fetcher);
      if (!alive.current || leaves(outcome)) return outcome;
      setState((current) => ({
        ...current,
        devices:
          outcome.kind === "ok"
            ? { status: "ready", list: outcome.devices, refreshing: false }
            : {
                status: "failed",
                list: [],
                failure: outcome,
                refreshing: false,
              },
      }));
      return outcome;
    },
    [fetcher, leaves],
  );

  const load = useCallback(async () => {
    setState((current) => ({ ...current, space: { status: "loading" } }));
    const [outcome] = await Promise.all([loadSpace(fetcher), loadList()]);
    if (!alive.current || leaves(outcome)) return;
    setState((current) => ({
      ...current,
      space:
        outcome.kind === "ok"
          ? { status: "ready", email: outcome.space.email }
          : { status: "failed", failure: outcome },
    }));
  }, [fetcher, leaves, loadList]);

  useEffect(() => {
    void load();
    // Once, at the opening of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeDialog = () =>
    setState((current) =>
      current.dialog?.busy ? current : { ...current, dialog: null },
    );
  const failIn = (outcome, words) =>
    setState((current) =>
      current.dialog
        ? {
            ...current,
            dialog: {
              ...current.dialog,
              busy: false,
              failure: failureWords(outcome, copy, words),
            },
          }
        : current,
    );
  const busyDialog = () =>
    setState((current) => ({
      ...current,
      dialog: { ...current.dialog, busy: true, failure: null },
    }));
  // A device that was detached meanwhile: the list is read again, and the
  // page says why the device is gone.
  const alreadyGone = async () => {
    patch({
      dialog: null,
      notice: { tone: "info", title: null, body: copy.alreadyDetached },
    });
    await loadList({ quiet: true });
  };

  const actions = {
    reload: () => void load(),
    askRename: (device) =>
      patch({
        dialog: { kind: "rename", device, busy: false, failure: null },
        notice: null,
      }),
    askDetach: (device) =>
      patch({
        dialog: { kind: "detach", device, busy: false, failure: null },
        notice: null,
      }),
    closeDialog,
    async rename(device, name) {
      busyDialog();
      const outcome = await renameDevice(fetcher, {
        id: device.id,
        name,
        csrf: csrf(),
      });
      if (!alive.current || leaves(outcome)) return;
      if (outcome.kind === "ok") {
        patch({ dialog: null });
        await loadList({ quiet: true });
      } else if (outcome.kind === "not-found") await alreadyGone();
      else if (outcome.kind === "too-long")
        failIn(outcome, { fallback: copy.renameTooLong });
      else failIn(outcome, { fallback: copy.renameFailed });
    },
    async detach(device) {
      busyDialog();
      const outcome = await detachDevice(fetcher, {
        id: device.id,
        csrf: csrf(),
      });
      if (!alive.current || leaves(outcome)) return;
      if (outcome.kind === "ok") {
        patch({ dialog: null, notice: null });
        await loadList({ quiet: true });
      } else if (outcome.kind === "not-found") await alreadyGone();
      else
        failIn(outcome, {
          fallback: copy.detachFailed,
          offline: copy.detachOffline,
        });
    },
    async signOut() {
      patch({ browser: { busy: true, error: null } });
      const outcome = await signOutBrowser(fetcher, { csrf: csrf() });
      if (!alive.current) return;
      if (outcome.kind === "ok") {
        remember(locale);
        navigate(`/${locale}`);
        return;
      }
      if (leaves(outcome)) return;
      patch({
        browser: {
          busy: false,
          error: failureWords(outcome, copy, { fallback: copy.signOutFailed }),
        },
      });
    },
  };

  // What the added zones receive of the page.
  const context = {
    locale,
    deviceCount:
      state.devices.status === "ready" ? state.devices.list.length : 0,
    fetcher,
    navigate,
    csrf,
    leaves: (outcome) => alive.current && leaves(outcome),
    clearNotice: () => patch({ notice: null }),
    remember: () => remember(locale),
  };
  // The project's calibration set: only where spaces are open to any address
  // (a private server keeps none, and its route answers not_available).
  const calibration =
    tab === "settings" && spaceCreation === "open" && !state.ended ? (
      <CalibrationSection
        copy={copy}
        locale={locale}
        fetcher={fetcher}
        csrf={csrf}
        leaves={context.leaves}
        timeZone={timeZone}
      />
    ) : null;
  return (
    <SpaceView
      locale={locale}
      state={state}
      actions={actions}
      tab={tab}
      captures={
        tab === "captures" && !state.ended ? (
          <CapturesTab
            locale={locale}
            captureId={captureId}
            fetcher={fetcher}
            csrf={csrf}
            leaves={context.leaves}
            navigate={navigate}
            timeZone={timeZone}
            // « Voir les offres » only where the host application shows
            // offers (a private server names no offer).
            offersHref={offersHref}
          />
        ) : null
      }
      plans={
        // « Plans », every plan of one night and multi-night, with their
        // trash (SPACE-DATA-MANAGE-01).
        tab === "plans" && !state.ended ? (
          <PlansTab
            locale={locale}
            fetcher={fetcher}
            csrf={csrf}
            leaves={context.leaves}
          />
        ) : null
      }
      sessions={
        // « Sessions », every session of the Journal, with « Supprimées ».
        tab === "sessions" && !state.ended ? (
          <SessionsTab
            locale={locale}
            fetcher={fetcher}
            csrf={csrf}
            leaves={context.leaves}
          />
        ) : null
      }
      equipment={
        // « Matériel », the space's own equipment.
        tab === "equipment" && !state.ended ? (
          <EquipmentTab
            locale={locale}
            fetcher={fetcher}
            csrf={csrf}
            leaves={context.leaves}
          />
        ) : null
      }
      portal={
        // « Galerie privée », its address, its names and who may see it.
        tab === "portal" && !state.ended ? (
          <PortalTab
            locale={locale}
            fetcher={fetcher}
            csrf={csrf}
            leaves={context.leaves}
            offersHref={offersHref}
            portalMode={portalMode}
          />
        ) : null
      }
      calibration={calibration}
      dataExport={
        // « Exporter mes données », the space's own records, on every kind
        // of server.
        tab === "exports" && !state.ended ? (
          <DataExportSection
            locale={locale}
            fetcher={fetcher}
            hosted={spaceCreation === "open"}
          />
        ) : null
      }
      dataImport={
        // « Importer mes données », after the export, on every kind of
        // server: the same section, the same routes, with the space's limits
        // applied.
        tab === "exports" && !state.ended ? (
          <DataImportSection
            locale={locale}
            fetcher={fetcher}
            csrf={csrf}
            hosted={spaceCreation === "open"}
          />
        ) : null
      }
      feedback={
        typeof renderFeedback === "function"
          ? renderFeedback({
              ...context,
              signedIn: !state.ended && state.space.status === "ready",
              signInHref: signInPathFor(returnTo),
              signInLabel: copy.signInAgain,
              spaceEmail: state.space?.email ?? null,
              spacePath: managePath(locale, "settings"),
            })
          : null
      }
      after={
        tab === "settings" && typeof renderAfter === "function"
          ? renderAfter(context)
          : null
      }
      extraTabs={extraTabs}
      extension={
        extraTabs.includes(tab) && !state.ended
          ? (() => {
              const Extension = getManageTab(tab)?.Component;
              return Extension ? (
                <Extension
                  locale={locale}
                  item={item}
                  fetcher={fetcher}
                  csrf={csrf}
                  leaves={context.leaves}
                  navigate={navigate}
                  spaceEmail={state.space?.email ?? null}
                  timeZone={timeZone}
                  data={extensionData?.[tab] ?? null}
                />
              ) : null;
            })()
          : null
      }
      spaceCreation={spaceCreation}
      timeZone={timeZone}
    />
  );
}
