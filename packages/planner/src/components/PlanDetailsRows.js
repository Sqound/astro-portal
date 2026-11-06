"use client";

import { message } from "portal/i18n.js";
import { TargetTile } from "portal/components/ObjectPictogram.js";
import { planTargetCount, tonightPlanCard } from "../tonight-overview.js";
import { targetWithPicture } from "../plan-target-pictures.js";

// What "détails" adds to a plan's card in the web library: three rows with
// their icons — the place and its Bortle, the rig and the mode, the hours and
// the count of targets — then the targets' thumbnails in the order of the night
// (the sky image or the type's pictogram, the designation under it), "+N"
// beyond six.

/** How many thumbnails are drawn before "+N". */
export const planDetailsThumbnails = 6;

/**
 * The words of the rows: `place` (with "Bortle N" when the plan's place
 * carries its class), `rig` (the rig's name and the mode, `null` without
 * equipment), `hours` ("19:49 → 03:49 · 4 cibles"), `items` (the plan's
 * targets in the order of the night) and `more` ("+1", or `null`).
 * `clock(iso)` writes an hour in the place's time; `rigName` is the name the
 * planner resolves for the plan's equipment.
 */
export function planDetailsWords(locale, plan, { clock, rigName = "" } = {}) {
  const card = tonightPlanCard(plan, plan?.location ?? null);
  const place = String(plan?.location?.name || "").trim();
  const sky = plan?.location?.skyEntered ?? plan?.location?.skyQuality;
  const bortle = Number(sky?.bortleClass ?? sky?.bortle);
  const count = planTargetCount(plan);
  const targets = `${count} ${message(locale, "plannerPlannedTargets")}`;
  const mode = plan?.equipment
    ? message(
        locale,
        plan.equipment.mode === "visual"
          ? "planDetailsModeVisual"
          : "planDetailsModeImaging",
      )
    : null;
  const items = card.items;
  return {
    place: place
      ? [
          place,
          Number.isFinite(bortle)
            ? `${message(locale, "bortle")} ${Math.round(bortle)}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null,
    // A rig no profile names reads « Matériel à choisir », not the bare
    // mode.
    rig: mode
      ? [
          String(rigName || "").trim() ||
            message(locale, "tonightPlanEquipmentToChoose"),
          mode,
        ]
          .filter(Boolean)
          .join(" · ")
      : null,
    hours: [
      card.start && card.end && clock
        ? `${clock(card.start)} → ${clock(card.end)}`
        : null,
      targets,
    ]
      .filter(Boolean)
      .join(" · "),
    items: items.slice(0, planDetailsThumbnails),
    more:
      items.length > planDetailsThumbnails
        ? message(locale, "planHubMoreTargets").replace(
            "{count}",
            String(items.length - planDetailsThumbnails),
          )
        : null,
  };
}

const icons = {
  place: (
    <>
      <path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  rig: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v5.5M4.6 16.2l4.8-2.7M19.4 16.2l-4.8-2.7" />
    </>
  ),
  hours: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
};

/** The rows and thumbnails of "détails". */
export function PlanDetailsRows({
  locale,
  plan,
  clock,
  rigName,
  // The catalogue's rows by target id (`loadPlanTargetPictures`), read once
  // for the whole list: a plan keeps a snapshot without any image address.
  pictures = null,
}) {
  const words = planDetailsWords(locale, plan, { clock, rigName });
  const row = (kind, text) =>
    text ? (
      <p className="plan-details-row" data-row={kind}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {icons[kind]}
        </svg>
        <span>{text}</span>
      </p>
    ) : null;
  return (
    <div className="plan-details">
      {row("place", words.place)}
      {row("rig", words.rig)}
      {row("hours", words.hours)}
      {words.items.length > 0 && (
        <ul
          className="plan-details-targets"
          aria-label={message(locale, "planHubDetailsTargets")}
        >
          {words.items.map((item) => (
            <li key={item.key} aria-label={item.designation}>
              <TargetTile
                target={targetWithPicture(
                  item.target,
                  pictures?.get(item.target?.id),
                )}
                locale={locale}
              />
              <span aria-hidden="true">{item.designation}</span>
            </li>
          ))}
          {words.more && (
            <li className="plan-details-more" aria-hidden="true">
              <span>{words.more}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
