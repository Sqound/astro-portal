"use client";

import { useEffect, useId, useState } from "react";
import { WebConfirmDialog } from "../dialog/WebDialog.js";
import { InfoButton, InfoLine } from "../dialog/InfoButton.js";
import {
  VARIANT_TEXT_LIMITS,
  textLength,
} from "../../captures/capture-variants.js";
import { imageDescription, imageName } from "../../captures/image-names.js";
import {
  imageDescriptionText,
  imageTitleText,
} from "../../captures/image-texts.js";
import { sentenceSeparator } from "../../i18n.js";
import { captureMediaPath } from "./captures-client.js";
import { ImageTextsEditor, imageOriginText } from "./CaptureMetadata.js";
import {
  dayAndTime,
  dimensions,
  fileKind,
  fileSize,
  shortDigest,
} from "./captures-format.js";

/**
 * The zone « Variantes » of the owner's detail. It is not a history: a capture has one main image
 * and variants. The zone appears from the second image on (absent
 * with one image); for a space that keeps one image per capture it is
 * one line + ⓘ and « Voir les offres »; a private server names no
 * offer.
 *
 * One row per image, the main image first, then the newest: its thumbnail,
 * its name (its title, or « Image principale », « Variante N » by its rank
 * of arrival), its pill, its pencil (the title and the description, field by
 * field like « Tags »), its description, its date and source, its file and a
 * short SHA-256. A variant has its switch « Rendre cette variante publique »
 * and, on one line to the right (rules 4, 9, 11), « Supprimer cette
 * variante » (tertiary, red tint), « Utiliser comme image principale »
 * (tertiary) and « Télécharger l'original (TIFF, 412 Mo) » (secondary, the
 * level of « Fichier »'s). The main image has no switch (its visibility is
 * the capture's) and « Supprimer l'image principale » greyed with its
 * reason. The zone has no primary (rule 1).
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
const PencilIcon = () => (
  <Icon size={16}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="M13.5 6.5l4 4" />
  </Icon>
);
const CheckIcon = () => (
  <Icon size={12}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);
const DownloadIcon = () => (
  <Icon size={16}>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />
  </Icon>
);

/** « Télécharger l'original (TIFF, 412 Mo) » of one image. */
export function DownloadOriginal({ capture, image, copy, locale }) {
  const size = fileSize(image?.byteSize ?? capture.byteSize, locale);
  const name = image?.originalName ?? capture.originalName;
  return (
    <a
      className="btn-secondary capture-download"
      href={captureMediaPath(capture.id, {
        download: true,
        imageId: image && !image.main ? image.id : null,
      })}
      download={name}
    >
      <DownloadIcon />
      {copy.downloadOriginal(fileKind(name), size)}
    </a>
  );
}

/**
 * Whether a variant waits for its owner's look (the zone's line « Une
 * nouvelle variante est arrivée… »): the newest variant is private and was
 * never named.
 */
export function variantPending(variants) {
  const newest = variants
    .filter((image) => !image.main)
    .sort((left, right) =>
      String(right.createdAt).localeCompare(String(left.createdAt)),
    )[0];
  return Boolean(
    newest &&
    !newest.public &&
    !imageTitleText(newest) &&
    !imageDescriptionText(newest),
  );
}

/**
 * One field of the pencil (« Titre », « Description »): its label, the
 * field, an aid line with its counter, an error line past the limit, and
 * its own tertiary save button, greyed while nothing has changed — the
 * model of « Tags » (`CaptureTagsField`).
 */
function ImageTextField({
  field,
  image,
  copy,
  busy,
  help,
  onSave,
  multiline = false,
}) {
  const saved = image[field] ?? "";
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const max = VARIANT_TEXT_LIMITS[field];
  const length = textLength(draft.trim());
  const tooLong = length > max;
  const unchanged = draft.trim() === saved.trim();
  const id = `capture-image-${field}-${image.id}`;
  const helpId = `${id}-help`;
  const Field = multiline ? "textarea" : "input";
  return (
    <form
      className="capture-tags capture-image-field"
      onSubmit={(event) => {
        event.preventDefault();
        if (!unchanged && !tooLong) onSave(draft);
      }}
    >
      <label htmlFor={id} className="capture-tags-label">
        {field === "title" ? copy.titleLabel : copy.descriptionLabel}
      </label>
      <Field
        id={id}
        {...(multiline ? { rows: 3 } : { type: "text" })}
        className="capture-tags-input"
        value={draft}
        autoComplete="off"
        disabled={busy}
        aria-invalid={tooLong ? "true" : undefined}
        aria-describedby={helpId}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div id={helpId} className="capture-image-field-help">
        {tooLong ? (
          <p className="capture-tags-error" role="alert">
            {copy.textTooLong(max)}
          </p>
        ) : (
          <p className="account-muted capture-tags-help">{help}</p>
        )}
        <p
          className={`account-muted capture-image-field-count${tooLong ? " is-over" : ""}`}
        >
          {copy.textCount(length, max)}
        </p>
      </div>
      <div className="capture-tags-actions">
        <button
          type="submit"
          className="btn-tertiary"
          disabled={busy || unchanged || tooLong}
        >
          {field === "title" ? copy.saveTitle : copy.saveDescription}
        </button>
      </div>
    </form>
  );
}

/** A switch of the zone (« Rendre cette variante publique »). */
function Switch({ id, label, checked, disabled, onChange }) {
  return (
    <label className="space-calibration-switch capture-switch" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        aria-checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="space-calibration-track" aria-hidden="true">
        <span />
      </span>
    </label>
  );
}

function ImageRow({
  capture,
  image,
  copy,
  locale,
  timeZone,
  busy,
  editing,
  actions,
  meta = null,
  readOnly = false,
  textsDraft = null,
}) {
  const name = imageName(image, locale);
  const description = imageDescription(image, locale);
  const tooltipId = useId();
  const facts = [
    image.originalName,
    fileSize(image.byteSize, locale),
    dimensions(image.width, image.height, locale),
  ].filter(Boolean);
  const when = [
    dayAndTime(image.createdAt, locale, { timeZone }),
    copy.sources[image.source] ?? null,
  ].filter(Boolean);
  const checked = image.automaticCheck === "sky";
  const capturePublic = capture.visibility === "public";
  return (
    <li
      className={`capture-image-row${image.main ? " is-main" : ""}`}
      data-image-id={image.id}
    >
      <span className="capture-image-thumbnail">
        {image.thumbnail ? (
          <img
            src={captureMediaPath(capture.id, {
              thumbnail: true,
              imageId: image.id,
            })}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : null}
      </span>
      <div className="capture-image-text">
        <div className="capture-image-head">
          <p className="capture-image-name">{name}</p>
          <span
            className={`capture-pill ${image.main ? "is-main" : "is-variant"}`}
          >
            {image.main ? <CheckIcon /> : null}
            {image.main ? copy.mainPill : copy.variantPill}
          </span>
          {readOnly ? null : (
            <button
              type="button"
              className="capture-pencil"
              aria-label={copy.editNames}
              title={copy.editNames}
              aria-expanded={editing}
              disabled={busy}
              onClick={() => actions.editNames(editing ? null : image.id)}
            >
              <PencilIcon />
            </button>
          )}
          {!image.main && !editing && !readOnly ? (
            <Switch
              id={`capture-variant-public-${image.id}`}
              label={copy.makeVariantPublic}
              checked={image.public && capturePublic}
              disabled={busy || !capturePublic || (!image.public && !checked)}
              onChange={(shown) => actions.variantPublic(image, shown)}
            />
          ) : null}
        </div>
        {description && !editing ? (
          <p className="capture-image-description">{description}</p>
        ) : null}
        {meta && !editing && imageOriginText(meta, image, locale) ? (
          <p className="account-muted capture-image-origin">
            {imageOriginText(meta, image, locale)}
          </p>
        ) : null}
        <p className="capture-image-meta">{when.join(" · ")}</p>
        <p className="capture-image-file">{facts.join(" · ")}</p>
        <p className="capture-image-digest">
          {copy.digest(shortDigest(image.sha256))}
        </p>
        {editing && meta ? (
          <ImageTextsEditor
            meta={meta}
            image={image}
            busy={busy}
            initial={textsDraft}
            fallback={imageName({ ...image, title: null }, locale)}
            descriptionFallback={
              imageDescription({ ...image, description: null }, locale) ??
              undefined
            }
            onCancel={() => actions.editNames(null)}
            onSave={(texts) => actions.saveImageTexts(image, texts)}
          />
        ) : null}
        {editing && !meta ? (
          <div className="capture-image-names">
            <ImageTextField
              field="title"
              image={image}
              copy={copy}
              busy={busy}
              help={copy.titleHelp(
                imageName({ ...image, title: null }, locale),
              )}
              onSave={(value) => actions.saveImageText(image, "title", value)}
            />
            <ImageTextField
              field="description"
              image={image}
              copy={copy}
              busy={busy}
              multiline
              help={
                image.main ? copy.mainDescriptionHelp : copy.descriptionHelp
              }
              onSave={(value) =>
                actions.saveImageText(image, "description", value)
              }
            />
            <div className="capture-actions">
              <button
                type="button"
                className="btn-link"
                onClick={() => actions.editNames(null)}
              >
                {copy.close}
              </button>
            </div>
          </div>
        ) : null}
        {!image.main && !checked && copy.checkNotPassed ? (
          <p className="account-muted capture-image-check">
            {copy.checkNotPassed}
          </p>
        ) : null}
        {readOnly ? (
          <p className="capture-image-states">
            {image.main
              ? meta?.mainText
              : image.public && capturePublic
                ? meta?.publicText
                : meta?.privateText}
          </p>
        ) : null}
        {editing && meta ? null : (
          <div className="capture-actions capture-image-actions">
            {readOnly ? (
              image.main ? null : (
                <DownloadOriginal
                  capture={capture}
                  image={image}
                  copy={copy}
                  locale={locale}
                />
              )
            ) : image.main ? (
              <span className="capture-tooltip-anchor">
                <button
                  type="button"
                  className="btn-tertiary is-destructive"
                  aria-disabled="true"
                  aria-describedby={tooltipId}
                  data-greyed=""
                  onClick={(event) => event.preventDefault()}
                >
                  {copy.deleteMain}
                </button>
                <span role="tooltip" id={tooltipId} className="capture-tooltip">
                  {copy.deleteMainRefused}
                </span>
              </span>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-tertiary is-destructive"
                  disabled={busy}
                  onClick={() => actions.askDeleteVariant(image)}
                >
                  {copy.deleteVariant}
                </button>
                <button
                  type="button"
                  className="btn-tertiary"
                  disabled={busy || !checked}
                  onClick={() => actions.askMainImage(image)}
                >
                  {copy.useAsMain}
                </button>
                <DownloadOriginal
                  capture={capture}
                  image={image}
                  copy={copy}
                  locale={locale}
                />
              </>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * The zone, or `null` (one image). `line` is the line after a choice of the
 * main image, kept until the next gesture. Every profile keeps the variants
 * of a capture (the free account since 2026-10-29): no offer line here.
 */
export function CaptureVariants({
  capture,
  copy,
  locale,
  timeZone,
  busy = false,
  editing = null,
  line = null,
  actions,
  // The metadata's words, the read-only window, the draft of a capture's
  // texts.
  meta = null,
  readOnly = false,
  textsDraft = null,
}) {
  const variants = capture.variants ?? [];
  if (variants.length < 2) return null;
  const head =
    line ??
    (variantPending(variants)
      ? copy.variantsPending
      : copy.variantsCount(variants.length));
  return (
    <section
      className="capture-zone capture-variants"
      aria-label={copy.variantsZone}
    >
      <h3 className="capture-zone-title">{copy.variantsZone}</h3>
      <div className="info-line capture-zone-line" role="status">
        <p className="info-line-text">{head}</p>
        <InfoButton
          locale={locale}
          label={copy.variantsInfoLabel}
          title={copy.variantsInfoLabel}
          body={copy.variantsInfo}
        />
      </div>
      <ul className="capture-image-rows">
        {variants.map((image) => (
          <ImageRow
            key={image.id}
            capture={capture}
            image={image}
            copy={copy}
            locale={locale}
            timeZone={timeZone}
            busy={busy}
            editing={!readOnly && editing === image.id}
            actions={actions}
            meta={meta}
            readOnly={readOnly}
            textsDraft={editing === image.id ? textsDraft : null}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * « Utiliser comme image principale ? » (states 3 and 4): the plain primary
 * of its dialog (rule 4), « Annuler » a link; when the chosen variant's
 * visibility differs from the main image's (a private variant of a public
 * capture), one line + ⓘ says it will be public (state 3); none otherwise
 * (state 4; a private capture: never).
 */
export function MainImageDialogBody({ capture, image, copy, locale, target }) {
  const main = (capture.variants ?? []).find((entry) => entry.main);
  const differs = capture.visibility === "public" && !image.public;
  return (
    <div className="capture-dialog-body">
      <p>
        {copy.useAsMainBody(
          imageName(image, locale),
          image.originalName,
          fileSize(image.byteSize, locale),
          target,
        )}
      </p>
      {differs ? (
        <InfoLine
          locale={locale}
          className="capture-visibility-message"
          text={copy.becomesPublic}
          label={copy.messageInfoLabel}
          title={copy.messageInfoLabel}
          body={copy.becomesPublicInfo(
            main ? imageName(main, locale) : "",
            main?.originalName ?? "",
          )}
        />
      ) : null}
    </div>
  );
}

export function MainImageDialog({
  capture,
  image,
  copy,
  locale,
  target,
  busy,
  onCancel,
  onConfirm,
}) {
  return (
    <WebConfirmDialog
      title={copy.useAsMainTitle}
      cancelLabel={copy.cancel}
      closeLabel={copy.close}
      confirmLabel={copy.useAsMain}
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
      tone="plain"
      className="capture-main-dialog"
    >
      <MainImageDialogBody
        capture={capture}
        image={image}
        copy={copy}
        locale={locale}
        target={target}
      />
    </WebConfirmDialog>
  );
}

/**
 * The zone's line after the choice (state 5): what happened to the two
 * images. The former main image keeps its visibility, the capture's.
 */
export function mainChosenLine({ capture, chosen, former, copy }) {
  const capturePublic = capture.visibility === "public";
  if (capturePublic && !chosen.public)
    return copy.mainChosenPublic(chosen.originalName, former.originalName);
  return copy.mainChosen(
    chosen.originalName,
    former.originalName,
    capturePublic,
  );
}

/** « Supprimer cette variante ? » (state 6): the primary in the red tint. */
export function DeleteVariantDialogBody({
  capture,
  image,
  copy,
  locale,
  timeZone,
}) {
  const size = fileSize(image.byteSize, locale);
  const shownPublicly = image.public && capture.visibility === "public";
  return (
    <div className="capture-dialog-body">
      <p>
        {copy.deleteVariantBody(
          imageName(image, locale),
          image.originalName,
          copy.sources[image.source] ?? null,
          dayAndTime(image.createdAt, locale, { timeZone }),
          size,
        )}
        {shownPublicly
          ? `${sentenceSeparator(locale)}${copy.deleteVariantPublic}`
          : ""}
      </p>
      <p>{copy.deleteVariantKeeps(size)}</p>
    </div>
  );
}

export function DeleteVariantDialog({
  capture,
  image,
  copy,
  locale,
  timeZone,
  busy,
  onCancel,
  onConfirm,
}) {
  return (
    <WebConfirmDialog
      title={copy.deleteVariantTitle}
      cancelLabel={copy.cancel}
      closeLabel={copy.close}
      confirmLabel={copy.deleteVariant}
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
      tone="danger"
    >
      <DeleteVariantDialogBody
        capture={capture}
        image={image}
        copy={copy}
        locale={locale}
        timeZone={timeZone}
      />
    </WebConfirmDialog>
  );
}
