"use client";

import { Fragment, useState } from "react";
import { message } from "portal/i18n.js";
import { InfoButton } from "../dialog/InfoButton.js";
import { WebConfirmDialog } from "../dialog/WebDialog.js";
import { BinIcon, PencilIcon } from "./NightFieldEditor.js";
import {
  exposureText,
  filterText,
  framesText,
  integrationText,
  say,
  stepsTotal,
} from "./night-detail-view.js";
import { requestJson, responseData } from "./portal-fetch.js";

/**
 * « Paliers d'acquisition »: one row
 * per step — Cible, Filtre, Poses, Exposition, Gain, Intégration (computed,
 * never typed) — a total, and on the right of each row a pencil and a red
 * bin (rules 4 and 8). The pencil turns the row into fields with its own
 * « Enregistrer le palier » primary and « Annuler » as a link; « Ajouter un
 * palier », a tertiary on the right (rule 9), opens an empty row under the
 * table whose « Ajouter ce palier » is greyed while the target, the frames
 * or the exposure are missing. A step corrected by hand says « · modifié »
 * and a new analysis never overwrites it (sheet Q1). The bin asks first
 * (« Supprimer le palier », the dialog's primary in the destructive tint,
 * rule 4).
 *
 * `request(method, path, body)` is the page's: the tests replace it.
 */

const emptyDraft = (targetIds) => ({
  targetId: targetIds.length === 1 ? targetIds[0] : "",
  filter: "",
  frameCount: "",
  exposureSeconds: "",
  gain: "",
});

const draftOf = (step) => ({
  targetId: step.targetId ?? "",
  filter: step.filter ?? "",
  frameCount: String(step.frameCount ?? ""),
  exposureSeconds: String(step.exposureSeconds ?? ""),
  gain: step.gain === null || step.gain === undefined ? "" : String(step.gain),
});

const decimal = (value) => {
  const number = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(number) ? number : null;
};

/** The body of a step's `POST` or `PATCH` from its fields. */
export function stepBody(draft) {
  const frames = decimal(draft.frameCount);
  const exposure = decimal(draft.exposureSeconds);
  const gain = String(draft.gain).trim() === "" ? null : decimal(draft.gain);
  return {
    targetId: draft.targetId || null,
    filter: draft.filter.trim() === "" ? null : draft.filter,
    frameCount: frames === null ? null : Math.round(frames),
    exposureSeconds: exposure,
    gain: gain === null ? null : Math.round(gain),
  };
}

/** Whether a step's fields can be saved (« Ajouter ce palier » greyed otherwise). */
export function stepComplete(draft, { needsTarget = true } = {}) {
  const body = stepBody(draft);
  return (
    (!needsTarget || Boolean(body.targetId)) &&
    Number.isInteger(body.frameCount) &&
    body.frameCount >= 1 &&
    body.exposureSeconds !== null &&
    body.exposureSeconds > 0
  );
}

/** The integration the fields give, in seconds (null while incomplete). */
export const draftIntegration = (draft) => {
  const body = stepBody(draft);
  return body.frameCount && body.exposureSeconds
    ? body.frameCount * body.exposureSeconds
    : null;
};

/** The source line under the title (who proposed the steps, or « Saisis à la main »). */
export function stepsSourceLine({
  steps,
  analysisMeta,
  locale,
  dayOf,
  clockOf,
}) {
  if (!steps.length) return message(locale, "nightPageStepsEmpty");
  if (analysisMeta?.present && analysisMeta.sentAt) {
    const values = {
      date: dayOf(analysisMeta.sentAt),
      time: clockOf(analysisMeta.sentAt),
    };
    return say(
      locale,
      analysisMeta.producer === "import"
        ? "nightPageStepsFromImport"
        : "nightPageStepsFromAnalysis",
      values,
    );
  }
  return message(locale, "nightPageStepsManual");
}

function StepFields({
  locale,
  draft,
  setDraft,
  targetChoices,
  names,
  integration,
}) {
  const field = (key, label, { suffix = null, inputMode = "numeric" } = {}) => (
    <span className={`night-step-field${suffix ? " has-suffix" : ""}`}>
      <input
        type="text"
        inputMode={inputMode}
        className="night-field-input"
        value={draft[key]}
        placeholder={message(locale, label)}
        aria-label={message(locale, label)}
        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
      />
      {suffix ? <span className="night-step-suffix">{suffix}</span> : null}
    </span>
  );
  return (
    <>
      <td>
        <select
          className="night-field-input"
          value={draft.targetId}
          aria-label={message(locale, "nightPageColumnTarget")}
          data-autofocus=""
          onChange={(event) =>
            setDraft({ ...draft, targetId: event.target.value })
          }
        >
          <option value="">{message(locale, "nightPageChooseTarget")}</option>
          {targetChoices.map((id) => (
            <option key={id} value={id}>
              {names[id] ?? id}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          type="text"
          className="night-field-input"
          value={draft.filter}
          maxLength={40}
          placeholder={message(locale, "nightPageColumnFilter")}
          aria-label={message(locale, "nightPageColumnFilter")}
          onChange={(event) =>
            setDraft({ ...draft, filter: event.target.value })
          }
        />
      </td>
      <td>{field("frameCount", "nightPageColumnFrames")}</td>
      <td>
        {field("exposureSeconds", "nightPageColumnExposure", {
          suffix: message(locale, "nightPageSeconds"),
          inputMode: "decimal",
        })}
      </td>
      <td>{field("gain", "nightPageColumnGain")}</td>
      <td className="night-step-integration">
        {integration === null ? "—" : integrationText(integration, locale)}
      </td>
    </>
  );
}

export function NightStepsTable({
  locale = "en",
  sessionId,
  steps = [],
  targetIds = [],
  names = {},
  analysisMeta = null,
  dayOf = (value) => value,
  clockOf = (value) => value,
  onChanged = () => {},
  request = null,
}) {
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const base = `/api/v1/sessions/${encodeURIComponent(sessionId)}/steps`;
  const send =
    request ??
    (async (method, path, body) => {
      const response = await requestJson(path, { method, body });
      if (method === "DELETE" && response.ok) return null;
      return responseData(response, message(locale, "nightPageSaveFailed"));
    });
  const choices = [
    ...targetIds,
    ...steps.map((step) => step.targetId).filter(Boolean),
  ].filter((id, index, all) => all.indexOf(id) === index);
  const titleOf = (step) =>
    (step.targetId && (names[step.targetId] ?? step.targetId)) ||
    step.targetHint ||
    message(locale, "nightPageStepNoTarget");

  async function run(action) {
    setBusy(true);
    setError("");
    try {
      await action();
      await onChanged();
      return true;
    } catch {
      setError(message(locale, "nightPageSaveFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  // The total follows a row being corrected (« Le total suit »).
  const total = stepsTotal(
    steps.map((step) => {
      if (editing?.id !== step.id) return step;
      const body = stepBody(editing.draft);
      return stepComplete(editing.draft, { needsTarget: false })
        ? {
            ...step,
            frameCount: body.frameCount,
            integrationSeconds: body.frameCount * body.exposureSeconds,
          }
        : step;
    }),
  );
  // The columns' words (an object: never a positional list of copy).
  const columns = Object.keys({
    nightPageColumnTarget: true,
    nightPageColumnFilter: true,
    nightPageColumnFrames: true,
    nightPageColumnExposure: true,
    nightPageColumnGain: true,
    nightPageColumnIntegration: true,
  });
  return (
    <section
      className="night-card night-steps"
      aria-labelledby="night-steps-title"
    >
      <h2 id="night-steps-title">{message(locale, "nightPageStepsTitle")}</h2>
      <div className="info-line night-card-line">
        <p className="info-line-text">
          {stepsSourceLine({ steps, analysisMeta, locale, dayOf, clockOf })}
        </p>
        <InfoButton
          locale={locale}
          title={message(locale, "nightPageStepsTitle")}
          body={message(locale, "nightPageStepsInfo")}
        />
      </div>
      <table className="night-table night-steps-table">
        <thead>
          <tr>
            {columns.map((key) => (
              <th key={key} scope="col">
                {message(locale, key)}
              </th>
            ))}
            <th scope="col">
              <span className="visually-hidden">
                {message(locale, "nightPageColumnActions")}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step) =>
            editing?.id === step.id ? (
              <Fragment key={step.id}>
                <tr className="night-step-row is-editing">
                  <StepFields
                    locale={locale}
                    draft={editing.draft}
                    setDraft={(draft) => setEditing({ ...editing, draft })}
                    targetChoices={choices}
                    names={names}
                    integration={draftIntegration(editing.draft)}
                  />
                  <td />
                </tr>
                <tr className="night-step-foot is-editing">
                  <td className="night-step-edit-foot" colSpan={7}>
                    <div className="night-step-foot-inner">
                      <p className="night-field-hint">
                        {message(locale, "nightPageIntegrationComputed")}
                      </p>
                      <footer className="night-field-actions">
                        <button
                          type="button"
                          className="btn-link"
                          disabled={busy}
                          onClick={() => setEditing(null)}
                        >
                          {message(locale, "nightPageCancel")}
                        </button>
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={
                            busy ||
                            !stepComplete(editing.draft, { needsTarget: false })
                          }
                          onClick={() =>
                            void run(async () => {
                              await send(
                                "PATCH",
                                `${base}/${encodeURIComponent(step.id)}`,
                                stepBody(editing.draft),
                              );
                              setEditing(null);
                            })
                          }
                        >
                          {message(locale, "nightPageSaveStep")}
                        </button>
                      </footer>
                    </div>
                  </td>
                </tr>
              </Fragment>
            ) : (
              <tr key={step.id} className="night-step-row">
                <th scope="row">
                  <strong>{titleOf(step)}</strong>
                  {step.edited ? (
                    <span className="night-step-edited">
                      {" · "}
                      {message(locale, "nightPageStepEdited")}
                    </span>
                  ) : null}
                </th>
                <td>{filterText(step.filter, locale)}</td>
                <td>{step.frameCount}</td>
                <td>{exposureText(step.exposureSeconds, locale)}</td>
                <td>{step.gain ?? "—"}</td>
                <td>{integrationText(step.integrationSeconds, locale)}</td>
                <td className="night-step-actions">
                  <button
                    type="button"
                    className="night-icon-button"
                    disabled={busy}
                    aria-label={say(locale, "nightPageEditStep", {
                      target: titleOf(step),
                    })}
                    title={say(locale, "nightPageEditStep", {
                      target: titleOf(step),
                    })}
                    onClick={() =>
                      setEditing({ id: step.id, draft: draftOf(step) })
                    }
                  >
                    <PencilIcon />
                  </button>
                  <button
                    type="button"
                    className="night-icon-button night-icon-button-danger"
                    disabled={busy}
                    aria-label={say(locale, "nightPageDeleteStep", {
                      target: titleOf(step),
                    })}
                    title={say(locale, "nightPageDeleteStep", {
                      target: titleOf(step),
                    })}
                    onClick={() => setDeleting(step)}
                  >
                    <BinIcon />
                  </button>
                </td>
              </tr>
            ),
          )}
          {adding ? (
            <>
              <tr className="night-step-new-head">
                <td colSpan={7}>
                  <p className="night-step-new-label">
                    {message(locale, "nightPageNewStep")}
                  </p>
                </td>
              </tr>
              <tr className="night-step-row is-new">
                <StepFields
                  locale={locale}
                  draft={adding}
                  setDraft={setAdding}
                  targetChoices={choices}
                  names={names}
                  integration={draftIntegration(adding)}
                />
                <td />
              </tr>
              <tr className="night-step-foot is-new">
                <td className="night-step-edit-foot" colSpan={7}>
                  <footer className="night-field-actions">
                    <button
                      type="button"
                      className="btn-link"
                      disabled={busy}
                      onClick={() => setAdding(null)}
                    >
                      {message(locale, "nightPageCancel")}
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busy || !stepComplete(adding)}
                      onClick={() =>
                        void run(async () => {
                          await send("POST", base, stepBody(adding));
                          setAdding(null);
                        })
                      }
                    >
                      {message(locale, "nightPageAddThisStep")}
                    </button>
                  </footer>
                </td>
              </tr>
            </>
          ) : null}
        </tbody>
        {steps.length ? (
          <tfoot>
            <tr className="night-steps-total">
              <th scope="row">{message(locale, "nightPageStepsTotal")}</th>
              <td />
              <td>{framesText(total.frames, locale)}</td>
              <td />
              <td />
              <td>
                <strong>{integrationText(total.seconds, locale)}</strong>
              </td>
              <td />
            </tr>
          </tfoot>
        ) : null}
      </table>
      {error ? (
        <p className="debrief-error" role="alert">
          {error}
        </p>
      ) : null}
      {adding ? null : (
        <div className="night-card-actions">
          <button
            type="button"
            className="btn-tertiary"
            disabled={busy}
            onClick={() => setAdding(emptyDraft(targetIds))}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            {message(locale, "nightPageAddStep")}
          </button>
        </div>
      )}
      {deleting ? (
        <WebConfirmDialog
          busy={busy}
          title={message(locale, "nightPageDeleteStepTitle")}
          description={say(locale, "nightPageDeleteStepBody", {
            target: titleOf(deleting),
            frames: framesText(deleting.frameCount, locale),
          })}
          cancelLabel={message(locale, "nightPageCancel")}
          confirmLabel={message(locale, "nightPageDeleteStepConfirm")}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            void run(async () => {
              await send(
                "DELETE",
                `${base}/${encodeURIComponent(deleting.id)}`,
              );
              setDeleting(null);
            })
          }
        />
      ) : null}
    </section>
  );
}
