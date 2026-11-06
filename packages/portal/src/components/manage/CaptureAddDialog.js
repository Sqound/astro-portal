"use client";

import { useRef, useState } from "react";
import { WebDialog } from "../dialog/WebDialog.js";
import { durationText } from "../../written-forms.js";
import { journalPlanDate } from "../sessions/journal-rows.js";
import {
  checkUpload,
  createDefinition,
  fileDigest,
  guessTarget,
  uploadCapture,
} from "./captures-client.js";
import {
  captureCountFits,
  entryTarget,
  fileCaptures,
  groupEntries,
  groupMode,
  groupView,
  primaryLabel,
  readFileDetails,
} from "./capture-filing.js";
import { dayMonth, fileSize, longDay } from "./captures-format.js";
import { useTargetsPicker } from "./TargetsPickerContext.js";
import { nameFromFile, photoExif } from "./photo-exif.js";

/**
 * « Ajouter une capture » (a capture always has its session): a
 * `WebDialog` in two steps, « Image » then « Rangement ». The file or files
 * are chosen first (« Choisir un fichier », the primary, and a drop zone);
 * each file's SHA-256 is checked by `POST /api/v1/uploads/check` before a
 * byte is sent — « déjà dans votre espace » when the space holds it,
 * the refusal's reason in words, nothing sent — and the free space's number
 * of captures is counted before any session is created, so that a refusal
 * leaves nothing half-built.
 *
 * « Rangement » says where the capture will be filed, in lines each with a
 * « Modifier »: « Nuit du {date} » (« D'après la photo », from the file's
 * EXIF when the browser can read it, else « Nuit : à choisir »), « Lieu : »
 * (the saved place nearest to the photo, else the person's current place)
 * and « Cible : » (guessed from the file's name, else none: « à préciser »).
 * A capture is never left without a session: when a session of that night
 * exists, « Rattacher à la nuit du {jour} ? » comes first; the primary
 * creates the session (origin `capture`: create, finish, night with its
 * place and targets), or joins the existing one, then sends. Several files
 * are gathered by night and place — « Créer {n} sessions et envoyer » — and
 * the files of one night each carry their own target line, one session.
 *
 * The page of a session opens the box with the night and the target already
 * known (`initial`: `SessionPhotoSender`): then the box has only the image
 * and its confirmation, as before.
 *
 * `refusalWords(outcome, file)` turns a refusal into the list's words
 * (`uploadRefusalWords` of the tab).
 */

const Icon = ({ children, size = 18 }) => (
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
  >
    {children}
  </svg>
);
const CheckIcon = () => (
  <Icon size={14}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);
const UploadIcon = () => (
  <Icon size={26}>
    <path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19h14" />
  </Icon>
);
const CalendarIcon = () => (
  <Icon>
    <rect x="4" y="5.5" width="16" height="14" rx="2.5" />
    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
  </Icon>
);
const PinIcon = () => (
  <Icon>
    <path d="M12 20.5s6-5.3 6-10a6 6 0 10-12 0c0 4.7 6 10 6 10z" />
    <circle cx="12" cy="10.5" r="2.2" />
  </Icon>
);
const TargetIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="6.5" />
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
  </Icon>
);

const STEP_OF = {
  image: 2,
  confirm: 2,
  files: 0,
  filing: 1,
};

function Steps({ copy, step, filing }) {
  const current = STEP_OF[step] ?? 0;
  const names = filing
    ? [copy.steps.image, copy.stepFiling]
    : [copy.steps.night, copy.steps.target, copy.steps.image];
  return (
    <ol className="capture-add-steps" aria-label={copy.stepsLabel}>
      {names.map((name, index) => (
        <li
          key={name}
          className={
            index < current ? "is-done" : index === current ? "is-current" : ""
          }
          aria-current={index === current ? "step" : undefined}
        >
          <span className="capture-add-step-mark">
            {index < current ? <CheckIcon /> : index + 1}
          </span>
          <span>{name}</span>
        </li>
      ))}
    </ol>
  );
}

const targetText = (target) =>
  [target.designation, target.name].filter(Boolean).join(" · ");

export function nightText(night, locale) {
  return [journalPlanDate(night.night, locale), night.place]
    .filter(Boolean)
    .join(" · ");
}

/**
 * What an upload of the add box declares besides its file: the target, the
 * night, and a draft (« Elle sera ajoutée en brouillon, privée. »).
 */
export const addMetadata = (target, night) => ({
  ...(target?.id ? { targetIds: [target.id] } : {}),
  ...(night?.sessionId ? { sessionId: night.sessionId } : {}),
  stage: "draft",
});

/**
 * The file's SHA-256, then `POST /api/v1/uploads/check` before a byte is
 * sent. `{ outcome, sha256, notice }`: no `notice` when the file may be
 * sent; « … est déjà dans votre espace : rien n'a été envoyé. » when the
 * space holds it; the refusal's reason in the list's words otherwise.
 */
export async function checkBeforeSending({
  fetcher,
  csrf,
  file,
  metadata,
  copy,
  refusalWords,
  digest = fileDigest,
}) {
  let sha256;
  try {
    sha256 = await digest(file);
  } catch {
    const outcome = { kind: "failed" };
    return { outcome, notice: refusalWords(outcome, file.name) };
  }
  const outcome = await checkUpload(fetcher, {
    csrf,
    metadata: {
      originalName: file.name,
      sha256,
      byteSize: file.size,
      ...metadata,
    },
  });
  if (outcome.kind === "present")
    return {
      outcome,
      sha256,
      notice: { title: copy.alreadyPresent(file.name), body: null },
    };
  if (outcome.kind !== "accepted")
    return {
      outcome,
      sha256,
      notice: refusalWords(
        outcome.kind === "refused"
          ? { kind: "refused", code: outcome.code, storage: outcome.storage }
          : outcome,
        file.name,
      ),
    };
  return { outcome, sha256, notice: null };
}

/**
 * A refusal for the space's limit names the way out, whichever step it
 * arrives at: the link to the offers, where they are shown (`offersHref`);
 * every other refusal keeps its words.
 */
export function refusalWithOffers(wordsOf, offersHref, label) {
  return (outcome, name) => {
    const words = wordsOf(outcome, name);
    return offersHref &&
      (outcome?.code === "capture_limit_reached" ||
        outcome?.code === "storage_quota_reached")
      ? { ...words, link: { href: offersHref, label } }
      : words;
  };
}

/**
 * The words of a failure of the gesture of « Rangement », by the step that
 * failed: the service's own reason when it gave one the add box knows (the
 * space's limits, the read-only window, a refused upload), « La capture n'a
 * pas pu être créée » for a session or a definition it could not build, « La
 * cible n'a pas pu être créée » for a target.
 */
export function fileFailureWords({ answer, copy, refusalWords }) {
  const name = answer.entry?.file?.name ?? copy.definitionName;
  if (answer.step === "limit" || answer.step === "upload")
    return refusalWords(answer, name);
  if (answer.step === "target") return { title: copy.targetFailed, body: null };
  const known =
    answer.code === "capture_limit_reached" ||
    answer.code === "storage_quota_reached" ||
    answer.code === "entitlement_read_only";
  return known
    ? refusalWords({ ...answer, kind: "refused" }, name)
    : { title: copy.definitionFailed, body: null };
}

const NOTHING = { date: null, time: null, latitude: null, longitude: null };

export function CaptureAddDialog({
  copy,
  locale = "en",
  nights = [],
  places = [],
  storage = null,
  fetcher,
  csrf = () => "",
  leaves = () => false,
  refusalWords: wordsOf,
  offersHref = null,
  onClose,
  onAdded,
  initial = null,
  now = () => new Date(),
}) {
  const refusalWords = refusalWithOffers(wordsOf, offersHref, copy.seeOffers);
  const [state, setState] = useState(() => ({
    step: initial?.target ? "image" : "files",
    night: initial?.night ?? null,
    target: initial?.target ?? null,
    file: null,
    sha256: null,
    files: [],
    choices: {},
    pinned: null,
    edit: null,
    notice: null,
    busy: false,
    created: new Map(),
    uploaded: new Set(),
  }));
  const patch = (changes) =>
    setState((current) => ({ ...current, ...changes }));
  const fileInput = useRef(null);
  const [dragging, setDragging] = useState(false);

  // The page of a session opens the box on its own night and target: one
  // file, checked against that night, then confirmed.
  async function chooseFile(file) {
    if (!file) return;
    patch({ busy: true, notice: null, file });
    const checked = await checkBeforeSending({
      fetcher,
      csrf: csrf(),
      file,
      metadata: addMetadata(state.target, state.night),
      copy,
      refusalWords,
    });
    if (leaves(checked.outcome)) return;
    if (checked.notice) {
      patch({ busy: false, notice: checked.notice });
      return;
    }
    patch({ busy: false, sha256: checked.sha256, step: "confirm" });
  }

  async function send(target) {
    patch({ busy: true, notice: null });
    const outcome = await uploadCapture(fetcher, {
      file: state.file,
      sha256: state.sha256,
      csrf: csrf(),
      metadata: addMetadata(target, state.night),
    });
    if (leaves(outcome)) return;
    if (outcome.kind === "ok") {
      onAdded(outcome);
      return;
    }
    patch({ busy: false, notice: refusalWords(outcome, state.file.name) });
  }

  // « Créer sans image » from the page of a session — the capture's
  // definition alone, for the night and the target it opened on.
  async function createEmpty() {
    patch({ busy: true, notice: null });
    const outcome = await createDefinition(fetcher, {
      sessionId: state.night?.sessionId ?? null,
      targetIds: state.target?.id ? [state.target.id] : [],
      locale,
      csrf: csrf(),
    });
    if (leaves(outcome)) return;
    if (outcome.kind === "ok") {
      onAdded(outcome);
      return;
    }
    patch({
      busy: false,
      notice: fileFailureWords({
        answer: { ...outcome, step: "session" },
        copy,
        refusalWords,
      }),
    });
  }

  // « Image »: the files, each checked before anything is built (the space's
  // limit too), then read for what they say of their night and place, and
  // for the target their name names.
  async function chooseFiles(list) {
    const chosen = [...(list ?? [])].filter(Boolean);
    if (!chosen.length) return;
    patch({ busy: true, notice: null });
    const sums = [];
    for (const file of chosen) {
      const checked = await checkBeforeSending({
        fetcher,
        csrf: csrf(),
        file,
        metadata: { stage: "draft" },
        copy,
        refusalWords,
      });
      if (leaves(checked.outcome)) return;
      if (checked.notice) {
        patch({ busy: false, notice: checked.notice });
        return;
      }
      sums.push(checked.sha256);
    }
    const fits = captureCountFits({ storage, adding: chosen.length });
    if (!fits.ok) {
      patch({
        busy: false,
        notice: refusalWords(fits.outcome, chosen[0].name),
      });
      return;
    }
    const entries = [];
    for (const [index, file] of chosen.entries()) {
      const exif = await photoExif(file);
      entries.push({
        file,
        sha256: sums[index],
        exif,
        guess: await guessTarget(fetcher, {
          name: nameFromFile(file.name),
          locale,
        }),
        ...readFileDetails({ exif, places, now: now() }),
      });
    }
    patch({
      busy: false,
      step: "filing",
      files: entries,
      choices: {},
      pinned: null,
      edit: null,
      created: new Map(),
      uploaded: new Set(),
    });
  }

  // « Créer la capture sans image »: the same step, with no file — the
  // capture's definition joins the session, the images come later.
  function chooseNoFile() {
    const fits = captureCountFits({ storage, adding: 1 });
    if (!fits.ok) {
      patch({ notice: refusalWords(fits.outcome, copy.definitionName) });
      return;
    }
    patch({
      step: "filing",
      notice: null,
      files: [
        {
          file: null,
          sha256: null,
          exif: NOTHING,
          guess: null,
          ...readFileDetails({ exif: NOTHING, places, now: now() }),
        },
      ],
      choices: {},
      pinned: null,
      edit: null,
      created: new Map(),
      uploaded: new Set(),
    });
  }

  async function fileAndSend() {
    patch({ busy: true, notice: null, edit: null });
    const groups = groupEntries({
      entries: state.files,
      nights,
      pinned: state.pinned,
    });
    const answer = await fileCaptures({
      fetcher,
      csrf: csrf(),
      locale,
      entries: state.files,
      groups,
      choices: state.choices,
      storage,
      created: state.created,
      uploaded: state.uploaded,
    });
    if (leaves(answer)) return;
    if (answer.kind === "ok") {
      onAdded(answer.outcome);
      return;
    }
    patch({
      busy: false,
      notice: fileFailureWords({ answer, copy, refusalWords }),
    });
  }

  const { title, body, footer } = addStepParts({
    state,
    patch,
    copy,
    locale,
    nights,
    places,
    initial,
    fileInput,
    dragging,
    setDragging,
    chooseFile,
    chooseFiles,
    chooseNoFile,
    createEmpty,
    send,
    fileAndSend,
    onClose,
  });
  return (
    <WebDialog
      className="capture-add-dialog"
      title={title}
      closeLabel={copy.close}
      closeDisabled={state.busy}
      onClose={onClose}
      footerClassName="capture-add-footer"
      footer={footer}
    >
      <AddStepBody
        copy={copy}
        step={state.step}
        notice={state.notice}
        body={body}
        filing={!initial?.target}
      />
    </WebDialog>
  );
}

/**
 * The target search with its labelled rows — the preview, the designation
 * and name, type · constellation, the space's own targets first — handed
 * down by the shell (`TargetsPickerContext`), the same one as a night's
 * « Cibles » row and the owner's detail.
 */
export function TargetSearch({ locale, onPick }) {
  const Picker = useTargetsPicker();
  return Picker ? <Picker locale={locale} onPick={onPick} /> : null;
}

/** One line of « Rangement »: its icon, its words, its « Modifier ». */
function FilingLine({
  icon,
  title,
  sub,
  onEdit,
  editLabel,
  editing,
  children,
}) {
  return (
    <li className="capture-add-line">
      <span className="capture-add-line-icon">{icon}</span>
      <span className="capture-add-line-words">
        <strong>{title}</strong>
        {sub ? <span>{sub}</span> : null}
      </span>
      {onEdit ? (
        <button
          type="button"
          className="btn-link"
          aria-expanded={editing || undefined}
          onClick={onEdit}
        >
          {editLabel}
        </button>
      ) : null}
      {children}
    </li>
  );
}

/**
 * « Cette nuit a déjà une session » — « Rattacher à la nuit du {jour} ? »:
 * the choice between joining the session that exists and creating a new
 * one (two radios, the first chosen).
 */
function AttachChoice({ group, mode, copy, locale, dayOf, setMode }) {
  const existing = group.existing;
  const day = dayOf(existing.night);
  const what = existing.targets?.length
    ? copy.nightTargets(existing.place, existing.targets.length)
    : existing.place || journalPlanDate(existing.night, locale);
  const radio = (value, words, sub) => (
    <label className={`capture-add-radio${mode === value ? " is-on" : ""}`}>
      <input
        type="radio"
        name={`attach-${group.key}`}
        checked={mode === value}
        onChange={() => setMode(value)}
      />
      <span>
        <strong>{words}</strong>
        {sub ? <span>{sub}</span> : null}
      </span>
    </label>
  );
  return (
    <fieldset className="capture-add-attach">
      <legend>{copy.filingExistsTitle}</legend>
      <p className="capture-add-question">{copy.filingAttachAsk(day)}</p>
      {radio("attach", copy.filingAttachChoice(day), what)}
      {radio("create", copy.filingCreateChoice, null)}
    </fieldset>
  );
}

/** The body of « Rangement » (exported for the tests, drawn without a browser). */
export function FilingBody({
  state,
  patch,
  copy,
  locale,
  nights = [],
  places = [],
}) {
  const dayOf = (night) => longDay(night, locale, { timeZone: "UTC" });
  const groups = groupEntries({
    entries: state.files,
    nights,
    pinned: state.pinned,
  });
  const edit = state.edit;
  const update = (index, changes) =>
    patch({
      files: state.files.map((entry, at) =>
        at === index ? { ...entry, ...changes } : entry,
      ),
      edit: null,
    });
  const updateGroup = (group, changes) =>
    patch({
      files: state.files.map((entry, at) =>
        group.entries.includes(at) ? { ...entry, ...changes } : entry,
      ),
      edit: null,
    });

  if (edit?.kind === "session")
    return (
      <>
        <h3 className="capture-add-question">{copy.filingPickExisting}</h3>
        <ul className="capture-add-choices">
          {nights.map((night) => (
            <li key={night.sessionId}>
              <button
                type="button"
                className="capture-add-choice"
                onClick={() => patch({ pinned: night, edit: null })}
              >
                <strong>{journalPlanDate(night.night, locale)}</strong>
                <span>
                  {night.targets.length
                    ? copy.nightTargets(night.place, night.targets.length)
                    : night.place || ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </>
    );

  const targetEditor = (index) => {
    const entry = state.files[index];
    if (edit?.kind === "newTarget" && edit.index === index)
      return (
        <form
          className="capture-add-new-target"
          onSubmit={(event) => {
            event.preventDefault();
            const name = String(edit.name ?? "").trim();
            if (name)
              update(index, {
                target: { new: true, id: null, designation: name, name: null },
              });
          }}
        >
          <label className="capture-tags-label" htmlFor="capture-add-name">
            {copy.nameLabel}
          </label>
          <input
            id="capture-add-name"
            type="text"
            className="capture-tags-input"
            value={edit.name}
            maxLength={80}
            required
            onChange={(event) =>
              patch({ edit: { ...edit, name: event.target.value } })
            }
          />
          <button
            type="submit"
            className="btn-tertiary"
            disabled={!String(edit.name ?? "").trim()}
          >
            {copy.filingNewTargetUse}
          </button>
        </form>
      );
    if (edit?.kind === "target" && edit.index === index)
      return (
        <div className="capture-add-editor">
          <TargetSearch
            locale={locale}
            onPick={(target) =>
              update(index, {
                target: {
                  id: target.id,
                  designation: target.designation,
                  name: target.name ?? null,
                },
              })
            }
          />
          <p className="capture-add-editor-links">
            <button
              type="button"
              className="btn-link"
              onClick={() =>
                patch({
                  edit: {
                    kind: "newTarget",
                    index,
                    name: nameFromFile(entry.file?.name),
                  },
                })
              }
            >
              {copy.notInCatalogue}
            </button>
            <button
              type="button"
              className="btn-link"
              onClick={() => update(index, { target: null })}
            >
              {copy.filingTargetClear}
            </button>
          </p>
        </div>
      );
    return null;
  };

  const several = state.files.length > 1;
  return (
    <>
      <ul className="capture-add-filed">
        {state.files.map((entry, index) =>
          entry.file ? (
            <li key={`${entry.sha256}-${index}`}>
              <span className="capture-add-file">
                {[entry.file.name, fileSize(entry.file.size, locale)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {index === 0 ? (
                <button
                  type="button"
                  className="btn-link"
                  disabled={state.busy}
                  onClick={() =>
                    patch({
                      step: "files",
                      files: [],
                      pinned: null,
                      edit: null,
                    })
                  }
                >
                  {copy.filingChange}
                </button>
              ) : null}
            </li>
          ) : null,
        )}
      </ul>
      <p className="capture-add-filing-title">
        {copy.filingTitle(state.files.length)}
      </p>
      {groups.map((group) => {
        const mode = groupMode(group, state.choices);
        // A group that joins a session is filed under ITS night and place
        // (and target, when it observed one), never the file's own.
        const { night, place, attached } = groupView(group, mode);
        const editing = (kind) => edit?.kind === kind && edit.key === group.key;
        return (
          <section key={group.key} className="capture-add-group">
            {group.existing ? (
              <AttachChoice
                group={group}
                mode={mode}
                copy={copy}
                locale={locale}
                dayOf={dayOf}
                setMode={(next) =>
                  patch({ choices: { ...state.choices, [group.key]: next } })
                }
              />
            ) : null}
            <ul className="capture-add-lines">
              <FilingLine
                icon={<CalendarIcon />}
                title={
                  night.from === "tonight"
                    ? copy.filingNightAssumed(dayOf(night.date))
                    : copy.night(dayOf(night.date))
                }
                sub={
                  night.from === "photo"
                    ? copy.filingFromPhoto(
                        dayMonth(night.photoDate, locale),
                        night.time,
                      )
                    : night.from === "tonight"
                      ? copy.filingNoExif
                      : null
                }
                onEdit={
                  attached
                    ? null
                    : () =>
                        patch({
                          edit: editing("night")
                            ? null
                            : { kind: "night", key: group.key },
                        })
                }
                editLabel={copy.filingEdit}
                editing={editing("night")}
              >
                {editing("night") && !attached ? (
                  <input
                    type="date"
                    className="capture-tags-input capture-add-editor"
                    aria-label={copy.nightLabel}
                    value={night.date}
                    onChange={(event) =>
                      event.target.value &&
                      updateGroup(group, { nightOverride: event.target.value })
                    }
                  />
                ) : null}
              </FilingLine>
              {place ? (
                <FilingLine
                  icon={<PinIcon />}
                  title={copy.filingPlace(place.name)}
                  sub={
                    place.from === "saved"
                      ? copy.placeNearest
                      : place.from === "photo"
                        ? copy.filingPlacePhoto
                        : place.from === "current"
                          ? copy.filingPlaceCurrent
                          : null
                  }
                  onEdit={
                    places.length && !attached
                      ? () =>
                          patch({
                            edit: editing("place")
                              ? null
                              : { kind: "place", key: group.key },
                          })
                      : null
                  }
                  editLabel={copy.filingEdit}
                  editing={editing("place")}
                >
                  {editing("place") && !attached ? (
                    <select
                      className="capture-tags-input capture-add-editor"
                      aria-label={copy.placeLabel}
                      value={place.name}
                      onChange={(event) => {
                        const chosen = places.find(
                          (candidate) => candidate.name === event.target.value,
                        );
                        if (chosen)
                          updateGroup(group, {
                            placeOverride: { ...chosen, from: "choice" },
                          });
                      }}
                    >
                      {[
                        ...places,
                        ...(places.some(
                          (candidate) => candidate.name === place.name,
                        )
                          ? []
                          : [place]),
                      ].map((candidate) => (
                        <option key={candidate.name} value={candidate.name}>
                          {candidate.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </FilingLine>
              ) : null}
              {group.entries.map((index) => {
                const entry = state.files[index];
                const target = entryTarget(entry, group, mode);
                const guessed =
                  entry.target === undefined && Boolean(entry.guess);
                const editingTarget =
                  edit?.index === index &&
                  (edit.kind === "target" || edit.kind === "newTarget");
                return (
                  <FilingLine
                    key={index}
                    icon={<TargetIcon />}
                    title={
                      target
                        ? copy.filingTarget(
                            target.new
                              ? target.designation
                              : targetText(target),
                          )
                        : copy.filingTargetNone
                    }
                    sub={
                      [
                        several ? entry.file?.name : null,
                        guessed ? copy.filingTargetFromFile : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || null
                    }
                    onEdit={() =>
                      patch({
                        edit: editingTarget ? null : { kind: "target", index },
                      })
                    }
                    editLabel={copy.filingEdit}
                    editing={editingTarget}
                  >
                    {targetEditor(index)}
                  </FilingLine>
                );
              })}
            </ul>
          </section>
        );
      })}
      <p className="account-muted capture-add-draft">{copy.addedAsDraft}</p>
    </>
  );
}

/**
 * The title, the body and the footer of one step of the add box, drawn from
 * its state (exported for the tests, which draw every step without a
 * browser: a `WebDialog` renders in the page only).
 */
export function addStepParts({
  state,
  patch,
  copy,
  locale,
  nights = [],
  places = [],
  initial = null,
  fileInput = null,
  dragging = false,
  setDragging = () => {},
  chooseFile = async () => {},
  chooseFiles = async () => {},
  chooseNoFile = () => {},
  createEmpty = async () => {},
  send = async () => {},
  fileAndSend = async () => {},
  onClose = () => {},
}) {
  const legacy = Boolean(initial?.target);
  const context = [
    state.target ? targetText(state.target) : null,
    state.night ? nightText(state.night, locale) : null,
  ].filter(Boolean);

  let title = copy.addTitle;
  let body = null;
  let footer = null;
  if (state.step === "files" || state.step === "image") {
    const pick = legacy
      ? (list) => void chooseFile(list?.[0])
      : (list) => void chooseFiles(list);
    body = (
      <>
        {legacy && context.length ? (
          <div className="capture-add-context">
            {context.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        ) : null}
        <div
          className={`capture-add-drop${dragging ? " is-over" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            pick([...(event.dataTransfer?.files ?? [])]);
          }}
        >
          <UploadIcon />
          <p>{state.busy ? copy.checking : copy.dropHere}</p>
        </div>
        <p className="account-muted capture-add-draft">{copy.addedAsDraft}</p>
        <input
          ref={fileInput}
          type="file"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          multiple={!legacy}
          accept="image/*,.fits,.fit,.fts,.xisf,.tif,.tiff"
          onChange={(event) => {
            const list = [...(event.target.files || [])];
            event.target.value = "";
            pick(list);
          }}
        />
      </>
    );
    footer = (
      <>
        {legacy ? (
          <button
            type="button"
            className="btn-link"
            disabled={state.busy}
            onClick={() => patch({ step: "image", notice: null })}
          >
            {copy.back}
          </button>
        ) : null}
        <button
          type="button"
          className="btn-tertiary"
          disabled={state.busy}
          onClick={() => (legacy ? void createEmpty() : chooseNoFile())}
        >
          {copy.createWithoutImage}
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={state.busy}
          aria-busy={state.busy || undefined}
          onClick={() => fileInput?.current?.click()}
        >
          {copy.chooseFile}
        </button>
      </>
    );
  } else if (state.step === "filing") {
    const groups = groupEntries({
      entries: state.files,
      nights,
      pinned: state.pinned,
    });
    const withFiles = state.files.some((entry) => entry.file);
    const picking = state.edit?.kind === "session";
    body = (
      <FilingBody
        state={state}
        patch={patch}
        copy={copy}
        locale={locale}
        nights={nights}
        places={places}
      />
    );
    footer = picking ? (
      <button
        type="button"
        className="btn-link"
        onClick={() => patch({ edit: null })}
      >
        {copy.back}
      </button>
    ) : (
      <>
        <button
          type="button"
          className="btn-link"
          disabled={state.busy}
          onClick={() =>
            patch({
              step: "files",
              files: [],
              pinned: null,
              edit: null,
              notice: null,
            })
          }
        >
          {copy.back}
        </button>
        {nights.length ? (
          <button
            type="button"
            className="btn-tertiary"
            disabled={state.busy}
            onClick={() => patch({ edit: { kind: "session" } })}
          >
            {copy.filingPickExisting}
          </button>
        ) : null}
        <button
          type="button"
          className="btn-primary"
          disabled={state.busy}
          aria-busy={state.busy || undefined}
          onClick={() => void fileAndSend()}
        >
          {primaryLabel({
            copy,
            groups,
            choices: state.choices,
            withFiles,
            dayOf: (night) => longDay(night, locale, { timeZone: "UTC" }),
          })}
        </button>
      </>
    );
  } else if (state.step === "confirm") {
    const target = state.target;
    title = copy.addTo(target.designation);
    body = (
      <>
        <p className="capture-add-context">{targetText(target)}</p>
        <p className="capture-add-file">{state.file?.name}</p>
        {state.night ? (
          <dl className="capture-facts capture-add-facts">
            <div>
              <dt>{copy.nightLabel}</dt>
              <dd>{nightText(state.night, locale)}</dd>
            </div>
            <div>
              <dt>{copy.integrationLabel}</dt>
              <dd>
                {target.integrationMinutes
                  ? durationText(target.integrationMinutes, locale)
                  : copy.integrationUnknown}
              </dd>
            </div>
          </dl>
        ) : null}
        <p className="account-muted capture-add-draft">{copy.addedAsDraft}</p>
      </>
    );
    footer = (
      <>
        <button
          type="button"
          className="btn-link"
          disabled={state.busy}
          onClick={onClose}
        >
          {copy.cancel}
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={state.busy}
          aria-busy={state.busy || undefined}
          onClick={() => void send(target)}
        >
          {copy.addTo(target.designation)}
        </button>
      </>
    );
  }
  return { title, body, footer };
}

/** One step with its steps and its notice, as the dialog's body draws it. */
export function AddStepBody({ copy, step, notice, body, filing = false }) {
  return (
    <>
      <Steps copy={copy} step={step} filing={filing} />
      {notice ? (
        <div className="capture-notice is-warn" role="alert">
          <div className="capture-notice-text">
            <p className="capture-notice-title">{notice.title}</p>
            {notice.body ? <p>{notice.body}</p> : null}
            {notice.link ? (
              <p>
                <a className="btn-link" href={notice.link.href}>
                  {notice.link.label}
                </a>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      {body}
    </>
  );
}
