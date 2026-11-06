"use client";

import { useRef, useState } from "react";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { BrandLoader } from "portal/components/BrandLoader.js";
import { csrfCookieValue } from "portal/csrf-cookie.js";
import { DATA_EXPORT_PARTS } from "portal/data-export/rules.js";
import { formatBytes } from "portal/components/account/DataExportSection.js";
import { message } from "portal/i18n.js";
import { clientInstanceHeaders } from "portal/planner/change-subscription.js";

/**
 * « Importer mes données » on the « Compte » page of a private portal (a
 * screen drawn after
 * `ExportAllData` — title, one line, ⓘ, rows, one primary — with the
 * states of the session-package import dialog: choose, read, report,
 * confirm, done). The file is sent as it is to
 * `POST /api/v1/data-import/preview` (the dry run: nothing written), then,
 * on « Importer », to `POST /api/v1/data-import/confirm`. It is drawn on a private
 * portal and where spaces are open to any address alike, so that an export of a
 * portal can be imported into a space: `SpacePage` draws it on
 * both, `hosted` choosing the words that speak of the space rather than of
 * a portal, and the report says what the space's limits will archive.
 * The report counts kind by kind what will really enter (plans,
 * nights, multi-night plans, …) and opens with the line that names the
 * kinds of record another space of the portal holds the identifier of --
 * they enter under new identifiers, links kept; the sheet of the import
 * says what arrived, kind by kind.
 */

const defaultFetcher = (...args) => fetch(...args);

const fill = (template, values) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );

/** The singular form for 1 (and for 0 in French), as the export section. */
const one = (locale, count) => (locale === "fr" ? count < 2 : count === 1);

function counted(locale, stem, count, extra = {}) {
  return fill(
    message(locale, `${stem}${one(locale, count) ? "One" : "Many"}`),
    { count: new Intl.NumberFormat(locale).format(count), ...extra },
  );
}

const PART_NAMES = {
  plans: "dataExportPartPlans",
  places: "dataExportPartPlaces",
  equipment: "dataExportPartEquipment",
  framings: "dataExportPartFramings",
  journal: "dataExportPartJournal",
  "sky-measurements": "dataExportPartSky",
};

/** The sentence of a refusal, by the code the service answers; `hosted`
 * picks the words of a space rather than of a portal. */
export function dataImportErrorText(locale, error, hosted = false) {
  const t = (key) => message(locale, key);
  if (error?.code === "not_an_export") return t("dataImportErrorNotExport");
  if (error?.code === "unsupported_format_version")
    return fill(
      t(hosted ? "dataImportErrorNewerHosted" : "dataImportErrorNewer"),
      {
        version: error.formatVersion ?? "?",
      },
    );
  if (error?.code === "payload_too_large" || error?.status === 413)
    return hosted && error.limitBytes
      ? fill(t("dataImportErrorTooLargeHosted"), {
          size: formatBytes(error.limitBytes, locale),
        })
      : t("dataImportErrorTooLarge");
  if (error?.code === "entitlement_read_only")
    return t("dataImportErrorReadOnly");
  return t("dataImportErrorFailed");
}

/** The words of the kinds a record can be re-identified in. */
const REIDENTIFIED_NAMES = {
  plans: "dataExportPartPlans",
  projects: "dataImportKindProjects",
  framings: "dataExportPartFramings",
  equipment: "dataExportPartEquipment",
  sessions: "dataExportPartJournal",
};

/**
 * The line that opens the report (and follows the counts of the sheet): how
 * many records come from another space of the portal and of which kinds,
 * « Plans (2) and Journal (1) ». `done` puts it in the past.
 */
export function reidentifiedLine(locale, notes, done = false) {
  const count = Number(notes?.reidentified) || 0;
  if (count <= 0) return null;
  const kinds = Object.entries(notes.reidentifiedKinds || {})
    .filter(([, value]) => value > 0)
    .map(
      ([kind, value]) =>
        `${message(locale, REIDENTIFIED_NAMES[kind] || "dataExportPartPlans")} (${new Intl.NumberFormat(locale).format(value)})`,
    );
  return counted(
    locale,
    done ? "dataImportReidentifiedDone" : "dataImportReidentified",
    count,
    {
      kinds: new Intl.ListFormat(locale, {
        style: "long",
        type: "conjunction",
      }).format(kinds),
    },
  );
}

/**
 * The rows of the report, kind by kind: the plans' box shows its plans and
 * its multi-night plans each with their own words; the other boxes are one
 * row each. The planner's nights are the dates the plans hang from, not
 * something a person keeps or counts: they have no row, and the totals the
 * screen writes leave them out ([visibleTotals]).
 */
export function reportRows(report) {
  const { parts, kinds } = report;
  const held = (row) => row && row.toImport + row.alreadyThere > 0;
  const plans = kinds
    ? { present: parts.plans.present, ...kinds.plans }
    : parts.plans;
  return [
    { key: "plans", name: PART_NAMES.plans, row: plans },
    ...(held(kinds?.projects)
      ? [
          {
            key: "projects",
            name: "dataImportKindProjects",
            row: { present: true, ...kinds.projects },
          },
        ]
      : []),
    ...DATA_EXPORT_PARTS.filter((part) => part !== "plans").map((part) => ({
      key: part,
      name: PART_NAMES[part],
      row: parts[part],
    })),
  ];
}

/**
 * The totals of an answer as a person counts them: the planner's nights
 * (internal dates, never listed) are in neither figure.
 */
export function visibleTotals(answer) {
  const nights = answer?.kinds?.nights;
  return {
    toImport: Math.max(
      0,
      (answer?.totals?.toImport ?? 0) - (nights?.toImport ?? 0),
    ),
    alreadyThere: Math.max(
      0,
      (answer?.totals?.alreadyThere ?? 0) - (nights?.alreadyThere ?? 0),
    ),
  };
}

/** The plans an import left archived, whatever the reason. */
export function archivedByImport(notes) {
  return (
    (notes?.archivedForNight ?? 0) +
    (notes?.archivedForPlanLimit ?? 0) +
    (notes?.archivedForCapability ?? 0)
  );
}

/** Where the archived plans are listed: the Plan's list with « Archived » ticked. */
export const archivedPlansHref = (locale) =>
  `/${locale}/planner?view=plans&status=archived`;

/** What the import wrote, kind by kind (only the kinds that got something). */
export function arrivedRows(result) {
  const parts = result?.written?.parts || {};
  const kinds = result?.written?.kinds;
  const counts = {
    plans: kinds ? kinds.plans : parts.plans,
    projects: kinds?.projects,
    places: parts.places,
    equipment: parts.equipment,
    framings: parts.framings,
    journal: parts.journal,
    "sky-measurements": parts["sky-measurements"],
  };
  const names = {
    ...PART_NAMES,
    projects: "dataImportKindProjects",
  };
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => ({ key, name: names[key], count }));
}

/** The lines of « Points à noter », in their fixed order. */
function noteLines(locale, notes) {
  if (!notes) return [];
  return [
    notes.missingReference > 0 &&
      counted(locale, "dataImportMissingReference", notes.missingReference),
    notes.unreadable > 0 &&
      counted(locale, "dataImportUnreadable", notes.unreadable),
    notes.archivedForNight > 0 &&
      counted(locale, "dataImportArchivedNight", notes.archivedForNight),
    notes.archivedForPlanLimit > 0 &&
      counted(locale, "dataImportArchivedLimit", notes.archivedForPlanLimit),
    notes.archivedForCapability > 0 &&
      counted(
        locale,
        "dataImportArchivedCapability",
        notes.archivedForCapability,
      ),
    notes.unknownFiles?.length > 0 &&
      counted(locale, "dataImportUnknownFiles", notes.unknownFiles.length),
  ].filter(Boolean);
}

function InfoIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="data-export-ready-check"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function Reidentified({ locale, notes, done = false }) {
  const line = reidentifiedLine(locale, notes, done);
  if (!line) return null;
  return (
    <p className="data-import-reidentified" role="note">
      {line}
    </p>
  );
}

function Notes({ locale, notes }) {
  const lines = noteLines(locale, notes);
  if (!lines.length) return null;
  return (
    <div className="data-import-notes">
      <h3>{message(locale, "dataImportNotesTitle")}</h3>
      <ul>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The section as a function of its state: `step` is `idle`, `reading`,
 * `report` (with `report`, the dry run's answer), `done` (with `result`,
 * the import's answer) or `error` (with `error`, `{ code, formatVersion,
 * status }`); `busy` while the import runs.
 */
export function DataImportView({
  locale = "en",
  hosted = false,
  step = "idle",
  report = null,
  result = null,
  error = null,
  busy = false,
  infoOpen = false,
  onChoose,
  onConfirm,
  onCancel,
  onClose,
  onInfo,
  onCloseInfo,
  fileInput = null,
}) {
  const t = (key) => message(locale, key);
  // The words of a space (`hosted`) or of a portal (private server).
  const tw = (key) => t(hosted ? `${key}Hosted` : key);
  const number = (value) => new Intl.NumberFormat(locale).format(value);
  const skipped = report
    ? report.notes.missingReference + report.notes.unreadable
    : 0;
  const reportTotals = report ? visibleTotals(report) : null;
  const doneTotals = result ? visibleTotals(result) : null;
  return (
    <section
      className="account-panel data-import"
      aria-labelledby="data-import-title"
      aria-busy={step === "reading" || busy}
      data-state={step}
    >
      <div className="account-panel-heading">
        <h2 id="data-import-title">{t("dataImportTitle")}</h2>
      </div>
      <div className="data-export-line">
        <p className="account-muted">{t("dataImportHelp")}</p>
        <button
          type="button"
          className="data-export-info"
          aria-label={t("dataImportInfoLabel")}
          title={t("dataImportInfoLabel")}
          onClick={onInfo}
        >
          <InfoIcon />
        </button>
      </div>
      {fileInput}
      {step === "idle" ? (
        <div className="space-actions">
          <button type="button" className="btn-secondary" onClick={onChoose}>
            {t("dataImportChoose")}
          </button>
        </div>
      ) : null}
      {step === "reading" ? (
        <p className="data-import-reading" role="status">
          <BrandLoader className="data-import-star" />
          {t("dataImportReading")}
        </p>
      ) : null}
      {step === "report" && report ? (
        <>
          <Reidentified locale={locale} notes={report.notes} />
          <h3>{t("dataImportReportTitle")}</h3>
          <ul className="data-import-rows">
            {reportRows(report).map(({ key, name, row }) => {
              return (
                <li
                  key={key}
                  className={`data-import-row${row.present ? "" : " is-absent"}`}
                >
                  <span className="data-export-box-name">{t(name)}</span>
                  <span className="data-import-row-count">
                    {row.present
                      ? fill(
                          t(
                            one(locale, row.alreadyThere)
                              ? "dataImportRowOne"
                              : "dataImportRowMany",
                          ),
                          {
                            toImport: number(row.toImport),
                            already: number(row.alreadyThere),
                          },
                        )
                      : t("dataImportAbsent")}
                  </span>
                </li>
              );
            })}
          </ul>
          <Notes locale={locale} notes={report.notes} />
          <p className="account-muted data-import-captures">
            {t("dataImportCapturesNote")}
          </p>
          {reportTotals.toImport === 0 && skipped === 0 ? (
            <p className="account-muted data-import-nothing">
              {tw("dataImportNothingNew")}
            </p>
          ) : null}
          <div className="space-actions">
            <button
              type="button"
              className="btn-tertiary"
              disabled={busy}
              onClick={onCancel}
            >
              {t("dataImportCancel")}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || reportTotals.toImport === 0}
              onClick={onConfirm}
            >
              {t("dataImportConfirm")}
            </button>
          </div>
        </>
      ) : null}
      {step === "done" && result ? (
        <div className="data-export-ready data-import-done" role="status">
          <div className="data-export-ready-head">
            <CheckIcon />
            <div>
              <p className="data-export-ready-title">
                {t("dataImportDoneTitle")}
              </p>
              <p className="account-muted">
                {fill(t("dataImportDoneLine"), {
                  added: counted(
                    locale,
                    "dataImportAdded",
                    result.written.total - (result.written.kinds?.nights ?? 0),
                  ),
                  kept: counted(
                    locale,
                    "dataImportKept",
                    doneTotals.alreadyThere,
                  ),
                })}
              </p>
            </div>
          </div>
          {arrivedRows(result).length ? (
            <>
              <h3>{t("dataImportArrivedTitle")}</h3>
              <ul className="data-import-rows data-import-arrived">
                {arrivedRows(result).map(({ key, name, count }) => (
                  <li key={key} className="data-import-row">
                    <span className="data-export-box-name">{t(name)}</span>
                    <span className="data-import-row-count">
                      {number(count)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <Reidentified locale={locale} notes={result.notes} done />
          <Notes locale={locale} notes={result.notes} />
          {archivedByImport(result.notes) > 0 ? (
            <p className="data-import-archived-link">
              <a className="btn-link" href={archivedPlansHref(locale)}>
                {t("dataImportSeeArchived")}
              </a>
            </p>
          ) : null}
          <div className="space-actions">
            <button type="button" className="btn-tertiary" onClick={onClose}>
              {t("dataImportClose")}
            </button>
          </div>
        </div>
      ) : null}
      {step === "error" ? (
        <>
          <p className="data-export-failed" role="alert">
            {dataImportErrorText(locale, error, hosted)}
          </p>
          <div className="space-actions">
            <button type="button" className="btn-secondary" onClick={onChoose}>
              {t("dataImportChooseAnother")}
            </button>
          </div>
        </>
      ) : null}
      {infoOpen ? (
        <WebDialog
          title={t("dataImportInfoLabel")}
          closeLabel={t("dataImportClose")}
          closeOnBackdrop
          onClose={onCloseInfo}
        >
          <p>{tw("dataImportInfoBody")}</p>
        </WebDialog>
      ) : null}
    </section>
  );
}

/** The error of an answer that is not a success: its code, and the version
 * a newer file follows. */
async function refusal(response) {
  const body = await response.json().catch(() => null);
  return {
    status: response.status,
    code: body?.error?.code || null,
    formatVersion: body?.formatVersion ?? null,
    limitBytes: body?.limitBytes ?? null,
  };
}

/**
 * The section of the « Compte » page of a private portal: it reads the
 * chosen file, sends it to the dry run, shows what would enter, and
 * imports it on « Importer ». `fetcher` and `csrf` are the browser's own by
 * default; a test passes its own.
 */
export function DataImportSection({
  locale = "en",
  hosted = false,
  fetcher = defaultFetcher,
  csrf = csrfCookieValue,
  initial = null,
}) {
  const inputRef = useRef(null);
  const [state, setState] = useState(() => initial || { step: "idle" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const post = (path, body) =>
    fetcher(path, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "content-type": "application/zip",
        "x-astro-csrf": csrf() || "",
        ...clientInstanceHeaders(),
      },
      body,
    });

  async function onFile(event) {
    const chosen = event.target.files?.[0] || null;
    event.target.value = ""; // the same file may be chosen again
    if (!chosen) return;
    setFile(chosen);
    setState({ step: "reading" });
    try {
      const response = await post("/api/v1/data-import/preview", chosen);
      if (!response.ok)
        return setState({ step: "error", error: await refusal(response) });
      setState({ step: "report", report: await response.json() });
    } catch {
      setState({ step: "error", error: null });
    }
  }

  async function onConfirm() {
    if (!file) return;
    setBusy(true);
    try {
      const response = await post("/api/v1/data-import/confirm", file);
      if (!response.ok)
        setState({ step: "error", error: await refusal(response) });
      else setState({ step: "done", result: await response.json() });
    } catch {
      setState({ step: "error", error: null });
    } finally {
      setBusy(false);
    }
  }

  const reset = () => {
    setFile(null);
    setState({ step: "idle" });
  };

  return (
    <DataImportView
      locale={locale}
      hosted={hosted}
      step={state.step}
      report={state.report || null}
      result={state.result || null}
      error={state.error || null}
      busy={busy}
      infoOpen={infoOpen}
      onChoose={() => inputRef.current?.click()}
      onConfirm={onConfirm}
      onCancel={reset}
      onClose={reset}
      onInfo={() => setInfoOpen(true)}
      onCloseInfo={() => setInfoOpen(false)}
      fileInput={
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={onFile}
        />
      }
    />
  );
}
