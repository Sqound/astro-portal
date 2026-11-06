"use client";

import { useCallback, useEffect, useState } from "react";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { LoadingState } from "portal/components/LoadingState.js";
import { DATA_EXPORT_PARTS } from "portal/data-export/rules.js";
import { message } from "portal/i18n.js";

/**
 * « Exporter mes données » on the web (a section of the account page — kind `web`): the
 * counts come from `GET /api/v1/data-export/summary`, the file from
 * `GET /api/v1/data-export?parts=…&date=…` with the browser's local date.
 * Six boxes and three states;
 * « Enregistrer le fichier » downloads it and « Partager le fichier » shows
 * only where the browser can share a file (`navigator.canShare`).
 * The file is the space's: what the service holds for the credential.
 */

const defaultFetcher = (...args) => fetch(...args);

/** The browser's local day, `AAAA-MM-JJ`. */
export function localDate(now = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const fill = (template, values) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );

/** The singular form for 1 (and for 0 in French, as the French copy writes it). */
const one = (locale, count) => (locale === "fr" ? count < 2 : count === 1);

function counted(locale, stem, count) {
  return fill(
    message(locale, `${stem}${one(locale, count) ? "One" : "Many"}`),
    {
      count: new Intl.NumberFormat(locale).format(count),
    },
  );
}

/**
 * « 2,4 Mo », « 512 o », « 5,5 Ko » — one decimal at most, none when it
 * would be zero.
 */
export function formatBytes(bytes, locale) {
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024)
    return fill(message(locale, "dataExportUnitByte"), {
      value: number.format(value),
    });
  let amount = value / 1024;
  for (const unit of "Kilo Mega Giga".split(" ")) {
    const rounded = Math.round(amount * 10) / 10;
    if (rounded < 1024 || unit === "Giga")
      return fill(message(locale, `dataExportUnit${unit}`), {
        value: number.format(rounded),
      });
    amount /= 1024;
  }
  return "";
}

const PART_NAMES = {
  plans: "dataExportPartPlans",
  places: "dataExportPartPlaces",
  equipment: "dataExportPartEquipment",
  framings: "dataExportPartFramings",
  journal: "dataExportPartJournal",
  "sky-measurements": "dataExportPartSky",
};

function partLines(locale, part, counts) {
  const number = (value) => new Intl.NumberFormat(locale).format(value);
  const count = counts?.count ?? 0;
  switch (part) {
    case "plans":
      return {
        detail:
          counts?.multiNight > 0
            ? counted(locale, "dataExportMultiNight", counts.multiNight)
            : null,
        count: number(count),
      };
    case "places":
      return {
        detail: fill(message(locale, "dataExportPlacesDetail"), {
          places: counted(locale, "dataExportPlaces", count),
          horizons: counted(
            locale,
            "dataExportHorizons",
            counts?.horizons ?? 0,
          ),
        }),
        count: `${number(count)} · ${number(counts?.horizons ?? 0)}`,
      };
    case "journal":
      return {
        detail: null,
        count: counted(locale, "dataExportNights", count),
      };
    case "sky-measurements":
      return {
        detail: null,
        count: counted(locale, "dataExportMeasures", count),
      };
    default:
      return { detail: null, count: number(count) };
  }
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

function DownloadIcon() {
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
      <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
    </svg>
  );
}

function ShareIcon() {
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
      <path d="M12 16V4M7 9l5-5 5 5M5 14v6h14v-6" />
    </svg>
  );
}

/**
 * The section as a function of its state: `summary` (`loading`, `ready`
 * with `data`, `failed`), the `ticked` boxes, `file` once made
 * (`{ filename, size }`), `busy`, `failed` (the export did not arrive),
 * `canShare`, and `date` (the browser's local day).
 */
export function DataExportView({
  locale = "en",
  hosted = false,
  summary,
  ticked,
  date,
  file = null,
  busy = false,
  failed = false,
  canShare = false,
  infoOpen = false,
  onToggle,
  onTickAll,
  onExport,
  onSave,
  onShare,
  onInfo,
  onCloseInfo,
}) {
  const t = (key) => message(locale, key);
  const parts = summary.status === "ready" ? summary.data.parts : null;
  const allTicked = ticked.length === DATA_EXPORT_PARTS.length;
  const estimate =
    summary.status === "ready"
      ? summary.data.overheadBytes +
        ticked.reduce(
          (total, part) => total + (parts[part]?.estimatedBytes ?? 0),
          0,
        )
      : 0;
  const filename = `planastro-export-${date}.zip`;
  return (
    <section
      className="account-panel data-export"
      aria-labelledby="data-export-title"
      aria-busy={summary.status === "loading" || busy}
      data-state={
        file
          ? "ready"
          : ticked.length === 0
            ? "none"
            : allTicked
              ? "all"
              : "part"
      }
    >
      <div className="account-panel-heading">
        <h2 id="data-export-title">{t("dataExportTitle")}</h2>
      </div>
      <div className="data-export-line">
        <p className="account-muted">{t("dataExportHelp")}</p>
        <button
          type="button"
          className="data-export-info"
          aria-label={t("dataExportInfoLabel")}
          title={t("dataExportInfoLabel")}
          onClick={onInfo}
        >
          <InfoIcon />
        </button>
      </div>
      {summary.status === "failed" ? (
        <p className="data-export-failed" role="status">
          {t("dataExportUnavailable")}
        </p>
      ) : summary.status === "loading" ? (
        <LoadingState layout="inline">{t("dataExportLoading")}</LoadingState>
      ) : (
        <>
          <div className="data-export-count-line">
            <span className="account-muted">
              {fill(
                message(
                  locale,
                  one(locale, ticked.length)
                    ? "dataExportSelectedOne"
                    : "dataExportSelectedMany",
                ),
                { count: ticked.length, total: DATA_EXPORT_PARTS.length },
              )}
            </span>
            <button
              type="button"
              className="btn-link"
              disabled={busy}
              onClick={() => onTickAll(!allTicked)}
            >
              {allTicked ? t("dataExportUntickAll") : t("dataExportTickAll")}
            </button>
          </div>
          <ul className="data-export-boxes">
            {DATA_EXPORT_PARTS.map((part) => {
              const lines = partLines(locale, part, parts[part]);
              const checked = ticked.includes(part);
              return (
                <li key={part}>
                  <label
                    className={`data-export-box${checked ? " is-ticked" : ""}`}
                  >
                    <input
                      type="checkbox"
                      name={part}
                      checked={checked}
                      disabled={busy}
                      onChange={() => onToggle(part)}
                    />
                    <span className="data-export-box-text">
                      <span className="data-export-box-name">
                        {t(PART_NAMES[part])}
                      </span>
                      {lines.detail ? (
                        <span className="data-export-box-detail">
                          {lines.detail}
                        </span>
                      ) : null}
                    </span>
                    <span className="data-export-box-count">{lines.count}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          {file ? (
            <div className="data-export-ready">
              <div className="data-export-ready-head">
                <CheckIcon />
                <div>
                  <p className="data-export-ready-title">
                    {t("dataExportReady")}
                  </p>
                  <p className="account-muted">
                    {fill(t("dataExportReadyLine"), {
                      filename: file.filename,
                      size: formatBytes(file.size, locale),
                    })}
                  </p>
                </div>
              </div>
              <div className="space-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={onSave}
                >
                  <DownloadIcon />
                  {t("dataExportSave")}
                </button>
                {canShare ? (
                  <button
                    type="button"
                    className="btn-tertiary"
                    disabled={busy}
                    onClick={onShare}
                  >
                    <ShareIcon />
                    {t("dataExportShare")}
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <p className="account-muted data-export-file-line">
                {ticked.length === 0
                  ? t("dataExportNoneTicked")
                  : fill(t("dataExportFileLine"), {
                      filename,
                      size: formatBytes(estimate, locale),
                    })}
              </p>
              <div className="space-actions">
                <button
                  type="button"
                  className="btn-primary data-export-primary"
                  disabled={ticked.length === 0 || busy}
                  onClick={onExport}
                >
                  <DownloadIcon />
                  {t("dataExportTitle")}
                </button>
              </div>
            </>
          )}
          {failed ? (
            <p className="data-export-failed" role="alert">
              {t("dataExportFailed")}
            </p>
          ) : null}
        </>
      )}
      <p className="data-export-note">
        {t(hosted ? "dataExportImportNoteHosted" : "dataExportImportNote")}
      </p>
      {infoOpen ? (
        <WebDialog
          title={t("dataExportInfoLabel")}
          closeLabel={t("dataExportClose")}
          closeOnBackdrop
          onClose={onCloseInfo}
        >
          <p>{t("dataExportInfoBody")}</p>
        </WebDialog>
      ) : null}
    </section>
  );
}

/**
 * The section of the account page: it reads the summary itself, makes the
 * file on « Exporter mes données » and hands it to the browser. `fetcher`,
 * `now` and `browser` (`{ canShare, share, download }`) are the browser's
 * own by default; a test passes its own.
 */
export function DataExportSection({
  locale = "en",
  hosted = false,
  fetcher = defaultFetcher,
  now = () => new Date(),
  browser = null,
  initial = null,
}) {
  const [date] = useState(() => localDate(now()));
  const [summary, setSummary] = useState(
    () => initial?.summary || { status: "loading" },
  );
  const [ticked, setTicked] = useState(() => [...DATA_EXPORT_PARTS]);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetcher(
        `/api/v1/data-export/summary?date=${date}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!response.ok) throw new Error(String(response.status));
      setSummary({ status: "ready", data: await response.json() });
    } catch {
      setSummary({ status: "failed" });
    }
  }, [fetcher, date]);

  useEffect(() => {
    if (!initial) void load();
    // Once, at the opening of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changed = (next) => {
    setTicked(next);
    setFile(null);
    setFailed(false);
  };
  const onToggle = (part) =>
    changed(
      ticked.includes(part)
        ? ticked.filter((entry) => entry !== part)
        : DATA_EXPORT_PARTS.filter(
            (entry) => entry === part || ticked.includes(entry),
          ),
    );
  const onTickAll = (tick) => changed(tick ? [...DATA_EXPORT_PARTS] : []);

  async function onExport() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetcher(
        `/api/v1/data-export?parts=${ticked.join(",")}&date=${date}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      setFile({
        filename: `planastro-export-${date}.zip`,
        size: blob.size,
        blob,
      });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const host = browser || {
    canShare: (shared) =>
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare(shared),
    share: (shared) => navigator.share(shared),
    download(blob, filename) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
  const sharedFile = (made) =>
    typeof File === "function"
      ? {
          files: [
            new File([made.blob], made.filename, { type: "application/zip" }),
          ],
        }
      : null;
  let canShare = false;
  try {
    const shared = file ? sharedFile(file) : null;
    canShare = Boolean(shared && host.canShare(shared));
  } catch {
    canShare = false;
  }

  async function deliver(action) {
    setFailed(false);
    try {
      await action();
    } catch (error) {
      // The person closing the share sheet is not a failure.
      if (error?.name !== "AbortError") setFailed(true);
    }
  }

  return (
    <DataExportView
      locale={locale}
      hosted={hosted}
      summary={summary}
      ticked={ticked}
      date={date}
      file={file}
      busy={busy}
      failed={failed}
      canShare={canShare}
      infoOpen={infoOpen}
      onToggle={onToggle}
      onTickAll={onTickAll}
      onExport={onExport}
      onSave={() => deliver(() => host.download(file.blob, file.filename))}
      onShare={() => deliver(() => host.share(sharedFile(file)))}
      onInfo={() => setInfoOpen(true)}
      onCloseInfo={() => setInfoOpen(false)}
    />
  );
}
