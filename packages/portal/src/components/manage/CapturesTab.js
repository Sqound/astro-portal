"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WebConfirmDialog } from "portal/components/dialog/WebDialog.js";
import { InfoButton } from "portal/components/dialog/InfoButton.js";
import { LoadingState } from "portal/components/LoadingState.js";
import { message } from "portal/i18n.js";
import { capturesCopyFor } from "./captures-copy.js";
import { checkReasonWords } from "./check-reason-words.js";
import { metadataCopyFor } from "./capture-metadata-copy.js";
import { describeConflict } from "./capture-conflict.js";
import {
  CaptureQualityZone,
  CaptureReplacedLine,
  CaptureSessionLine,
} from "./CaptureSessionQuality.js";
import {
  CaptureIntermediate,
  CaptureMetadataZones,
  ConflictActions,
  ConflictCompare,
  CaptureTitleField,
  DescriptionZone,
  ReadOnlyNotice,
} from "./CaptureMetadata.js";
import { loadEquipment } from "./equipment-client.js";
import { InfoLine } from "portal/components/dialog/InfoButton.js";
import {
  CHANGE_SIGNAL_EVENT,
  startChangeSubscription,
} from "portal/planner/change-subscription.js";
import { durationText } from "portal/written-forms.js";
import { PersonalSkyMap } from "../gallery/PersonalSkyMap.js";
import { journalStatisticsHref } from "../sessions/journal-list-view.js";
import { localizedTag, storedTag } from "../gallery/gallery-tags.js";
import { CaptureAddDialog } from "./CaptureAddDialog.js";
import { CaptureProgression } from "./CaptureProgression.js";
import { useTargetsPicker } from "./TargetsPickerContext.js";
import {
  CaptureVariants,
  DeleteVariantDialog,
  DownloadOriginal,
  MainImageDialog,
  mainChosenLine,
} from "./CaptureVariants.js";
import {
  captureChips,
  captureCounts,
  cardTarget,
  filteredCaptures,
  integrationSignature,
  storageLine,
} from "./captures-list.js";
import { formatNightMonths } from "../../captures/public-capture-format.js";
import {
  dayMonth,
  dimensions,
  fileSize,
  longDay,
  nightDay,
  nightMonth,
  shortDay,
} from "./captures-format.js";
import {
  captureMediaPath,
  changeCapture,
  changeImage,
  checkUpload,
  deleteCapture,
  fileDigest,
  loadCapture,
  loadCaptures,
  readSkySolve,
  startSkySolve,
  syncCaptureAcquisition,
  uploadCapture,
} from "./captures-client.js";
import { astroSyncDownloadUrl } from "../../captures/astro-sync-link.js";
import { managePath } from "./manage-copy.js";
import { getManageSlot } from "../../manage/extensions.js";
import {
  captureTagsProblem,
  captureTagsText,
  cleanCaptureTags,
  parseCaptureTags,
  storedCaptureTags,
} from "../../captures/capture-tags.js";

/**
 * The tab « Captures » of « Mon espace » (`GestionCaptureStates`, `GestionCapturesWide`, `GestionPublishConfirm`):
 * the space's own captures, newest first, each with its thumbnail, its target, its night, its file, the switch
 * « Privée / Publique » and the state of its two checks; « Ajouter une capture »; one capture opened (`captureId`),
 * with its detail, its own tags and « Supprimer la capture ». At 1280 px the list is a table whose cells carry the
 * state only; the long messages open with the capture.
 *
 * What « Publique » may do is the service's rule (`state.publishAllowed`,
 * checked again by `PATCH /api/v1/manage/captures/{id}`): the switch greys
 * « Publique » where the rule refuses it, and a capture whose check is
 * undetermined says why when « Publique » is touched.
 *
 * « Règles de publication » is linked from the publish dialog (the block, and a
 * name refused).
 */

/**
 * The page where a team writes the rules of the publication, under a language
 * (`publishingRulesPath` of the words a composition registers,
 * `hosted-copy.js`); `null` on a server with no team.
 */
export const publishingRulesHref = (locale, copy = capturesCopyFor(locale)) =>
  copy.publishingRulesPath
    ? `/${encodeURIComponent(locale || "en")}${copy.publishingRulesPath}`
    : null;

const WIDE_QUERY = "(min-width: 1024px)";

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const query = window.matchMedia(WIDE_QUERY);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return wide;
}

// ——— Icons ———

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
const CheckIcon = (props) => (
  <Icon {...props}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);
const ClockIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);
const QuestionIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4" />
    <path d="M12 16.8h.01" />
  </Icon>
);
const CrossCircleIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </Icon>
);
const WarningIcon = (props) => (
  <Icon {...props}>
    <path d="M12 4l9 15.5H3z" />
    <path d="M12 10v4M12 17h.01" />
  </Icon>
);
const UploadIcon = (props) => (
  <Icon {...props}>
    <path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19h14" />
  </Icon>
);
const ChevronIcon = (props) => (
  <Icon {...props}>
    <path d="M9.5 6l6 6-6 6" />
  </Icon>
);
const BackIcon = (props) => (
  <Icon {...props}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);
const TrashIcon = (props) => (
  <Icon {...props}>
    <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5" />
  </Icon>
);
const ExternalIcon = (props) => (
  <Icon {...props}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Icon>
);
const EyeOffIcon = (props) => (
  <Icon {...props}>
    <path d="M3 3l18 18" />
    <path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 8.5 4.6 9 6-.3.8-1.2 2.3-2.7 3.6M6.5 7.6C4.7 8.8 3.4 10.6 3 12c.5 1.4 4 6 9 6 1.4 0 2.6-.3 3.7-.8" />
    <path d="M9.9 10a3 3 0 0 0 4.1 4.2" />
  </Icon>
);
const ImageIcon = (props) => (
  <Icon {...props}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M20.5 16l-5-5L6 19" />
  </Icon>
);

// ——— What a capture says ———

/**
 * « M31 — Galaxie d’Andromède »: a designation and a name, the name left alone
 * when it already starts with the designation (the catalogue's title of a
 * target is « NGC 6960 — Dentelles du Cygne occidentales »: a page once
 * read « NGC 6960 — NGC 6960 — … »).
 */
export function targetHeadline(target) {
  const { designation, name } = target;
  const shown = typeof name === "string" ? name.trim() : "";
  if (!shown || shown === designation) return designation;
  if (
    designation &&
    shown.toLowerCase().startsWith(String(designation).toLowerCase())
  )
    return shown;
  return `${designation} — ${shown}`;
}

/** « M31 — Galaxie d’Andromède », or « Sans cible ». */
export function captureTitle(capture, copy) {
  const [first, ...others] = capture.detail?.targets ?? [];
  if (!first) return copy.noTarget;
  return [
    targetHeadline(first),
    ...others.map((target) => target.designation),
  ].join(" · ");
}

/** « Nuit du 3 oct. 2026 » or « Ajoutée le 1er oct. 2026 ». */
export function captureWhen(capture, copy, locale, { timeZone } = {}) {
  if (capture.detail?.night)
    return copy.night(nightDay(capture.detail.night, locale));
  return copy.added(shortDay(capture.createdAt, locale, { timeZone }));
}

/**
 * « Publique depuis le 3 oct. 2026 » for a public capture, written with the
 * day format of « Ajoutée le … »; « Publique, date inconnue » when the
 * capture was public before its date was kept (never a guessed date);
 * `null` for a capture that is not public.
 */
export function publicSinceLine(capture, copy, locale, { timeZone } = {}) {
  if (capture.visibility !== "public") return null;
  const day = capture.madePublicAt
    ? shortDay(capture.madePublicAt, locale, { timeZone })
    : "";
  return day ? copy.publicSince(day) : copy.publicSinceUnknown;
}

const AUTO_ICONS = {
  sky: [CheckIcon, "is-good"],
  person: [QuestionIcon, "is-warn"],
  undetermined: [QuestionIcon, "is-warn"],
  other: [CrossCircleIcon, "is-bad"],
};
const TEAM_ICONS = {
  pending: [ClockIcon, "is-warn"],
  approved: [CheckIcon, "is-good"],
  refused: [CrossCircleIcon, "is-bad"],
};

function StateLine({ icon: [Glyph, tone], children }) {
  return (
    <li className={`capture-state-line ${tone}`}>
      <Glyph className="capture-state-icon" />
      <span>{children}</span>
    </li>
  );
}

const reasonOf = (capture, copy) =>
  copy.reasons?.[capture.checks?.teamReason] ?? copy.reasons?.other ?? "";

/** The two lines of the checks: automatic, then the team's (when shown). */
/**
 * Why the automatic check could not decide: the service's own reason for a
 * file it could not recognise, in the words the team of the service gives the
 * owner (`check-reason-words.js`: none without a team). Nothing for a result it
 * gave no reason for.
 */
export function autoReasonWords(capture, locale, { moderated = true } = {}) {
  const reason = capture.checks?.automaticReason;
  if (!moderated || !reason || capture.checks?.automatic !== "undetermined")
    return null;
  return checkReasonWords(locale, reason);
}

export function CaptureStateLines({
  capture,
  copy,
  short = false,
  locale = "en",
  moderated = true,
}) {
  // A person is stored as undetermined with its reason: its line says so.
  const automatic =
    capture.checks?.automatic === "undetermined" &&
    capture.checks?.automaticReason === "person_detected"
      ? "person"
      : capture.checks?.automatic;
  const team = capture.state?.teamLine;
  const autoWords = short ? copy.autoShort : copy.auto;
  const teamWords = short ? copy.teamShort : copy.team;
  const why = short ? null : autoReasonWords(capture, locale, { moderated });
  // Without a team nothing is checked, so nothing is said of a check.
  return (
    <ul className="capture-state-lines">
      {automatic && moderated && autoWords ? (
        <StateLine icon={AUTO_ICONS[automatic]}>
          {autoWords[automatic]}
          {why ? <span className="capture-state-why">{why}</span> : null}
        </StateLine>
      ) : null}
      {team && teamWords ? (
        <StateLine icon={TEAM_ICONS[team]}>
          {team === "refused"
            ? teamWords.refused(reasonOf(capture, copy))
            : teamWords[team]}
        </StateLine>
      ) : null}
    </ul>
  );
}

function Notice({ tone = "warn", title, children = null, role = "status" }) {
  return (
    <div className={`capture-notice is-${tone}`} role={role}>
      <WarningIcon className="capture-notice-icon" />
      <div className="capture-notice-text">
        <p className="capture-notice-title">{title}</p>
        {children}
      </div>
    </div>
  );
}

/**
 * The messages of a capture's state, with their buttons. `touched`:
 * « Publique » was touched while the rule refuses it; `retired`: the capture
 * went back to « Privée » a moment ago.
 */
export function CaptureStateNotices({
  capture,
  copy,
  locale,
  warningsCount = 0,
  touched = false,
  retired = false,
  busy = false,
  moderated = true,
  rulesHref = moderated ? publishingRulesHref(locale, copy) : null,
  timeZone,
  now,
  onRequestReview,
  onAcceptVerification,
  onDelete,
}) {
  // The team's notices are the words of a composition with a team: without
  // them (a server with no team) a state of the team has nothing to say.
  const { state } = copy.team ? (capture.state ?? {}) : {};
  const day = (value) => longDay(value, locale, { timeZone, now });
  const items = [];
  // A file a gallery cannot show (a FITS, an XISF, a camera's raw file),
  // « Publique » touched: drawn after the undetermined notice.
  if (touched && notShowable(capture))
    items.push(<Notice key="not-showable" title={copy.notShowable} />);
  if (moderated && state === "undetermined" && touched)
    items.push(
      <div key="review" className="capture-notice-group">
        <Notice title={copy.needsReviewTitle}>
          {autoReasonWords(capture, locale, { moderated }) ? (
            <p>{autoReasonWords(capture, locale, { moderated })}</p>
          ) : null}
          <p>{copy.needsReviewBody}</p>
        </Notice>
        <div className="capture-actions">
          <button
            type="button"
            className="btn-tertiary"
            disabled={busy}
            onClick={onRequestReview}
          >
            {copy.requestReview}
          </button>
        </div>
      </div>,
    );
  if (state === "review_requested")
    items.push(
      <p key="requested" className="capture-state-text">
        {copy.reviewRequested}
      </p>,
    );
  if (state === "protection_notice")
    items.push(
      <div key="notice" className="capture-notice-group">
        <Notice tone="bad" title={copy.noticeTitle}>
          <p>{copy.noticeBody(day(capture.state.protectionLiftsAt))}</p>
        </Notice>
        <div className="capture-actions is-stacked">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={onAcceptVerification}
          >
            {copy.acceptVerification}
          </button>
          <button
            type="button"
            className="btn-tertiary is-destructive"
            disabled={busy}
            onClick={onDelete}
          >
            {copy.deleteCapture}
          </button>
        </div>
      </div>,
    );
  if (state === "protection_lifted")
    items.push(
      <p key="accepted" className="capture-state-text">
        {capture.protectionLapsed
          ? // The delay passed without an answer.
            copy.protectionLapsed(day(capture.state.protectionLiftsAt))
          : copy.verificationAccepted}
      </p>,
    );
  if (state === "refused")
    items.push(
      <Notice key="refused" tone="bad" title={copy.refusedTitle}>
        {warningsCount > 0 && warningsCount < 4 ? (
          <p>{copy.warning(warningsCount)}</p>
        ) : null}
      </Notice>,
    );
  if (state === "removed")
    items.push(
      <Notice key="removed" title={copy.removedTitle}>
        <p>{copy.removedBody}</p>
      </Notice>,
    );
  if (state === "publishing_blocked")
    items.push(
      <div key="blocked" className="capture-blocked">
        <p className="capture-blocked-text">
          {copy.blocked(day(capture.state.publishingBlockedUntil))}
        </p>
        {rulesHref ? (
          <a className="btn-link" href={rulesHref}>
            {copy.publishingRules}
            <ChevronIcon size={16} />
          </a>
        ) : null}
      </div>,
    );
  if (retired)
    items.push(
      <ul key="retired" className="capture-state-lines is-fading">
        <StateLine icon={[CheckIcon, "is-good"]}>{copy.retired}</StateLine>
      </ul>,
    );
  return items.length ? (
    <div className="capture-state-notices">{items}</div>
  ) : null;
}

/**
 * Whether « Publique » is refused only because the file cannot be shown in
 * a gallery (`not_showable` on the server).
 */
export const notShowable = (capture) =>
  capture.visibility !== "public" &&
  capture.showable === false &&
  Boolean(capture.state?.publishAllowed);

/**
 * « Privée / Publique » (aria « Visibilité »): a segmented choice, the
 * chosen one in the secondary look. « Publique » is greyed where the rule
 * refuses it; an undetermined capture still answers the touch, and so does a
 * file a gallery cannot show.
 */
export function VisibilitySwitch({
  capture,
  copy,
  publishAvailable = true,
  busy = false,
  onPrivate,
  onPublic,
  onRefusedTouch,
}) {
  const isPublic = capture.visibility === "public";
  const allowed =
    publishAvailable &&
    (isPublic || (capture.state?.publishAllowed && !notShowable(capture)));
  const answersTouch =
    !allowed &&
    publishAvailable &&
    (capture.state?.state === "undetermined" || notShowable(capture));
  return (
    <div
      className="capture-visibility"
      role="group"
      aria-label={copy.visibility}
    >
      <button
        type="button"
        className={isPublic ? "" : "is-active"}
        aria-pressed={!isPublic}
        disabled={busy}
        onClick={() => (isPublic ? onPrivate() : undefined)}
      >
        {copy.private}
      </button>
      <button
        type="button"
        className={isPublic ? "is-active" : ""}
        aria-pressed={isPublic}
        aria-disabled={allowed ? undefined : "true"}
        disabled={busy || (!allowed && !answersTouch)}
        data-greyed={allowed ? undefined : ""}
        onClick={() => {
          if (isPublic) return;
          if (allowed) onPublic();
          else if (answersTouch) onRefusedTouch();
        }}
      >
        {copy.public}
      </button>
    </div>
  );
}

function Thumbnail({ capture, copy, href, size = "row" }) {
  return (
    <a
      className={`capture-thumbnail is-${size}`}
      href={href}
      aria-label={copy.open}
    >
      {capture.thumbnail || capture.preview ? (
        <img
          src={captureMediaPath(capture.id, {
            thumbnail: Boolean(capture.thumbnail),
          })}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="capture-placeholder">
          <ImageIcon size={size === "large" ? 40 : 22} />
        </span>
      )}
    </a>
  );
}

// ——— The list (`CapturesWebStorage`) ———

const DraftIcon = (props) => (
  <Icon {...props}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </Icon>
);
const LockIcon = (props) => (
  <Icon {...props}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
);
const PlusIcon = (props) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
const SearchIcon = (props) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </Icon>
);
const ArchiveIcon = (props) => (
  <Icon {...props}>
    <rect x="3.5" y="4.5" width="17" height="4" rx="1" />
    <path d="M5.5 8.5v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-10M10 12.5h4" />
  </Icon>
);
const SortIcon = (props) => (
  <Icon {...props}>
    <path d="M8 5v14M5 16l3 3 3-3M16 19V5M13 8l3-3 3 3" />
  </Icon>
);

/**
 * The two pills of a capture: its stage (« Brouillon » with a pencil,
 * « Finalisée » with a check) and its visibility (« Privée » with a lock,
 * « Publique » with the team's glyph: a clock while it waits, a check once
 * verified, a cross when refused). In red mode they keep glyph and word.
 */
export function CapturePills({ capture, copy }) {
  const draft = capture.stage === "draft";
  const isPublic = capture.visibility === "public";
  const team = capture.state?.teamLine;
  // A public capture with no line of the team is a server's with no team:
  // nobody is to look at it, so no clock waits.
  const [PublicGlyph, publicTone] =
    team === "approved"
      ? [CheckIcon, "is-good"]
      : team === "refused"
        ? [CrossCircleIcon, "is-bad"]
        : team == null
          ? [CheckIcon, ""]
          : [ClockIcon, "is-warn"];
  return (
    <span className="capture-pills">
      <span className={`capture-pill ${draft ? "is-draft" : "is-finalized"}`}>
        {draft ? <DraftIcon size={12} /> : <CheckIcon size={12} />}
        {draft ? copy.stageDraft : copy.stageFinalized}
      </span>
      <span
        className={`capture-pill ${isPublic ? `is-public ${publicTone}` : "is-private"}`}
      >
        {isPublic ? <PublicGlyph size={12} /> : <LockIcon size={12} />}
        {isPublic ? copy.public : copy.private}
      </span>
      {/* Archived: still read and exported here, in no gallery. */}
      {capture.archivedAt ? (
        <span
          className="capture-pill is-archived"
          title={copy.archivedHint}
          data-capture-archived=""
        >
          <ArchiveIcon size={12} />
          {copy.archived}
        </span>
      ) : null}
    </span>
  );
}

function teamText(capture, copy) {
  const team = capture.state?.teamLine;
  if (!team || !copy.teamShort) return null;
  return team === "refused"
    ? copy.teamShort.refused(reasonOf(capture, copy))
    : copy.teamShort[team];
}

/** « Nuit du 5 oct. · Intégration 2 h 20 », or the day it was added. */
export function cardWhen(capture, copy, locale) {
  const night = capture.detail?.night;
  if (!night) return copy.added(shortDay(capture.createdAt, locale));
  return [
    copy.night(dayMonth(night, locale)),
    capture.integrationMinutes
      ? copy.integration(durationText(capture.integrationMinutes, locale))
      : copy.integrationUnknown,
  ].join(" · ");
}

/**
 * One card (three columns at 1280 px): the thumbnail of the main image,
 * « type · instrument », the target's name, its aliases (or « Cible
 * personnelle »), the night and the integration, the two pills, the size of
 * the main image on the right, the team's line under them. No button and no
 * download on a card.
 */
export function CaptureCard({ capture, copy, locale }) {
  const href = managePath(locale, "captures", capture.id);
  const { title, aliases } = cardTarget(capture, {
    personal: copy.personal,
    noTarget: copy.noTarget,
  });
  const kicker = [
    capture.galleryLabel ? localizedTag(capture.galleryLabel, locale) : null,
    capture.telescope,
  ]
    .filter(Boolean)
    .join(" · ");
  const team = teamText(capture, copy);
  const tone = capture.state?.teamLine;
  return (
    <li className="capture-card" data-capture-id={capture.id}>
      <a className="capture-card-link" href={href}>
        <span className="capture-card-image">
          {capture.thumbnail || capture.preview ? (
            <img
              src={captureMediaPath(capture.id, {
                thumbnail: Boolean(capture.thumbnail),
              })}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="capture-placeholder">
              <ImageIcon size={30} />
            </span>
          )}
        </span>
        <span className="capture-card-body">
          {kicker ? (
            <span className="capture-card-kicker">{kicker}</span>
          ) : null}
          <strong className="capture-title">{title}</strong>
          {aliases ? (
            <span className="capture-card-aliases">{aliases}</span>
          ) : null}
          <span className="capture-when">
            {cardWhen(capture, copy, locale)}
          </span>
          <span className="capture-card-foot">
            <CapturePills capture={capture} copy={copy} />
            <span className="capture-card-size">
              {capture.hasImage === false
                ? copy.noImageShort
                : fileSize(capture.byteSize, locale)}
            </span>
          </span>
          {team ? (
            <span
              className={`capture-card-team ${
                tone === "refused"
                  ? "is-bad"
                  : tone === "pending"
                    ? "is-warn"
                    : "is-muted"
              }`}
            >
              {team}
            </span>
          ) : null}
        </span>
      </a>
    </li>
  );
}

/**
 * The space line under the counter: one line + ⓘ and a 4 px bar — amber with
 * « Il reste 1,8 Go » under 10 % left, red at the quota, followed by the
 * notice (« Voir les offres », a tertiary). The free account keeps « 3
 * captures sur 3 »; a space without a quota says the bytes used, « Inclus »
 * where offers are shown (the administrator's exempted space).
 */
/**
 * The day the read-only window ends, written for the screen (« 11 janvier
 * 2027 »), or `""` when the service does not date it.
 */
export function readOnlyUntilText(value, locale, { timeZone, now } = {}) {
  return value ? longDay(value, locale, { timeZone, now }) : "";
}

export function StorageLine({
  storage,
  copy,
  locale,
  offersHref = null,
  readOnly = false,
  readOnlyUntil = "",
}) {
  const line = storageLine(storage);
  if (!line) return null;
  // In the read-only window the space is not free yet: it
  // says « Lecture seule jusqu'au … », and the free space's count comes
  // back when the window ends.
  // The count of the free space and its read-only window are the words of a
  // service that has them (`hosted-copy.js`): a server with none says nothing.
  if (line.kind === "count" && !copy.freeQuota) return null;
  if (readOnly && line.kind === "count")
    return readOnlyUntil && copy.readOnlyUntil ? (
      <div className="captures-usage is-read-only" data-storage="read-only">
        <p>{copy.readOnlyUntil(readOnlyUntil)}</p>
      </div>
    ) : null;
  if (line.kind === "count") {
    // The counter stays alone; the count is a thin one-line notice under it
    // that says it is the free space's limit, the link to the offers at its
    // right; the bytes, the free space's second bound, follow as the storage
    // line of any space with a quota. A block a composition draws under the
    // lines (`captures.storage`) carries the way to the offers itself: the
    // notice then leaves its own link out.
    const slot = getManageSlot("captures.storage");
    const context = { locale, offersHref, storage };
    const Block = slot?.shows(context) ? slot.Component : null;
    const notice = (
      <div
        className={`captures-usage${line.count >= line.limit ? " is-full" : ""}`}
        data-storage="count"
      >
        <p>{copy.freeQuota(line.count, line.limit)}</p>
        {offersHref && !Block ? (
          <a className="btn-link" href={offersHref}>
            {copy.seeOffers}
            <ChevronIcon size={16} />
          </a>
        ) : null}
      </div>
    );
    if (!line.bytes && !Block) return notice;
    return (
      <>
        {notice}
        {line.bytes ? (
          <StorageBytes
            line={{ ...line, kind: line.bytes }}
            copy={copy}
            locale={locale}
            offersHref={offersHref}
          />
        ) : null}
        {Block ? <Block {...context} /> : null}
      </>
    );
  }
  const used = fileSize(line.used, locale) || fileSize(1, locale);
  const info = (
    <InfoButton
      locale={locale}
      label={copy.storageInfoLabel}
      title={copy.storageInfoLabel}
    >
      <p className="info-dialog-text">
        {copy.storageInfo}{" "}
        {offersHref ? <a href={offersHref}>{copy.seeOffers}</a> : null}
      </p>
    </InfoButton>
  );
  if (line.kind === "unlimited" || line.kind === "included")
    return (
      <div className="captures-storage" data-storage={line.kind}>
        <div className="info-line">
          <p className="info-line-text">
            {line.kind === "included"
              ? `${copy.storageUsedAlone(used)} · ${copy.storageIncluded}`
              : copy.storageUsedAlone(used)}
          </p>
          {info}
        </div>
      </div>
    );
  return (
    <StorageBytes
      line={line}
      copy={copy}
      locale={locale}
      offersHref={offersHref}
    />
  );
}

/**
 * The bytes of a space with a quota (`normal` · `low` · `full`): the line
 * with its ⓘ and its bar, and the notice of a full space.
 */
function StorageBytes({ line, copy, locale, offersHref }) {
  const used = fileSize(line.used, locale) || fileSize(1, locale);
  const info = (
    <InfoButton
      locale={locale}
      label={copy.storageInfoLabel}
      title={copy.storageInfoLabel}
    >
      <p className="info-dialog-text">
        {copy.storageInfo}{" "}
        {offersHref ? <a href={offersHref}>{copy.seeOffers}</a> : null}
      </p>
    </InfoButton>
  );
  const text = copy.storageUsed(used, fileSize(line.quota, locale));
  return (
    <>
      <div
        className={`captures-storage is-${line.kind}`}
        data-storage={line.kind}
      >
        <div className="info-line">
          <p className="info-line-text">
            {line.kind === "low"
              ? `${text} · ${copy.storageLeft(fileSize(line.left, locale))}`
              : text}
          </p>
          {info}
        </div>
        <span className="captures-storage-bar" aria-hidden="true">
          <span
            style={{ width: `${Math.max(1, Math.round(line.share * 100))}%` }}
          />
        </span>
      </div>
      {line.kind === "full" ? (
        <div className="capture-notice-group captures-full">
          <div className="capture-notice is-bad" role="status">
            <WarningIcon className="capture-notice-icon" />
            <div className="capture-notice-text info-line">
              <p className="capture-notice-title info-line-text">
                {copy.storageFull}
              </p>
              <InfoButton
                locale={locale}
                label={copy.storageInfoLabel}
                title={copy.storageInfoLabel}
                body={copy.limitBody}
              />
            </div>
          </div>
          {offersHref ? (
            <div className="capture-actions">
              <a className="btn-tertiary" href={offersHref}>
                {copy.seeOffers}
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/**
 * The search takes the whole line; under it one band holds the chips («
 * Toutes », the labels and tags) and, at its end, the order, a tertiary of 36
 * px.
 */
function CaptureFilters({ captures, copy, locale, filter, actions }) {
  const chips = captureChips(captures, locale);
  return (
    <div className="captures-tools">
      <label className="captures-search">
        <SearchIcon size={16} />
        <input
          type="search"
          value={filter.query}
          placeholder={copy.searchTarget}
          aria-label={copy.searchTarget}
          onChange={(event) => actions.setFilter({ query: event.target.value })}
        />
      </label>
      <div className="captures-band">
        <div className="filters private-gallery-filters captures-filters">
          {[{ key: "all", label: "" }, ...chips].map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={`filter-tag${chip.label === filter.chip ? " is-active" : ""}`}
              aria-pressed={chip.label === filter.chip}
              onClick={() => actions.setFilter({ chip: chip.label })}
            >
              {chip.label || copy.allChip}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn-tertiary captures-sort"
          aria-label={copy.reverseSort}
          title={copy.reverseSort}
          onClick={() =>
            actions.setFilter({ oldestFirst: !filter.oldestFirst })
          }
        >
          <SortIcon size={16} />
          <span className="captures-sort-label">
            {filter.oldestFirst ? copy.oldestFirst : copy.newestFirst}
          </span>
        </button>
      </div>
    </div>
  );
}

/** A capture as `PersonalSkyMap` reads a target (the public gallery's map). */
function mapTargetOf(capture, copy, locale) {
  const target = capture.targets?.[0];
  const ra = Number(target?.raHours) * 15;
  const dec = Number(target?.decDegrees);
  const { title } = cardTarget(capture, {
    personal: copy.personal,
    noTarget: copy.noTarget,
  });
  const source = target?.designation || target?.name || title;
  const image = capture.thumbnail
    ? captureMediaPath(capture.id, { thumbnail: true })
    : null;
  return {
    id: capture.id,
    title,
    objects: source ? [source] : [],
    stellarium: source ? { source } : undefined,
    coordinate:
      Number.isFinite(ra) && Number.isFinite(dec) ? { ra, dec } : null,
    href: managePath(locale, "captures", capture.id),
    imageUrl: image,
    previewUrl: image,
    telescope: cardWhen(capture, copy, locale),
  };
}

// ——— One capture opened ———

/**
 * « Tags » of the opened capture: the owner's own words, separated by
 * commas, shown in the private gallery only. Written as typed — only the
 * spaces around a tag are trimmed and a repetition kept once; never another
 * change. « Enregistrer les tags », a tertiary, sends the whole list
 * (`PATCH /api/v1/manage/captures/{id}` `{ tags }`); it waits while the
 * field says what was saved, and while a tag is over 40 characters or the
 * capture over 20 tags.
 */
export function CaptureTagsField({
  capture,
  copy,
  locale = "en",
  busy,
  onSave,
  readOnly = false,
  conflict = null,
  meta = null,
  onKeepCurrent = () => {},
}) {
  // A generic tag (« Nébuleuse », the capture's default) reads in the
  // page's language and is stored as its French word; an own tag is
  // written as typed.
  const saved = captureTagsText(
    (capture.tags ?? []).map((tag) => localizedTag(tag, locale)),
  );
  const typedTags = (text) =>
    cleanCaptureTags(
      parseCaptureTags(text).map((tag) => storedTag(tag, locale)),
    );
  const [draft, setDraft] = useState(saved);
  // What the person typed is not thrown away when the capture is read again
  // (the change signal, a conflict): the field follows the stored tags only
  // while it holds nothing of its own — what it held when it was last in
  // step, or what has just been saved.
  const lastSaved = useRef(saved);
  useEffect(() => {
    const before = lastSaved.current;
    lastSaved.current = saved;
    setDraft((current) =>
      current === before ||
      storedCaptureTags(typedTags(current)).join("\n") ===
        (capture.tags ?? []).join("\n")
        ? saved
        : current,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);
  const tags = typedTags(draft);
  const problem = captureTagsProblem(tags);
  const unchanged =
    storedCaptureTags(tags).join("\n") === (capture.tags ?? []).join("\n");
  const id = `capture-tags-${capture.id}`;
  const helpId = `${id}-help`;
  return (
    <form
      className="capture-tags"
      onSubmit={(event) => {
        event.preventDefault();
        if (!problem && (conflict || !unchanged)) onSave(tags);
      }}
    >
      <label htmlFor={id} className="capture-tags-label">
        {copy.tags}
      </label>
      <input
        id={id}
        type="text"
        className="capture-tags-input"
        value={draft}
        autoComplete="off"
        disabled={busy}
        readOnly={readOnly || undefined}
        aria-invalid={problem ? "true" : undefined}
        aria-describedby={helpId}
        onChange={(event) => setDraft(event.target.value)}
      />
      {conflict && meta ? (
        <div id={helpId}>
          <ConflictCompare
            meta={meta}
            conflict={conflict}
            yours={
              tags.map((tag) => localizedTag(tag, locale)).join(", ") || "—"
            }
          />
        </div>
      ) : problem ? (
        <p id={helpId} className="capture-tags-error" role="alert">
          {copy.tagsBounds}
        </p>
      ) : (
        <p id={helpId} className="account-muted capture-tags-help">
          {copy.tagsHelp}
        </p>
      )}
      {readOnly ? null : conflict && meta ? (
        <ConflictActions
          meta={meta}
          busy={busy}
          onKeepCurrent={() => {
            // The current tags replace what was typed; nothing is written.
            lastSaved.current = saved;
            setDraft(saved);
            onKeepCurrent();
          }}
        />
      ) : (
        <div className="capture-tags-actions">
          <button
            type="submit"
            className="btn-tertiary"
            disabled={busy || unchanged || Boolean(problem)}
          >
            {copy.saveTags}
          </button>
        </div>
      )}
    </form>
  );
}

/** A switch of the detail (« Rendre publique »). */
function Switch({ id, label, checked, disabled, onChange, greyed = false }) {
  return (
    <label
      className="space-calibration-switch capture-switch"
      htmlFor={id}
      data-greyed={greyed ? "" : undefined}
    >
      <span className="capture-switch-label">{label}</span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        aria-checked={checked}
        aria-disabled={greyed ? "true" : undefined}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="space-calibration-track" aria-hidden="true">
        <span />
      </span>
    </label>
  );
}

/**
 * The two switches « Afficher la qualité en
 * privé » and « Afficher la qualité en public » (both on by default) under
 * « Cette image » of « Qualité des captures »: whether the quality Astro Sync
 * measured — the image's, the nights' medians and the guiding — is drawn in
 * the capture's page of the private gallery and of the public gallery. The default is said under them. No
 * switch in the read-only window.
 */
export function QualityShowControls({
  capture,
  meta,
  busy,
  readOnly,
  actions,
}) {
  if (readOnly) return null;
  const shown = capture.qualityShown ?? { private: true, public: true };
  return (
    <div className="capture-zone-row capture-quality-switches">
      <Switch
        id={`capture-quality-private-${capture.id}`}
        label={meta.qualityShowPrivate}
        checked={shown.private !== false}
        disabled={busy}
        onChange={(on) => actions.setQualityShown(capture, "private", on)}
      />
      <Switch
        id={`capture-quality-public-${capture.id}`}
        label={meta.qualityShowPublic}
        checked={shown.public === true}
        disabled={busy}
        onChange={(on) => actions.setQualityShown(capture, "public", on)}
      />
      <p className="capture-zone-line account-muted">
        {meta.qualityShowDefault}
      </p>
    </div>
  );
}

/**
 * The zone « Fichier »: the main image's name, size and dimensions, its
 * secondary « Télécharger l'original (TIFF, 412 Mo) » (management only), one
 * line + ⓘ. « Ajouter une variante » (the web's gesture that sends a variant)
 * stands beside it where the space keeps variants.
 */
function FileZone({
  capture,
  copy,
  locale,
  withVariants,
  canAddVariant,
  actions,
  busy,
  readOnly = false,
}) {
  const main = (capture.variants ?? []).find((image) => image.main) ?? null;
  const facts = [
    capture.originalName,
    fileSize(capture.byteSize, locale),
    dimensions(main?.width, main?.height, locale),
  ].filter(Boolean);
  return (
    <section
      className="capture-zone capture-file-zone"
      aria-label={copy.fileZone}
    >
      <div className="capture-zone-head">
        <div>
          <h3 className="capture-zone-title">{copy.fileZone}</h3>
          <p className="capture-zone-value">{facts.join(" · ")}</p>
        </div>
        <div className="capture-zone-actions">
          {canAddVariant && !readOnly ? (
            <button
              type="button"
              className="btn-tertiary"
              disabled={busy}
              onClick={actions.chooseVariantFile}
            >
              {copy.addVariant}
            </button>
          ) : null}
          <DownloadOriginal
            capture={capture}
            image={null}
            copy={copy}
            locale={locale}
          />
        </div>
      </div>
      <InfoLine
        locale={locale}
        className="capture-zone-line"
        text={withVariants ? copy.fileMain : copy.fileSent}
        title={copy.fileZone}
        body={copy.fileInfo}
      />
    </section>
  );
}

/**
 * A capture created without an image says so, where the file would be, and
 * offers the way to add one — « Ajouter une image », the zone's own action
 * (a secondary: the zone has no primary). The images Astro Sync sends later
 * arrive in this same capture; the first one becomes its main image.
 */
function NoImageZone({ copy, busy, readOnly, actions }) {
  return (
    <section
      className="capture-zone capture-file-zone is-empty"
      aria-label={copy.fileZone}
    >
      <div className="capture-zone-head">
        <div>
          <h3 className="capture-zone-title">{copy.fileZone}</h3>
          <p className="capture-zone-value">{copy.noImage}</p>
        </div>
        {readOnly ? null : (
          <div className="capture-zone-actions">
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={actions.chooseVariantFile}
            >
              {copy.addImage}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The zone « Cible » of the owner's detail, where the target is added or changed: the targets of
 * the capture, each with « Changer » and « Retirer » (links), and « Ajouter
 * une cible » (the zone's action, a secondary), which opens the same search
 * with labelled rows as the add box and a night's « Cibles » row
 * (`TargetsPickerContext`). One `PATCH { metadata: { targetIds } }` says the
 * whole list; the service refuses what the owner may not do (a device
 * never, read-only window).
 */
function TargetZone({ capture, copy, locale, busy, readOnly, actions }) {
  const Picker = useTargetsPicker();
  // `null`: closed; `"add"`: a target to add; an identifier: the target it replaces.
  const [picking, setPicking] = useState(null);
  const targets = capture.detail?.targets ?? [];
  const ids = targets.map((target) => target.id);
  const label = (target) =>
    [target.designation, target.name].filter(Boolean).join(" · ");
  const save = async (next) => {
    setPicking(null);
    await actions.saveMetadata?.(capture, { targetIds: next });
  };
  return (
    <section
      className="capture-zone capture-target-zone"
      aria-label={copy.targetZone}
    >
      <div className="capture-zone-head">
        <h3 className="capture-zone-title">{copy.targetZone}</h3>
        {readOnly || picking !== null || !Picker ? null : (
          <div className="capture-zone-actions">
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => setPicking("add")}
            >
              {targets.length ? copy.targetAdd : copy.targetChoose}
            </button>
          </div>
        )}
      </div>
      {targets.length ? (
        <ul className="capture-target-list">
          {targets.map((target) => (
            <li key={target.id} className="capture-target-row">
              <span>{label(target)}</span>
              {/* Every night of the target. */}
              <a
                className="btn-link capture-target-statistics"
                href={journalStatisticsHref(locale, { target: target.id })}
              >
                {message(locale, "journalStatisticsAllNightsOf").replace(
                  "{target}",
                  target.designation,
                )}
              </a>
              {readOnly ? null : (
                <span className="capture-target-actions">
                  {Picker ? (
                    <button
                      type="button"
                      className="btn-link"
                      disabled={busy}
                      onClick={() => setPicking(target.id)}
                    >
                      {copy.targetChange(target.designation)}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn-link is-destructive"
                    disabled={busy}
                    onClick={() =>
                      void save(ids.filter((id) => id !== target.id))
                    }
                  >
                    {copy.targetRemove(target.designation)}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="capture-zone-value">{copy.targetNone}</p>
      )}
      {picking !== null && Picker ? (
        <div className="capture-target-picker">
          <Picker
            locale={locale}
            excludeIds={ids}
            onPick={(picked) =>
              void save(
                picking === "add"
                  ? [...ids, picked.id]
                  : ids.map((id) => (id === picking ? picked.id : id)),
              )
            }
          />
          <div className="capture-actions">
            <button
              type="button"
              className="btn-link"
              onClick={() => setPicking(null)}
            >
              {copy.targetCancel}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The zone « État » (two controls for two notions): the primary
 * « Finaliser cette capture » while the capture is a draft, then the
 * switch « Rendre publique », greyed on a draft, under the rule of
 * `captureState` (the service checks it again).
 */
function StateZone({ capture, copy, locale, context, actions }) {
  const draft = capture.stage === "draft";
  const readOnly = Boolean(context.readOnly);
  const busy = context.busy === capture.id;
  const isPublic = capture.visibility === "public";
  const allowed =
    context.publishAvailable &&
    (isPublic || (capture.state?.publishAllowed && !notShowable(capture)));
  const answersTouch =
    !allowed &&
    context.publishAvailable &&
    (capture.state?.state === "undetermined" || notShowable(capture));
  const visible =
    isPublic &&
    ["public_pending", "public_verified"].includes(capture.state?.state);
  const noImage = capture.hasImage === false;
  // The replacement of the image turned the capture private; the line says
  // it until the owner writes the visibility.
  const madePrivate = !isPublic && capture.replacedMadePrivate === true;
  const line = noImage
    ? copy.publishNoImage
    : draft
      ? copy.finalizeFirst
      : visible
        ? copy.alreadyVisible
        : madePrivate
          ? message(locale, "captureVisibilityMadePrivate")
          : null;
  return (
    <section
      className="capture-zone capture-state-zone"
      aria-label={copy.stateZone}
    >
      <div className="capture-zone-head">
        <div>
          <h3 className="capture-zone-title">{copy.stateZone}</h3>
          <p className="capture-zone-value">
            {draft
              ? copy.draftLine
              : capture.finalizedAt
                ? copy.finalizedOn(
                    shortDay(capture.finalizedAt, locale, context),
                  )
                : copy.finalized}
          </p>
        </div>
        {draft && !readOnly ? (
          <div className="capture-zone-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => actions.finalize(capture)}
            >
              {copy.finalize}
            </button>
          </div>
        ) : null}
      </div>
      {/* What the checks say, and why « Rendre publique » is not available,
          stand in this frame, before the action — never under the page; the
          request for a check beside its message. */}
      <CaptureStateNotices
        capture={capture}
        copy={copy}
        locale={locale}
        warningsCount={context.warningsCount}
        touched
        retired={context.retired.has(capture.id)}
        busy={busy}
        moderated={context.moderated}
        timeZone={context.timeZone}
        now={context.now}
        onRequestReview={() => actions.requestReview(capture)}
        onAcceptVerification={() => actions.acceptVerification(capture)}
        onDelete={() => actions.askDelete(capture)}
      />
      {readOnly ? null : (
        <div className="capture-zone-row">
          <Switch
            id={`capture-public-${capture.id}`}
            label={copy.makePublic}
            checked={isPublic}
            greyed={draft || (!allowed && !isPublic)}
            disabled={busy || draft || (!allowed && !answersTouch && !isPublic)}
            onChange={(shown) => {
              if (!shown) actions.makePrivate(capture);
              else if (allowed) actions.askPublic(capture);
              else if (answersTouch) actions.touch(capture);
            }}
          />
          <InfoLine
            locale={locale}
            className="capture-zone-line"
            text={line ?? ""}
            title={copy.makePublic}
            body={
              noImage
                ? copy.publishNoImage
                : draft
                  ? copy.draftInfo
                  : madePrivate
                    ? message(locale, "captureMadePrivateNotice")
                    : copy.help
            }
          />
        </div>
      )}
    </section>
  );
}

/**
 * The words of where a sky solution comes from (`CaptureDetailSolve`):
 * Astro Sync computes it (ASTAP, or reads the header NINA or ASIAIR already
 * solved), astrometry.net is named as such, an import carries it over.
 */
export const skyProvenanceKey = (source) =>
  source === "astrometry-net"
    ? "astrometry-net"
    : source === "import"
      ? "import"
      : "astro-sync";

/**
 * The sentence under a failed « Résoudre sur ce serveur », from the
 * service's `reason` (`not_solved`, `unreadable_solution`, `not_started`,
 * `image_changed`, `sky_solution_aspect_mismatch`).
 */
export const skyFailureLine = (copy, reason) =>
  copy.skyFailed[reason] ?? copy.skyFailed.other;

/**
 * The zone « Plate solving »: a management element, after « État », outside the public page.
 * It says where the sky solution of the main image comes from and carries
 * the choice « Afficher le plate solving » — a switch, outside the four
 * levels, like « Rendre publique » — that decides whether the gallery offers
 * the annotations of this capture (on as soon as a solution exists). Without
 * a solution the switch is greyed, one line + ⓘ explains it and the link
 * « Résoudre dans Astro Sync » (rules 6 and 7, a link) leads to the download
 * page; on a private server that has `solve-field`
 * (`serverFeatures["sky.solve_on_server"]`) « Résoudre sur ce serveur » is a
 * tertiary beside it (two levels, no primary: rule 10).
 */
export function SkySolutionZone({ capture, copy, locale, context, actions }) {
  const solution = capture.skySolution ?? null;
  const busy = context.busy === capture.id;
  const solve = context.solve?.captureId === capture.id ? context.solve : null;
  const running = solve?.state === "running";
  const on = Boolean(solution) && solution.annotationsEnabled !== false;
  const provenance = solution
    ? copy.skyProvenance[skyProvenanceKey(solution.source)](
        shortDay(solution.solvedAt, locale, context),
      )
    : null;
  return (
    <section
      className="capture-zone capture-sky-zone"
      aria-label={copy.skyZone}
    >
      <div className="capture-zone-head">
        <div>
          <h3 className="capture-zone-title">{copy.skyZone}</h3>
          {provenance ? (
            <p className="capture-zone-value">{provenance}</p>
          ) : null}
        </div>
      </div>
      <div className="capture-zone-row">
        {/* No switch in read only. */}
        {context.readOnly ? null : (
          <Switch
            id={`capture-sky-${capture.id}`}
            label={copy.skyShow}
            checked={on}
            greyed={!solution}
            disabled={busy || !solution}
            onChange={(shown) => actions.setSkyAnnotations(capture, shown)}
          />
        )}
        <InfoLine
          locale={locale}
          className="capture-zone-line"
          text={solution ? (on ? copy.skyOn : copy.skyOff) : copy.skyNone}
          label={copy.skyInfoLabel}
          title={copy.skyZone}
          body={solution ? copy.skyInfo : copy.skyInfoNone}
        />
      </div>
      {!solution ? (
        <div className="capture-zone-actions capture-sky-actions">
          {context.solveOnServer && !context.readOnly ? (
            <button
              type="button"
              className="btn-tertiary"
              disabled={busy || running}
              onClick={() => actions.solveOnServer(capture)}
            >
              {running ? copy.skyRunning : copy.skyServer}
            </button>
          ) : null}
          <a
            className="btn-link capture-download"
            href={astroSyncDownloadUrl(locale)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalIcon />
            {copy.skyAstroSync}
          </a>
        </div>
      ) : null}
      {solve?.state === "failed" ? (
        <p className="capture-zone-line capture-sky-failure" role="status">
          {skyFailureLine(copy, solve.reason)}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The image of the owner's opened capture: the thumbnail (768 px) is drawn at
 * once as the waiting image, and the shared copy (JPEG, 4096 px at most,
 * `variant=preview`) is laid over it as soon as it has loaded — in the same
 * box, so nothing moves. A file that cannot have a shared copy (the request
 * fails) keeps its thumbnail. The grids and cards keep the thumbnail.
 */
export function CaptureDetailPhoto({ capture, title }) {
  const [loaded, setLoaded] = useState(false);
  const full = useRef(null);
  const previewSource = captureMediaPath(capture.id, { preview: true });
  // The preview may have finished loading before this component hydrated.
  useEffect(() => {
    setLoaded(false);
    if (full.current?.complete && full.current.naturalWidth > 0)
      setLoaded(true);
  }, [previewSource]);
  return (
    <>
      {capture.thumbnail ? (
        <img
          className="capture-detail-waiting"
          src={captureMediaPath(capture.id, { thumbnail: true })}
          alt={loaded ? "" : title}
          aria-hidden={loaded ? "true" : undefined}
          decoding="async"
        />
      ) : null}
      <img
        ref={full}
        className={`capture-detail-full${loaded || !capture.thumbnail ? " is-loaded" : ""}`}
        src={previewSource}
        alt={title}
        decoding="async"
        onLoad={() => setLoaded(true)}
      />
    </>
  );
}

/**
 * The banner of a draft, first thing under « ← Toutes les captures »: it says
 * why the capture is not in the private gallery yet and carries the same
 * primary as the zone « État » (one primary per zone; the bottom one stays).
 * In the read-only window the sentence stands alone, with no button and no
 * hint: finalizing is not offered there either.
 */
export function CaptureDraftBanner({ capture, copy, context, actions }) {
  if (capture.stage !== "draft") return null;
  const readOnly = Boolean(context.readOnly);
  const busy = context.busy === capture.id;
  return (
    <section
      className="capture-draft-banner"
      role="status"
      data-testid="capture-finalize-banner"
    >
      <div className="capture-draft-banner-body">
        <span className="capture-draft-banner-icon" aria-hidden="true">
          <DraftIcon size={16} />
        </span>
        <div className="capture-draft-banner-text">
          <p className="capture-draft-banner-title">{copy.draftBanner}</p>
          {readOnly ? null : (
            <p className="capture-draft-banner-hint">{copy.draftBannerHint}</p>
          )}
        </div>
      </div>
      {readOnly ? null : (
        <div className="capture-draft-banner-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => actions.finalize(capture)}
          >
            {copy.finalize}
          </button>
        </div>
      )}
    </section>
  );
}

function CaptureDetail({ capture, copy, locale, context, actions }) {
  const title = captureTitle(capture, copy);
  // The metadata's words, the open field, the read-only window.
  const meta = metadataCopyFor(locale);
  const readOnly = Boolean(context.readOnly);
  const editing = {
    readOnly,
    busy: context.busy === capture.id,
    open: context.editingField ?? null,
    initial: context.fieldDraft ?? null,
    conflict: context.conflict ?? null,
    actions,
  };
  const detail = capture.detail ?? {};
  // The session's page, from the head line, « La session » and the quality.
  const sessionHref = capture.metadata?.sessionId
    ? `/${locale}/sessions/${encodeURIComponent(capture.metadata.sessionId)}`
    : null;
  const when = [
    copy.added(shortDay(capture.createdAt, locale, context)),
    detail.night ? copy.night(dayMonth(detail.night, locale)) : null,
  ].filter(Boolean);
  const publicSince = publicSinceLine(capture, copy, locale, context);
  // Without metadata, a facts card; with it, « La nuit » and « Matériel ».
  const rows = capture.metadata
    ? []
    : [
        detail.equipment?.length
          ? [copy.equipment, detail.equipment.join(" · ")]
          : null,
        detail.nightMonth
          ? [
              detail.nightMonthEnd ? copy.monthPlan : copy.month,
              formatNightMonths(
                detail.nightMonth,
                detail.nightMonthEnd,
                locale,
              ),
            ]
          : detail.night
            ? [copy.month, nightMonth(detail.night, locale, { capital: true })]
            : null,
        detail.skyQuality
          ? [copy.sky, copy.bortle(detail.skyQuality.bortle)]
          : null,
        detail.place ? [copy.place, copy.placeValue(detail.place.name)] : null,
      ].filter(Boolean);
  const designation = capture.detail?.targets?.[0]?.designation;
  const busy = context.busy === capture.id;
  const images = capture.variants ?? [];
  const variantLimit = context.variantLimit;
  const canAddVariant =
    variantLimit === null || images.length - 1 < variantLimit;
  return (
    <section
      className="account-panel capture-detail"
      aria-label={copy.captureLabel(designation || title)}
      data-capture-id={capture.id}
    >
      {readOnly ? (
        <ReadOnlyNotice
          meta={meta}
          locale={locale}
          offersHref={context.offersHref}
          offersLabel={copy.seeOffers}
          until={readOnlyUntilText(context.readOnlyUntil, locale, context)}
          paymentFailed={context.paymentFailed === true}
        />
      ) : null}
      <a
        className="btn-link capture-back"
        href={managePath(locale, "captures")}
      >
        <BackIcon />
        {copy.allCaptures}
      </a>
      <CaptureDraftBanner
        capture={capture}
        copy={copy}
        context={context}
        actions={actions}
      />
      <div className="capture-detail-image">
        {capture.preview || capture.thumbnail ? (
          <CaptureDetailPhoto capture={capture} title={title} />
        ) : (
          <span className="capture-placeholder is-large">
            <ImageIcon size={44} />
          </span>
        )}
      </div>
      <CaptureTitleField
        capture={capture}
        meta={meta}
        locale={locale}
        fallback={title}
        {...editing}
      />
      <p className="capture-when">{when.join(" · ")}</p>
      {publicSince ? (
        <p className="capture-when capture-public-since">{publicSince}</p>
      ) : null}
      <CapturePills capture={capture} copy={copy} />
      <CaptureSessionLine
        capture={capture}
        meta={meta}
        locale={locale}
        href={sessionHref}
      />
      <CaptureReplacedLine capture={capture} locale={locale} />
      <CaptureIntermediate capture={capture} meta={meta} locale={locale} />
      <TargetZone
        capture={capture}
        copy={copy}
        locale={locale}
        busy={busy}
        readOnly={readOnly}
        actions={actions}
      />
      <DescriptionZone
        capture={capture}
        meta={meta}
        locale={locale}
        {...editing}
      />
      {capture.hasImage === false ? (
        <NoImageZone
          copy={copy}
          busy={busy}
          readOnly={readOnly}
          actions={actions}
        />
      ) : (
        <>
          <FileZone
            capture={capture}
            copy={copy}
            locale={locale}
            withVariants={images.length > 1}
            canAddVariant={canAddVariant}
            actions={actions}
            busy={busy}
            readOnly={readOnly}
          />
          <CaptureVariants
            capture={capture}
            copy={{ ...copy }}
            locale={locale}
            timeZone={context.timeZone}
            busy={busy}
            editing={context.editingImage}
            line={context.variantLine}
            actions={actions}
            meta={meta}
            readOnly={readOnly}
            textsDraft={context.fieldDraft ?? null}
          />
          <CaptureProgression capture={capture} copy={copy} />
        </>
      )}
      <StateZone
        capture={capture}
        copy={copy}
        locale={locale}
        context={context}
        actions={actions}
      />
      <CaptureMetadataZones
        capture={capture}
        meta={meta}
        locale={locale}
        timeZone={context.timeZone}
        nights={context.nights}
        equipmentOptions={context.equipmentOptions ?? null}
        nightHref={sessionHref}
        afterAcquisition={
          <CaptureQualityZone
            capture={capture}
            meta={meta}
            locale={locale}
            href={sessionHref}
            controls={
              <QualityShowControls
                capture={capture}
                meta={meta}
                busy={editing.busy}
                readOnly={readOnly}
                actions={actions}
              />
            }
          />
        }
        {...editing}
      />
      <SkySolutionZone
        capture={capture}
        copy={copy}
        locale={locale}
        context={context}
        actions={actions}
      />
      <CaptureStateLines
        capture={capture}
        copy={copy}
        locale={locale}
        moderated={context.moderated}
      />
      {rows.length ? (
        <dl className="capture-facts">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <CaptureTagsField
        capture={capture}
        copy={copy}
        locale={locale}
        busy={busy}
        readOnly={readOnly}
        conflict={context.conflict?.key === "tags" ? context.conflict : null}
        meta={meta}
        onKeepCurrent={() => actions.editField?.(null)}
        onSave={(tags) => actions.saveTags(capture, tags)}
      />
      {capture.state?.state !== "protection_notice" && !readOnly ? (
        <div className="capture-actions capture-delete-row">
          <button
            type="button"
            className="btn-tertiary is-destructive"
            disabled={busy}
            onClick={() => actions.askDelete(capture)}
          >
            <TrashIcon />
            {copy.deleteCapture}
          </button>
        </div>
      ) : null}
    </section>
  );
}

// ——— The dialogs ———

/**
 * The three lines of a server with no team, in place of the rules of a
 * service that has one: its owner decides alone, a public capture is seen by
 * anyone, nobody else looks.
 */
export const privateRules = (copy) => [
  copy.ruleDecide,
  copy.rulePublic,
  copy.ruleResponsible,
];

/**
 * What « Rendre publique » publishes, and never: the dialog's body. Where a
 * team looks at the captures it says so and links the publishing rules; on a
 * server with no team (`moderated: false`) it says in three lines that its
 * owner alone decides.
 */
export function PublishDialogBody({
  capture,
  copy,
  locale,
  moderated = true,
  rulesHref = moderated ? publishingRulesHref(locale, copy) : null,
}) {
  const detail = capture.detail ?? {};
  const target = detail.targets?.[0]?.designation;
  const items = [
    copy.publishImage,
    target ? copy.publishTarget(target) : null,
    detail.equipment?.length ? copy.publishEquipment : null,
    detail.nightMonth
      ? (detail.nightMonthEnd ? copy.publishMonths : copy.publishMonth)(
          formatNightMonths(detail.nightMonth, detail.nightMonthEnd, locale),
        )
      : detail.night
        ? copy.publishMonth(nightMonth(detail.night, locale))
        : null,
    detail.skyQuality ? copy.publishSky : null,
  ].filter(Boolean);
  return (
    <div className="capture-dialog-body">
      <p>{copy.publishIntro}</p>
      <ul className="capture-publish-items">
        {items.map((item) => (
          <li key={item}>
            <CheckIcon className="capture-state-icon is-good" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <p className="capture-publish-place">
        <EyeOffIcon className="capture-state-icon is-bad" />
        <span>{copy.publishNoPlace}</span>
      </p>
      {moderated ? (
        copy.publishVerifier ? (
          <p className="capture-state-text is-muted">{copy.publishVerifier}</p>
        ) : null
      ) : (
        <ul className="capture-private-rules">
          {privateRules(copy).map((line) => (
            <li key={line} className="capture-state-text is-muted">
              {line}
            </li>
          ))}
        </ul>
      )}
      {rulesHref ? (
        <a className="btn-link" href={rulesHref}>
          {copy.publishingRules}
          <ChevronIcon size={16} />
        </a>
      ) : null}
    </div>
  );
}

export function PublishDialog({
  capture,
  copy,
  locale,
  busy,
  moderated = true,
  onCancel,
  onConfirm,
}) {
  return (
    <WebConfirmDialog
      title={copy.publishTitle}
      cancelLabel={copy.cancel}
      closeLabel={copy.close}
      confirmLabel={copy.publishConfirm}
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
      tone="plain"
      className="capture-publish-dialog"
    >
      <PublishDialogBody
        capture={capture}
        copy={copy}
        locale={locale}
        moderated={moderated}
      />
    </WebConfirmDialog>
  );
}

// ——— The tab ———

/**
 * « Supprimer la capture »'s body: how many images go and what is freed.
 */
export function DeleteCaptureBody({ capture, copy, locale }) {
  const images = (capture.variants ?? []).length;
  const bytes = capturedBytes(capture);
  return (
    <div className="capture-dialog-body">
      <p>{images > 1 ? copy.deleteBodyImages(images) : copy.deleteBody}</p>
      {/* A public capture is also retired from the public gallery; the dialog
          says so, as the publish dialog says what goes in. */}
      {capture.visibility === "public" ? (
        <p data-delete-public-note="">{copy.deletePublicNote}</p>
      ) : null}
      {bytes ? <p>{copy.freed(fileSize(bytes, locale))}</p> : null}
    </div>
  );
}

/** Bytes freed by deleting a capture: every image of it. */
const capturedBytes = (capture) =>
  (capture.variants ?? []).reduce(
    (sum, image) => sum + (Number(image.byteSize) || 0),
    0,
  ) ||
  Number(capture.byteSize) ||
  0;

/**
 * The whole tab as a function of its state (`CapturesTab` keeps it):
 * `list` (`status` loading · ready · failed, `page`), `detail` for one
 * capture opened, the transient marks (`touched`, `retired`), the upload,
 * the dialog, the list's `filter` and `view` (« Liste » · « Carte »), the
 * image whose names are being edited and the variants zone's line.
 * Exported for the tests, which draw every state from fixtures. `offersHref`:
 * where the host application sells (`null` on a private server: never « Voir
 * les offres »).
 */
export function CapturesView({
  locale = "en",
  captureId = null,
  state,
  actions,
  wide = false,
  timeZone,
  now,
  offersHref = null,
}) {
  const copy = capturesCopyFor(locale);
  const page = state.list.page;
  const variantLimit = Number.isInteger(page?.storage?.variantLimit)
    ? page.storage.variantLimit
    : null;
  const context = {
    publishAvailable: page?.publishing?.available !== false,
    // Whether a team looks at the captures (the hosted service): a server
    // without one says `false`.
    moderated: page?.publishing?.moderated !== false,
    warningsCount: page?.publishing?.warningsCount ?? 0,
    touched: state.touched,
    retired: state.retired,
    busy: state.busy,
    timeZone,
    now,
    offersHref,
    variantLimit,
    editingImage: state.editingImage ?? null,
    variantLine: state.variantLine ?? null,
    // The open field of the metadata (one at a time with the images'
    // texts), its draft (a capture from a fixture), the space's nights and
    // equipment to choose from, the read-only window.
    editingField: state.editingField ?? null,
    fieldDraft: state.fieldDraft ?? null,
    conflict: state.conflict ?? null,
    nights: page?.nights ?? [],
    equipmentOptions: state.equipmentOptions ?? null,
    readOnly: page?.readOnly === true,
    // When the read-only window ends and whether a payment failed
    // (additive, `manage-captures.schema.json`).
    readOnlyUntil: page?.readOnlyUntil ?? null,
    paymentFailed: page?.paymentFailed === true,
    // A server that has `solve-field` announces it.
    solveOnServer: page?.serverFeatures?.["sky.solve_on_server"] === true,
    solve: state.solve ?? null,
  };
  const dialog = state.dialog;
  const target = (capture) =>
    capture.detail?.targets?.[0]?.designation || captureTitle(capture, copy);
  const dialogs = (
    <>
      {dialog?.kind === "publish" ? (
        <PublishDialog
          capture={dialog.capture}
          copy={copy}
          locale={locale}
          busy={dialog.busy}
          moderated={context.moderated}
          onCancel={actions.closeDialog}
          onConfirm={() => actions.makePublic(dialog.capture)}
        />
      ) : null}
      {dialog?.kind === "delete" ? (
        <WebConfirmDialog
          title={copy.deleteTitle(captureTitle(dialog.capture, copy))}
          cancelLabel={copy.cancel}
          closeLabel={copy.close}
          confirmLabel={copy.deleteCapture}
          busy={dialog.busy}
          onCancel={actions.closeDialog}
          onConfirm={() => actions.remove(dialog.capture)}
          tone="danger"
        >
          <DeleteCaptureBody
            capture={dialog.capture}
            copy={copy}
            locale={locale}
          />
        </WebConfirmDialog>
      ) : null}
      {dialog?.kind === "main" ? (
        <MainImageDialog
          capture={dialog.capture}
          image={dialog.image}
          copy={copy}
          locale={locale}
          target={target(dialog.capture)}
          busy={dialog.busy}
          onCancel={actions.closeDialog}
          onConfirm={() => actions.useAsMain(dialog.capture, dialog.image)}
        />
      ) : null}
      {dialog?.kind === "deleteVariant" ? (
        <DeleteVariantDialog
          capture={dialog.capture}
          image={dialog.image}
          copy={copy}
          locale={locale}
          timeZone={timeZone}
          busy={dialog.busy}
          onCancel={actions.closeDialog}
          onConfirm={() => actions.deleteVariant(dialog.capture, dialog.image)}
        />
      ) : null}
      {dialog?.kind === "add" ? (
        <CaptureAddDialog
          copy={copy}
          locale={locale}
          nights={page?.nights ?? []}
          places={page?.places ?? []}
          storage={page?.storage ?? null}
          fetcher={actions.fetcher}
          csrf={actions.csrf}
          leaves={actions.leaves}
          refusalWords={(outcome, file) =>
            uploadRefusalWords(outcome, copy, file)
          }
          offersHref={offersHref}
          onClose={actions.closeDialog}
          onAdded={actions.added}
          initial={dialog.initial ?? null}
        />
      ) : null}
    </>
  );
  const syncNote = state.syncNote ? (
    <p className="capture-sync-note" role="status">
      {state.syncNote}
    </p>
  ) : null;
  const failure = state.failure ? (
    <div className="capture-notice is-bad" role="alert">
      <WarningIcon className="capture-notice-icon" />
      <div className="capture-notice-text">
        <p className="capture-notice-title">{state.failure}</p>
      </div>
    </div>
  ) : null;
  // A field that changed on another device while its editor was not open
  // (« Finaliser », a switch, « Synchroniser »): the page says so above the
  // detail, with the capture already read again. An open editor says it
  // itself.
  const conflictNotice =
    state.conflict && !state.conflict.inline ? (
      <Notice tone="warn" title={state.conflict.message} role="alert">
        {state.conflict.current ? (
          <p>
            {metadataCopyFor(locale).captureEditCurrent(state.conflict.current)}
          </p>
        ) : null}
      </Notice>
    ) : null;
  const madePrivateNotice = state.upload.madePrivate ? (
    <Notice
      tone="warning"
      title={message(locale, "captureMadePrivateNotice")}
    />
  ) : null;
  const refusal = state.upload.refusal ? (
    <Notice tone="warn" title={state.upload.refusal.title} role="alert">
      {state.upload.refusal.body ? <p>{state.upload.refusal.body}</p> : null}
    </Notice>
  ) : null;

  if (captureId) {
    const detail = state.detail;
    return (
      <>
        {detail.status === "ready" ? (
          <>
            {failure}
            {syncNote}
            {conflictNotice}
            {refusal}
            <CaptureDetail
              capture={detail.capture}
              copy={copy}
              locale={locale}
              context={context}
              actions={actions}
            />
          </>
        ) : (
          <section
            className="account-panel capture-detail"
            aria-busy={detail.status === "loading"}
          >
            <a
              className="btn-link capture-back"
              href={managePath(locale, "captures")}
            >
              <BackIcon />
              {copy.allCaptures}
            </a>
            {detail.status === "loading" ? (
              <LoadingState>{copy.loading}</LoadingState>
            ) : (
              <>
                <p className="account-muted">
                  {detail.status === "not-found"
                    ? copy.notFound
                    : copy.loadFailed}
                </p>
                {detail.status === "not-found" ? null : (
                  <div className="capture-actions">
                    <button
                      type="button"
                      className="btn-link"
                      onClick={actions.reload}
                    >
                      {copy.retry}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}
        {dialogs}
      </>
    );
  }

  const captures = page?.captures ?? [];
  const names = page?.names ?? {};
  const filter = state.filter ?? { chip: "", query: "", oldestFirst: false };
  const shown = filteredCaptures(captures, { ...filter, locale });
  const counts = captureCounts(shown);
  const quota = storageLine(page?.storage);
  // The read-only window says so on the list too, as on a capture's page,
  // and nothing can be added: the service refuses the upload anyway.
  const readOnly = page?.readOnly === true;
  const readOnlyUntil = readOnly
    ? readOnlyUntilText(page?.readOnlyUntil, locale, { timeZone, now })
    : "";
  // Full by its bytes, or a free space at its count: the button says so
  // before three steps are played.
  const full =
    readOnly ||
    quota?.kind === "full" ||
    (quota?.kind === "count" &&
      (quota.count >= quota.limit || quota.bytes === "full"));
  const addButton = (
    <button
      type="button"
      className="btn-primary captures-add"
      disabled={state.upload.busy || full}
      aria-busy={state.upload.busy || undefined}
      onClick={actions.openAdd}
    >
      <PlusIcon />
      {copy.add}
    </button>
  );
  const warning = context.warningsCount;
  const rulesHref = publishingRulesHref(locale, copy);
  const nameNotices = [
    copy.team && names.publicNameRefusedAt ? (
      <Notice key="public-name" tone="bad" title={copy.publicNameRefusedTitle}>
        <p>{copy.publicNameRefusedBody}</p>
        {warning > 0 && warning < 4 ? <p>{copy.warning(warning)}</p> : null}
        {rulesHref ? (
          <a className="btn-link" href={rulesHref}>
            {copy.publishingRules}
            <ChevronIcon size={16} />
          </a>
        ) : null}
      </Notice>
    ) : null,
    copy.team && names.portalNameRefusedAt ? (
      <Notice key="portal-name" tone="bad" title={copy.portalNameRefusedTitle}>
        <p>{copy.portalNameRefusedBody}</p>
        {warning > 0 && warning < 4 ? <p>{copy.warning(warning)}</p> : null}
        {rulesHref ? (
          <a className="btn-link" href={rulesHref}>
            {copy.publishingRules}
            <ChevronIcon size={16} />
          </a>
        ) : null}
      </Notice>
    ) : null,
  ].filter(Boolean);
  const blockedUntil = page?.publishing?.blockedUntil;
  const view = state.view === "map" ? "map" : "list";

  return (
    <section
      className="account-panel manage-captures"
      aria-label={copy.title}
      aria-busy={state.list.status === "loading"}
      data-layout={wide ? "grid" : "list"}
    >
      {nameNotices}
      {captures.length ? (
        <div className="captures-head">
          {/* The head holds the segment alone — the title repeated the tab
              above it and « Ajouter une capture » is the foot of the page.
              The ⓘ keeps what the title carried; an empty space has neither
              (its own text says it). */}
          <div
            className="captures-view-switch"
            role="group"
            aria-label={copy.viewLabel}
          >
            {[
              ["list", copy.listView],
              ["map", copy.mapView],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={view === key ? "is-active" : ""}
                aria-pressed={view === key}
                onClick={() => actions.setView(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <InfoButton
            locale={locale}
            label={copy.infoLabel}
            title={copy.infoLabel}
            body={copy.help}
          >
            <p className="info-dialog-text">{copy.publishNoPlace}</p>
            {context.moderated ? (
              copy.publishVerifier ? (
                <p className="info-dialog-text">{copy.publishVerifier}</p>
              ) : null
            ) : (
              privateRules(copy).map((line) => (
                <p key={line} className="info-dialog-text">
                  {line}
                </p>
              ))
            )}
          </InfoButton>
        </div>
      ) : null}
      {captures.length ? (
        <CaptureFilters
          captures={captures}
          copy={copy}
          locale={locale}
          filter={filter}
          actions={actions}
        />
      ) : null}
      {captures.length ? (
        <p className="captures-counter">
          {copy.counter(counts.captures, counts.targets)}
        </p>
      ) : null}
      {readOnly ? (
        <ReadOnlyNotice
          meta={metadataCopyFor(locale)}
          locale={locale}
          offersHref={offersHref}
          offersLabel={copy.seeOffers}
          until={readOnlyUntil}
          paymentFailed={page?.paymentFailed === true}
        />
      ) : null}
      <StorageLine
        storage={page?.storage}
        copy={copy}
        locale={locale}
        offersHref={offersHref}
        readOnly={readOnly}
        readOnlyUntil={readOnlyUntil}
      />
      {refusal}
      {madePrivateNotice}
      {failure}
      {blockedUntil ? (
        <CaptureStateNotices
          capture={{
            state: {
              state: "publishing_blocked",
              publishingBlockedUntil: blockedUntil,
            },
          }}
          copy={copy}
          locale={locale}
          timeZone={timeZone}
          now={now}
        />
      ) : null}
      {state.list.status === "loading" ? (
        <LoadingState>{copy.loading}</LoadingState>
      ) : state.list.status === "failed" ? (
        <div className="captures-failure">
          <p className="account-muted">{copy.loadFailed}</p>
          <div className="capture-actions">
            <button type="button" className="btn-link" onClick={actions.reload}>
              {copy.retry}
            </button>
          </div>
        </div>
      ) : captures.length === 0 ? (
        <div className="captures-empty">
          <ImageIcon size={30} className="captures-empty-icon" />
          <p className="captures-empty-title">{copy.emptyTitle}</p>
          <p className="account-muted">{copy.emptyBody}</p>
          {addButton}
        </div>
      ) : view === "map" ? (
        <PersonalSkyMap
          locale={locale}
          targets={shown.map((capture) => mapTargetOf(capture, copy, locale))}
        />
      ) : shown.length === 0 ? (
        <p className="account-muted captures-no-match">{copy.noMatch}</p>
      ) : (
        <>
          <ul className="capture-grid">
            {shown.map((capture) => (
              <CaptureCard
                key={capture.id}
                capture={capture}
                copy={copy}
                locale={locale}
              />
            ))}
          </ul>
          {page?.hasMore ? (
            <MoreCaptures onVisible={actions.loadMore} busy={state.list.more} />
          ) : null}
        </>
      )}
      {captures.length && state.list.status !== "failed" ? (
        <CapturesFooter>{addButton}</CapturesFooter>
      ) : null}
      {dialogs}
    </section>
  );
}

/**
 * Whether the foot may stay over the page: never over the first card. The
 * foot's strip is the bottom `footHeight` of the window; the first card, at
 * `{ top, bottom }` in the window, is under it when it shows there — it
 * begins above the window's bottom and ends below the strip's top. A card
 * wholly above the strip, or wholly below the window, is not covered.
 */
export function footMayStick({ top, bottom }, { viewport, footHeight }) {
  return !(top < viewport && bottom > viewport - footHeight);
}

/**
 * The foot of the list: « Ajouter une capture » at the full width, kept in
 * view while a long list scrolls — except while that would hide the first
 * card, when it stays at the end of the list (in the flow) until the card
 * has left the strip.
 */
function CapturesFooter({ children }) {
  const foot = useRef(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const node = foot.current;
    if (!node) return undefined;
    const update = () => {
      const first = node.parentElement?.querySelector(".capture-card");
      setStuck(
        first
          ? footMayStick(first.getBoundingClientRect(), {
              viewport: window.innerHeight,
              footHeight: node.offsetHeight,
            })
          : true,
      );
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const watch =
      typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    if (node.parentElement) watch?.observe(node.parentElement);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      watch?.disconnect();
    };
  }, []);
  return (
    <div ref={foot} className={`captures-footer${stuck ? " is-stuck" : ""}`}>
      {children}
    </div>
  );
}

/**
 * The end of the list while the service has more (« infinite scroll »): the
 * next page is asked for when it comes into view.
 */
function MoreCaptures({ onVisible, busy }) {
  const sentinel = useRef(null);
  useEffect(() => {
    const element = sentinel.current;
    if (!element || typeof IntersectionObserver === "undefined")
      return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !busy) onVisible();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [busy, onVisible]);
  return <div ref={sentinel} className="captures-more" aria-hidden="true" />;
}

const UPLOAD_WORDS = {
  capture_limit_reached: (copy, file, storage) => ({
    title: copy.limitTitle(file, storage?.captureCountLimit ?? 3),
    body: copy.limitBody,
  }),
  storage_quota_reached: (copy, file) => ({
    title: copy.quotaTitle(file),
    body: copy.limitBody,
  }),
  file_too_large: (copy, file) => ({
    title: copy.tooLargeTitle(file),
    body: null,
  }),
  entitlement_read_only: (copy, file) => ({
    title: copy.readOnlyTitle(file),
    body: null,
  }),
  capture_content_refused: (copy, file) => ({
    title: copy.contentRefusedTitle(file),
    body: null,
  }),
};

const UPLOAD_NEEDS = {
  capture_limit_reached: ["limitTitle"],
  entitlement_read_only: ["readOnlyTitle"],
};

/** What a refused or failed upload says, above the list. */
export function uploadRefusalWords(outcome, copy, file) {
  const words = UPLOAD_WORDS[outcome?.code];
  // The refusals that name a limit or a read-only space are the words of a
  // service that has them (`hosted-copy.js`); another says it failed.
  const said = (UPLOAD_NEEDS[outcome?.code] ?? []).every((key) => copy[key]);
  if (outcome?.kind === "refused" && words && said)
    return words(copy, file, outcome.storage);
  return { title: copy.uploadFailedTitle(file), body: copy.tryLater };
}

const RETIRED_MS = 6000;
// How often « Résoudre sur ce serveur » reads where the resolution stands.
const SOLVE_POLL_MS = 2000;

/**
 * The tab, with its own reads and writes. `leaves(outcome)` is the page's:
 * a session that ended, or a space deleted, moves the page on. `offersHref`:
 * where the host application sells (SpacePage hands it over; `null` shows no
 * offer).
 */
export function CapturesTab({
  locale = "en",
  captureId = null,
  fetcher = (...args) => fetch(...args),
  csrf = () => "",
  leaves = () => false,
  navigate = (path) => window.location.assign(path),
  timeZone,
  offersHref = null,
}) {
  const copy = capturesCopyFor(locale);
  const wide = useWide();
  const [state, setState] = useState(() => ({
    list: { status: "loading", page: null, more: false },
    detail: { status: "loading", capture: null },
    touched: new Set(),
    retired: new Set(),
    busy: null,
    dialog: null,
    upload: { busy: false, refusal: null },
    failure: null,
    syncNote: null,
    filter: { chip: "", query: "", oldestFirst: false },
    view: "list",
    editingImage: null,
    variantLine: null,
    solve: null,
  }));
  const patch = useCallback(
    (changes) => setState((current) => ({ ...current, ...changes })),
    [],
  );
  const variantInput = useRef(null);
  const timers = useRef([]);
  const unmounted = useRef(false);
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      for (const timer of timers.current) clearTimeout(timer);
    };
  }, []);

  const loadList = useCallback(async () => {
    const outcome = await loadCaptures(fetcher, { locale });
    if (leaves(outcome)) return;
    setState((current) => ({
      ...current,
      list:
        outcome.kind === "ok"
          ? { status: "ready", page: outcome.page, more: false }
          : { status: "failed", page: current.list.page, more: false },
    }));
  }, [fetcher, leaves, locale]);

  const loadDetail = useCallback(async () => {
    const [outcome] = await Promise.all([
      loadCapture(fetcher, { id: captureId, locale }),
      loadList(),
    ]);
    if (leaves(outcome)) return;
    setState((current) => ({
      ...current,
      detail:
        outcome.kind === "ok"
          ? { status: "ready", capture: outcome.capture }
          : { status: outcome.kind === "not-found" ? "not-found" : "failed" },
    }));
  }, [captureId, fetcher, leaves, loadList, locale]);

  const reload = useCallback(
    () => (captureId ? loadDetail() : loadList()),
    [captureId, loadDetail, loadList],
  );

  useEffect(() => {
    void reload();
    // Once, at the opening of the tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Several clients write the same capture. The change channel
  // (`GET /api/v1/changes`, the signal « captures » — it carries no data)
  // tells an opened capture to be read again, so that what the other hand
  // wrote shows without a reload; the value the person is typing is kept (the
  // editors hold their own entry), and a write of this tab is not echoed back
  // (the instance header of `captures-client.js`). The read waits for a write
  // of this tab in flight: its answer is the newer one.
  const latest = useRef({ reload, busy: state.busy });
  latest.current = { reload, busy: state.busy };
  useEffect(() => {
    if (!captureId) return undefined;
    const onSignal = () => {
      if (!latest.current.busy) void latest.current.reload();
    };
    window.addEventListener(CHANGE_SIGNAL_EVENT, onSignal);
    const stop = startChangeSubscription();
    return () => {
      window.removeEventListener(CHANGE_SIGNAL_EVENT, onSignal);
      stop();
    };
  }, [captureId]);

  // A capture the service answered: in the list and in the opened one.
  const replace = (capture) =>
    setState((current) => ({
      ...current,
      list: current.list.page
        ? {
            ...current.list,
            page: {
              ...current.list.page,
              captures: current.list.page.captures.map((entry) =>
                entry.id === capture.id ? capture : entry,
              ),
            },
          }
        : current.list,
      detail:
        current.detail.capture?.id === capture.id
          ? { status: "ready", capture }
          : current.detail,
    }));
  const mark = (name, id, on) =>
    setState((current) => {
      const next = new Set(current[name]);
      if (on) next.add(id);
      else next.delete(id);
      return { ...current, [name]: next };
    });
  const dialogBusy = () =>
    setState((current) => ({
      ...current,
      dialog: current.dialog && { ...current.dialog, busy: true },
    }));

  /**
   * The words of a `409 capture_conflict`: the capture is replaced by the
   * one the service answered, and `state.conflict` says which field changed
   * on another device — in its open editor when there is one, above the
   * detail otherwise. Nothing the person typed is touched.
   */
  function conflictOf(outcome) {
    if (outcome.capture) replace(outcome.capture);
    patch({
      busy: null,
      failure: null,
      conflict: describeConflict({
        meta: metadataCopyFor(locale),
        copy,
        locale,
        field: outcome.field,
        line: outcome.line,
        capture: outcome.capture ?? state.detail.capture,
        editing: state.editingField ?? null,
      }),
    });
  }

  async function write(capture, change, { after } = {}) {
    patch({ busy: capture.id, failure: null, conflict: null });
    const outcome = await changeCapture(fetcher, {
      id: capture.id,
      change,
      locale,
      csrf: csrf(),
      revision: capture.revision,
    });
    if (leaves(outcome)) return;
    if (outcome.kind === "conflict") {
      conflictOf(outcome);
      return outcome;
    }
    patch({ busy: null });
    if (outcome.kind === "ok") {
      replace(outcome.capture);
      after?.(outcome.capture);
    } else if (outcome.kind === "refused" || outcome.kind === "not-found") {
      // The service's rule answered otherwise than the screen: read again.
      await reload();
    } else patch({ failure: copy.changeFailed });
    return outcome;
  }

  /** A gesture on an image of the capture (`change` null: delete). */
  async function writeImage(capture, image, change, { after } = {}) {
    patch({ busy: capture.id, failure: null });
    const outcome = await changeImage(fetcher, {
      id: capture.id,
      imageId: image.id,
      change,
      locale,
      csrf: csrf(),
    });
    if (leaves(outcome)) return;
    patch({ busy: null, dialog: null });
    if (outcome.kind === "ok") {
      replace(outcome.capture);
      after?.(outcome.capture);
    } else if (outcome.kind === "refused" || outcome.kind === "not-found")
      await reload();
    else patch({ failure: copy.changeFailed });
    return outcome;
  }

  const actions = {
    fetcher,
    csrf,
    leaves,
    reload: () => void reload(),
    closeDialog: () =>
      setState((current) =>
        current.dialog?.busy ? current : { ...current, dialog: null },
      ),
    touch: (capture) => mark("touched", capture.id, true),
    setFilter: (changes) =>
      setState((current) => ({
        ...current,
        filter: { ...current.filter, ...changes },
      })),
    setView: (view) => patch({ view }),
    openAdd: () =>
      patch({
        dialog: { kind: "add", busy: false },
        upload: { busy: false, refusal: null },
      }),
    async added(outcome) {
      // An image that replaced the one of a public capture turned it
      // private; the page says so above the list, in words that tell what to
      // do (the capture's own page keeps saying it on its visibility line).
      patch({
        dialog: null,
        upload: {
          busy: false,
          refusal: null,
          madePrivate:
            outcome?.replaced === true &&
            outcome?.capture?.replacedMadePrivate === true,
        },
      });
      await loadList();
    },
    async loadMore() {
      const page = state.list.page;
      if (!page?.hasMore || state.list.more) return;
      setState((current) => ({
        ...current,
        list: { ...current.list, more: true },
      }));
      const outcome = await loadCaptures(fetcher, {
        locale,
        before: page.nextBefore,
      });
      if (leaves(outcome)) return;
      setState((current) => ({
        ...current,
        list:
          outcome.kind === "ok"
            ? {
                ...current.list,
                more: false,
                page: {
                  ...current.list.page,
                  captures: [
                    ...current.list.page.captures,
                    ...outcome.page.captures,
                  ],
                  hasMore: outcome.page.hasMore,
                  nextBefore: outcome.page.nextBefore,
                },
              }
            : { ...current.list, more: false },
      }));
    },
    askPublic: (capture) =>
      patch({ dialog: { kind: "publish", capture, busy: false } }),
    askDelete: (capture) =>
      patch({ dialog: { kind: "delete", capture, busy: false } }),
    async makePublic(capture) {
      dialogBusy();
      const outcome = await write(capture, { visibility: "public" });
      patch({ dialog: null });
      // The file turned out not to be showable: say why.
      if (outcome?.kind === "refused" && outcome.code === "not_showable")
        mark("touched", capture.id, true);
    },
    async makePrivate(capture) {
      await write(
        capture,
        { visibility: "private" },
        {
          after: () => {
            mark("retired", capture.id, true);
            timers.current.push(
              setTimeout(() => mark("retired", capture.id, false), RETIRED_MS),
            );
          },
        },
      );
    },
    async finalize(capture) {
      await write(capture, { stage: "finalized" });
    },
    async requestReview(capture) {
      await write(
        capture,
        { requestReview: true },
        { after: () => mark("touched", capture.id, false) },
      );
    },
    async acceptVerification(capture) {
      await write(capture, { acceptVerification: true });
    },
    async saveTags(capture, tags) {
      await write(capture, { tags });
    },
    // The choice « Afficher le plate solving » (`PATCH { skyAnnotations }`).
    async setSkyAnnotations(capture, shown) {
      await write(capture, { skyAnnotations: shown });
    },
    // « Afficher la qualité en privé » / « … en public »
    // (`PATCH { qualityPrivate }` / `{ qualityPublic }`).
    async setQualityShown(capture, audience, shown) {
      await write(
        capture,
        audience === "public"
          ? { qualityPublic: shown }
          : { qualityPrivate: shown },
      );
    },
    // « Résoudre sur ce serveur » — the resolution starts, then is read until
    // it is solved (the capture is read again) or failed (its words).
    async solveOnServer(capture) {
      patch({ solve: { captureId: capture.id, state: "running" } });
      let outcome = await startSkySolve(fetcher, {
        id: capture.id,
        csrf: csrf(),
      });
      while (
        !unmounted.current &&
        outcome.kind === "ok" &&
        outcome.state === "running"
      ) {
        await new Promise((resolve) => setTimeout(resolve, SOLVE_POLL_MS));
        if (unmounted.current) return;
        outcome = await readSkySolve(fetcher, { id: capture.id });
      }
      if (unmounted.current || leaves(outcome)) return;
      if (outcome.kind === "ok" && outcome.state === "solved") {
        patch({ solve: null });
        await reload();
      } else
        patch({
          solve: {
            captureId: capture.id,
            state: "failed",
            reason: outcome.kind === "ok" ? outcome.reason : "other",
          },
        });
    },
    // The images of a capture.
    editNames: (imageId) =>
      patch({
        editingImage: imageId,
        editingField: null,
        fieldDraft: null,
        variantLine: null,
        conflict: null,
      }),
    async saveImageText(image, field, value) {
      const capture = state.detail.capture;
      await writeImage(capture, image, { [field]: value });
    },
    // The title and the description of an image in one request; the field
    // closes once saved.
    async saveImageTexts(image, texts) {
      const capture = state.detail.capture;
      return await writeImage(capture, image, texts, {
        after: () => patch({ editingImage: null }),
      });
    },
    // One field of the metadata open at a time (the images' texts
    // included); `PATCH` with that field alone, the field closed once
    // saved, kept open with its input on a refusal.
    editField: (field) =>
      patch({
        editingField: field,
        fieldDraft: null,
        editingImage: null,
        conflict: null,
      }),
    // « Synchroniser avec la session ».
    async syncAcquisition(capture) {
      patch({
        busy: capture.id,
        failure: null,
        conflict: null,
        syncNote: null,
      });
      const before = integrationSignature(capture);
      const outcome = await syncCaptureAcquisition(fetcher, {
        id: capture.id,
        locale,
        csrf: csrf(),
        revision: capture.revision,
      });
      if (leaves(outcome)) return;
      if (outcome.kind === "conflict") {
        conflictOf(outcome);
        return outcome;
      }
      patch({ busy: null });
      if (outcome.kind === "ok") {
        replace(outcome.capture);
        // A synchronisation that took nothing says so, so that it is not
        // taken for one that did not work.
        patch({
          syncNote:
            integrationSignature(outcome.capture) === before
              ? copy.syncNothing
              : copy.syncDone,
        });
      } else if (outcome.kind === "refused" || outcome.kind === "not-found")
        await reload();
      else patch({ failure: copy.changeFailed });
      return outcome;
    },
    // `keepOpen`: one of several saves of a card's form: the form closes
    // with the last one only.
    async saveMetadata(capture, metadata, { keepOpen = false } = {}) {
      return await write(
        capture,
        { metadata },
        keepOpen
          ? {}
          : { after: () => patch({ editingField: null, fieldDraft: null }) },
      );
    },
    async loadEquipmentOptions() {
      if (state.equipmentOptions) return;
      const outcome = await loadEquipment(fetcher);
      if (outcome.kind !== "ok") return;
      const { equipment = [], defaults = [] } = outcome.read;
      patch({
        equipmentOptions: [...equipment, ...defaults]
          .filter((item) => item?.id && item.name && !item.archivedAt)
          .map((item) => ({ id: item.id, type: item.type, name: item.name })),
      });
    },
    async variantPublic(image, shown) {
      const capture = state.detail.capture;
      patch({ variantLine: null });
      await writeImage(capture, image, { public: shown });
    },
    askMainImage: (image) =>
      patch({
        dialog: {
          kind: "main",
          capture: state.detail.capture,
          image,
          busy: false,
        },
      }),
    async useAsMain(capture, image) {
      dialogBusy();
      const former = (capture.variants ?? []).find((entry) => entry.main);
      await writeImage(
        capture,
        image,
        { main: true },
        {
          after: () =>
            patch({
              editingImage: null,
              variantLine: former
                ? mainChosenLine({ capture, chosen: image, former, copy })
                : null,
            }),
        },
      );
    },
    askDeleteVariant: (image) =>
      patch({
        dialog: {
          kind: "deleteVariant",
          capture: state.detail.capture,
          image,
          busy: false,
        },
      }),
    async deleteVariant(capture, image) {
      dialogBusy();
      await writeImage(capture, image, null, {
        after: () => patch({ editingImage: null, variantLine: null }),
      });
    },
    chooseVariantFile: () => variantInput.current?.click(),
    async remove(capture) {
      dialogBusy();
      const outcome = await deleteCapture(fetcher, {
        id: capture.id,
        csrf: csrf(),
      });
      if (leaves(outcome)) return;
      patch({ dialog: null });
      if (outcome.kind === "ok" || outcome.kind === "not-found") {
        if (captureId) {
          navigate(managePath(locale, "captures"));
          return;
        }
        await loadList();
      } else patch({ failure: copy.changeFailed });
    },
  };

  // « Ajouter une variante » — the file checked first, then sent with the
  // capture's id: it arrives as a private variant.
  async function onVariantFile(event) {
    const [file] = event.target.files || [];
    event.target.value = "";
    const capture = state.detail.capture;
    if (!file || !capture) return;
    patch({ upload: { busy: true, refusal: null }, busy: capture.id });
    let sha256;
    try {
      sha256 = await fileDigest(file);
    } catch {
      patch({
        busy: null,
        upload: {
          busy: false,
          refusal: uploadRefusalWords({ kind: "failed" }, copy, file.name),
        },
      });
      return;
    }
    const metadata = { captureId: capture.id, source: "web" };
    const check = await checkUpload(fetcher, {
      csrf: csrf(),
      metadata: {
        ...metadata,
        originalName: file.name,
        sha256,
        byteSize: file.size,
      },
    });
    if (leaves(check)) return;
    if (check.kind !== "accepted") {
      patch({
        busy: null,
        upload: {
          busy: false,
          refusal:
            check.kind === "present"
              ? { title: copy.alreadyPresent(file.name), body: null }
              : uploadRefusalWords(
                  check.kind === "refused"
                    ? {
                        kind: "refused",
                        code: check.code,
                        storage: check.storage,
                      }
                    : check,
                  copy,
                  file.name,
                ),
        },
      });
      return;
    }
    const outcome = await uploadCapture(fetcher, {
      file,
      sha256,
      csrf: csrf(),
      metadata,
    });
    if (leaves(outcome)) return;
    patch({
      busy: null,
      upload: {
        busy: false,
        refusal:
          outcome.kind === "ok"
            ? null
            : uploadRefusalWords(outcome, copy, file.name),
      },
    });
    if (outcome.kind === "ok") await loadDetail();
  }

  return (
    <>
      <CapturesView
        locale={locale}
        captureId={captureId}
        state={state}
        actions={actions}
        wide={wide}
        timeZone={timeZone}
        offersHref={offersHref}
      />
      {captureId ? (
        <input
          ref={variantInput}
          type="file"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          accept="image/*,.fits,.fit,.fts,.xisf,.tif,.tiff"
          onChange={onVariantFile}
        />
      ) : null}
    </>
  );
}
