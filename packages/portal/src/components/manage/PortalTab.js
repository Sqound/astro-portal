"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { WebConfirmDialog } from "portal/components/dialog/WebDialog.js";
import { InfoButton } from "portal/components/dialog/InfoButton.js";
import { LoadingState } from "portal/components/LoadingState.js";
import { changePortal, loadPortal, shownAddress } from "./portal-client.js";
import { headerStale } from "../header-refresh.js";
import { portalCopyFor } from "./portal-copy.js";

/**
 * The tab « Galerie privée » of « Mon espace »: the gallery's address with
 * « Copier », « Ouvrir » and « Générer une nouvelle adresse » (with its
 * confirmation); the two optional names and « Enregistrer les noms » (a name
 * holding a refused word: the field in red, the reason under it, « Règles de
 * publication » once that page exists); « Qui peut voir cette galerie ? » —
 * two rows, the second asking first the confirmation that the captures become
 * visible to the team.
 *
 * A composition that opens spaces may add a third mode (`portalMode`, below):
 * its row follows what the service offers (`modes[mode]`): `available` — a
 * row like the others; `locked` (the capability withholds it) — the row
 * dotted, its text grey, not selectable, with the composition's badge; the
 * row and its badge lead to the offers, without a lock sentence nor
 * « Voir les offres » beside them; absent — the two rows of a private
 * server, whose one owner has no one to share a gallery with by name.
 * Whatever the page draws, the service refuses what it withholds.
 *
 * `portalMode` is `{ mode, words(locale) -> { title, help, publicNameHelp },
 * badge(text), zone({ locale, fetcher, csrf, leaves }) }`: the name of that
 * mode, the words of its row, the badge it draws on its locked row (with the
 * offers' word `subscriptionBadge` of the composition's copy), and the zone
 * the composition draws under the rows while the mode is chosen and
 * `available`.
 */

const Icon = ({ children, size = 18, ...props }) => (
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
const CopyIcon = (props) => (
  <Icon {...props}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </Icon>
);
const ExternalIcon = (props) => (
  <Icon {...props}>
    <path d="M14 4.5h5.5V10M19.5 4.5L11 13" />
    <path d="M17 13.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V8.5A1.5 1.5 0 0 1 6 7h4.5" />
  </Icon>
);
const RefreshIcon = (props) => (
  <Icon {...props}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4.5v4h-4" />
  </Icon>
);
const ChevronIcon = (props) => (
  <Icon {...props}>
    <path d="M9.5 6l6 6-6 6" />
  </Icon>
);
const EyeOffIcon = (props) => (
  <Icon {...props}>
    <path d="M3 3l18 18" />
    <path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 8.5 4.6 9 6-.3.8-1.2 2.3-2.7 3.6M6.5 7.6C4.7 8.8 3.4 10.6 3 12c.5 1.4 4 6 9 6 1.4 0 2.6-.3 3.7-.8" />
    <path d="M9.9 10a3 3 0 0 0 4.1 4.2" />
  </Icon>
);
const WarningIcon = (props) => (
  <Icon {...props}>
    <path d="M12 4l9 15.5H3z" />
    <path d="M12 10v4M12 17h.01" />
  </Icon>
);
/** The order of the modes on the page: the core's two, then a composition's. */
export const PORTAL_MODE_ORDER = Object.freeze(["none", "link"]);

/** The rows the tab draws, from the modes the service offers. */
export function shownModes(settings, portalMode = null) {
  const modes = settings?.modes || {};
  const order = portalMode
    ? [...PORTAL_MODE_ORDER, portalMode.mode]
    : PORTAL_MODE_ORDER;
  return order
    .filter((mode) => modes[mode])
    .map((mode) => ({
      mode,
      locked: modes[mode] === "locked",
      selected: settings.mode === mode,
    }));
}

function NameField({
  id,
  label,
  optional,
  help,
  value,
  max,
  error,
  rulesHref,
  rulesLabel,
  disabled,
  onChange,
}) {
  const helpId = `${id}-help`;
  return (
    <div className={`portal-name-field${error ? " is-refused" : ""}`}>
      <label htmlFor={id} className="portal-field-label">
        {label} <span className="portal-field-optional">{optional}</span>
      </label>
      <input
        id={id}
        type="text"
        className="portal-name-input"
        value={value}
        maxLength={max}
        autoComplete="off"
        disabled={disabled}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={helpId}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <>
          <p id={helpId} className="portal-name-error" role="alert">
            {error}
          </p>
          {rulesHref ? (
            <a className="btn-link portal-rules-link" href={rulesHref}>
              {rulesLabel}
              <ChevronIcon size={16} />
            </a>
          ) : null}
        </>
      ) : (
        <p id={helpId} className="account-muted portal-field-help">
          {help}
        </p>
      )}
    </div>
  );
}

function ModeRow({
  row,
  copy,
  words,
  badge = null,
  name,
  offersHref,
  busy,
  onChoose,
}) {
  const content = (
    <span className="portal-mode-text">
      <span className="portal-mode-title">
        {words?.title ?? copy.modes[row.mode]}
      </span>
      <span className="portal-mode-help">
        {words?.help ?? copy.modeHelp[row.mode]}
      </span>
      {row.locked ? badge : null}
    </span>
  );
  if (row.locked)
    // The greyed row and its badge are one way to the offers page; never a
    // choice.
    return (
      <a
        className={`portal-mode is-locked${row.selected ? " is-selected" : ""}`}
        href={offersHref ?? undefined}
        data-mode={row.mode}
      >
        <span className="portal-mode-radio" aria-hidden="true" />
        {content}
      </a>
    );
  return (
    <label
      className={`portal-mode${row.selected ? " is-selected" : ""}`}
      data-mode={row.mode}
    >
      <input
        type="radio"
        className="portal-mode-input"
        name={name}
        value={row.mode}
        checked={row.selected}
        disabled={busy}
        onChange={() => onChoose(row.mode)}
      />
      <span className="portal-mode-radio" aria-hidden="true" />
      {content}
    </label>
  );
}

/**
 * Whether the zone of the composition's mode is drawn: that mode chosen and
 * available — never on its locked row, never on a private server.
 */
export const portalZoneShown = (settings, portalMode = null) =>
  Boolean(portalMode) &&
  settings?.mode === portalMode.mode &&
  settings?.modes?.[portalMode.mode] === "available";

/** The body of the confirmation before « Accessible à tous ». */
export function LinkDialogBody({ copy, locale = "en" }) {
  return (
    <div className="capture-dialog-body">
      <p>{copy.linkBody}</p>
      {copy.linkNotice ? (
        <div className="capture-notice" role="status">
          <WarningIcon className="capture-notice-icon" />
          <div className="capture-notice-text">
            <p className="capture-notice-title">{copy.linkNotice}</p>
            {/* Who looks, why, and where the rules are written. */}
            {copy.publishingRulesPath ? (
              <p>
                <a
                  className="btn-link portal-rules-link"
                  href={`/${locale}${copy.publishingRulesPath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {copy.publishingRules}
                  <ChevronIcon size={16} />
                </a>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The body of the confirmation of a new address. */
export function RegenerateDialogBody({ copy }) {
  return (
    <div className="capture-dialog-body">
      <p>{copy.regenerateBody}</p>
    </div>
  );
}

/**
 * The tab as a function of its state (`PortalTab` keeps it): `status` (loading
 * · ready · failed), `settings` (the service's answer), `drafts` (the two names
 * being typed), `nameError` (`{ field, word }` of a name refused), `dialog`
 * (`link` · `regenerate`), `busy`, `failure`. Exported for the tests, which
 * draw every state from fixtures.
 */
export function PortalView({
  locale = "en",
  state,
  actions,
  zone = null,
  portalMode = null,
  offersHref = null,
}) {
  const copy = portalCopyFor(locale);
  const ids = useId().replace(/[^\w-]/g, "");
  const rulesHref = copy.publishingRulesPath
    ? `/${locale}${copy.publishingRulesPath}`
    : null;
  const { settings, drafts, nameError, busy } = state;
  const failure = state.failure ? (
    <div className="capture-notice is-bad" role="alert">
      <WarningIcon className="capture-notice-icon" />
      <div className="capture-notice-text">
        <p className="capture-notice-title">{state.failure}</p>
      </div>
    </div>
  ) : null;
  const heading = (
    <div className="captures-head">
      <div className="captures-heading">
        <div className="captures-title-row">
          <h2>{copy.title}</h2>
          <InfoButton
            locale={locale}
            label={copy.infoLabel}
            title={copy.title}
            body={copy.help}
          >
            <p className="info-dialog-text">{copy.noIndex}</p>
          </InfoButton>
        </div>
        <p className="account-muted captures-help">{copy.help}</p>
      </div>
    </div>
  );
  if (state.status !== "ready")
    return (
      <section
        className="account-panel manage-portal"
        aria-label={copy.title}
        aria-busy={state.status === "loading"}
      >
        {heading}
        {state.status === "loading" ? (
          <LoadingState>{copy.loading}</LoadingState>
        ) : (
          <div className="captures-failure">
            <p className="account-muted">{copy.loadFailed}</p>
            <div className="capture-actions">
              <button
                type="button"
                className="btn-link"
                onClick={actions.reload}
              >
                {copy.retry}
              </button>
            </div>
          </div>
        )}
      </section>
    );

  const errorFor = (field) =>
    nameError?.field === field && copy.nameForbidden
      ? copy.nameForbidden(nameError.word)
      : null;
  return (
    <section
      className="account-panel manage-portal"
      aria-label={copy.title}
      data-mode={settings.mode}
    >
      {heading}
      {failure}
      <div className="portal-address">
        <label htmlFor={`${ids}-address`} className="portal-address-label">
          {copy.addressLabel}
        </label>
        <input
          id={`${ids}-address`}
          className="portal-address-field"
          type="text"
          readOnly
          value={shownAddress(settings.address)}
          onFocus={(event) => event.target.select()}
        />
        <div className="portal-address-actions">
          <button
            type="button"
            className="btn-tertiary portal-copy"
            onClick={actions.copyAddress}
          >
            <CopyIcon />
            {copy.copyAddress}
          </button>
          <a
            className="btn-link portal-open"
            href={settings.address}
            target="_blank"
            rel="noopener noreferrer"
          >
            {copy.openAddress}
            <ExternalIcon size={16} />
          </a>
        </div>
        <button
          type="button"
          className="btn-link portal-regenerate"
          disabled={busy}
          onClick={actions.askRegenerate}
        >
          <RefreshIcon />
          {copy.regenerate}
        </button>
      </div>

      <form
        className="portal-names"
        onSubmit={(event) => {
          event.preventDefault();
          actions.saveNames();
        }}
      >
        <NameField
          id={`${ids}-public-name`}
          label={copy.publicNameLabel}
          optional={copy.optional}
          help={
            portalMode?.words(locale)?.publicNameHelp ?? copy.publicNameHelp
          }
          value={drafts.publicName}
          max={60}
          error={errorFor("publicName")}
          rulesHref={rulesHref}
          rulesLabel={copy.publishingRules}
          disabled={busy}
          onChange={(value) => actions.editName("publicName", value)}
        />
        <NameField
          id={`${ids}-portal-name`}
          label={copy.portalNameLabel}
          optional={copy.optional}
          help={copy.portalNameHelp}
          value={drafts.portalName}
          max={80}
          error={errorFor("portalName")}
          rulesHref={rulesHref}
          rulesLabel={copy.publishingRules}
          disabled={busy}
          onChange={(value) => actions.editName("portalName", value)}
        />
        <div className="portal-names-actions">
          <button type="submit" className="btn-secondary" disabled={busy}>
            {copy.saveNames}
          </button>
        </div>
      </form>

      <fieldset className="portal-modes" disabled={busy}>
        <legend className="portal-modes-title">{copy.whoTitle}</legend>
        {shownModes(settings, portalMode).map((row) => (
          <ModeRow
            key={row.mode}
            row={row}
            copy={copy}
            words={
              portalMode && row.mode === portalMode.mode
                ? portalMode.words(locale)
                : null
            }
            badge={
              portalMode &&
              row.mode === portalMode.mode &&
              copy.subscriptionBadge
                ? portalMode.badge?.(copy.subscriptionBadge)
                : null
            }
            name={`${ids}-mode`}
            offersHref={offersHref}
            busy={busy}
            onChoose={actions.chooseMode}
          />
        ))}
      </fieldset>
      <p className="account-muted portal-noindex">
        <EyeOffIcon />
        <span>{copy.noIndex}</span>
      </p>
      {portalZoneShown(settings, portalMode) ? zone : null}

      {state.dialog === "link" ? (
        <WebConfirmDialog
          title={copy.linkTitle}
          cancelLabel={copy.cancel}
          closeLabel={copy.close}
          confirmLabel={copy.linkConfirm}
          busy={busy}
          onCancel={actions.closeDialog}
          onConfirm={actions.confirmLink}
          tone="plain"
          className="portal-link-dialog"
        >
          <LinkDialogBody copy={copy} locale={locale} />
        </WebConfirmDialog>
      ) : null}
      {state.dialog === "regenerate" ? (
        <WebConfirmDialog
          title={copy.regenerateTitle}
          cancelLabel={copy.cancel}
          closeLabel={copy.close}
          confirmLabel={copy.regenerateConfirm}
          busy={busy}
          onCancel={actions.closeDialog}
          onConfirm={actions.regenerate}
          tone="plain"
          className="portal-regenerate-dialog"
        >
          <RegenerateDialogBody copy={copy} />
        </WebConfirmDialog>
      ) : null}
    </section>
  );
}

const draftsOf = (settings) => ({
  publicName: settings?.publicName ?? "",
  portalName: settings?.portalName ?? "",
});

/**
 * The tab. `fetcher` is the page's `fetch`; `csrf` gives the session's
 * token; `leaves(outcome)` is the page's way out when the session ended.
 */
export function PortalTab({
  locale = "en",
  fetcher = (...args) => fetch(...args),
  csrf = () => "",
  leaves = () => false,
  clipboard = null,
  offersHref = null,
  portalMode = null,
}) {
  const copy = portalCopyFor(locale);
  const [state, setState] = useState({
    status: "loading",
    settings: null,
    drafts: draftsOf(null),
    nameError: null,
    dialog: null,
    busy: false,
    failure: null,
  });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const patch = useCallback(
    (changes) => setState((current) => ({ ...current, ...changes })),
    [],
  );

  const load = useCallback(async () => {
    patch({ status: "loading", failure: null });
    const outcome = await loadPortal(fetcher);
    if (!alive.current || leaves(outcome)) return;
    if (outcome.kind === "ok")
      patch({
        status: "ready",
        settings: outcome.settings,
        drafts: draftsOf(outcome.settings),
        nameError: null,
      });
    else patch({ status: "failed" });
  }, [fetcher, leaves, patch]);

  useEffect(() => {
    void load();
    // Once, at the opening of the tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** One change; `keepDrafts` keeps the names being typed. */
  async function send(change, { names = false } = {}) {
    patch({ busy: true, failure: null });
    const outcome = await changePortal(fetcher, { change, csrf: csrf() });
    if (!alive.current || leaves(outcome)) return;
    if (outcome.kind === "ok") {
      // The header's « Galerie privée » follows a new address or mode at
      // once.
      headerStale();
      setState((current) => ({
        ...current,
        busy: false,
        dialog: null,
        settings: outcome.settings,
        drafts: names ? draftsOf(outcome.settings) : current.drafts,
        nameError: names ? null : current.nameError,
      }));
      return;
    }
    if (outcome.kind === "refused" && outcome.code === "name_forbidden") {
      patch({
        busy: false,
        nameError: { field: outcome.field, word: outcome.word },
      });
      return;
    }
    patch({ busy: false, dialog: null, failure: copy.changeFailed });
  }

  const actions = {
    reload: () => void load(),
    copyAddress: () => {
      const target =
        clipboard ||
        (typeof navigator !== "undefined" ? navigator.clipboard : null);
      if (target?.writeText && state.settings?.address)
        void target.writeText(state.settings.address).catch(() => {});
    },
    askRegenerate: () => patch({ dialog: "regenerate", failure: null }),
    closeDialog: () =>
      setState((current) =>
        current.busy ? current : { ...current, dialog: null },
      ),
    regenerate: () => void send({ regenerateToken: true }),
    editName: (field, value) =>
      setState((current) => ({
        ...current,
        drafts: { ...current.drafts, [field]: value },
        nameError:
          current.nameError?.field === field ? null : current.nameError,
      })),
    saveNames: () =>
      void send(
        {
          publicName: state.drafts.publicName,
          portalName: state.drafts.portalName,
        },
        { names: true },
      ),
    chooseMode: (mode) => {
      if (mode === state.settings?.mode) return;
      // « Accessible à tous par son adresse »: the confirmation first,
      // before anything changes.
      if (mode === "link") patch({ dialog: "link", failure: null });
      else void send({ mode });
    },
    confirmLink: () => void send({ mode: "link", confirmVerifiers: true }),
  };

  return (
    <PortalView
      locale={locale}
      state={state}
      actions={actions}
      offersHref={offersHref}
      portalMode={portalMode}
      zone={
        portalMode ? portalMode.zone({ locale, fetcher, csrf, leaves }) : null
      }
    />
  );
}
