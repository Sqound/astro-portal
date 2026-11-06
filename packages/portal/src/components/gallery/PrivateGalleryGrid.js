"use client";

import { useState } from "react";
import { message } from "../../i18n.js";
import { capturesCopyFor } from "../manage/captures-copy.js";
import { PersonalSkyMap } from "./PersonalSkyMap.js";
import {
  GalleryCaptureCard,
  GalleryFilterSummary,
  GalleryGrid,
  GalleryTools,
  mapTargetOf,
} from "./GalleryList.js";
import { localizedTag } from "./gallery-tags.js";
import { galleryPath } from "../../private-gallery/gallery-paths.js";
import { privateItemAsPublic } from "../../private-gallery/public-shape.js";

/**
 * The list of the private gallery: the public gallery's list — its filter bar with the
 * search, the date sort and the sky map, its counter line, its cards
 * (`GalleryList.js`) — fed with the gallery's captures in the public shape
 * (`privateItemAsPublic`), their files through the gallery's gate. What is the
 * private gallery's own stays: the bar's chips are « Toutes », then the
 * generic tags of the captures shown (derived from their target's object type,
 * as the public gallery's), then the owner's own tags (free text, written as
 * typed); a capture without a target is named by its file; the counter says
 * « captures », not « captures publiques ». Choosing a tag, searching and
 * sorting happen in the browser and change neither the address nor anything a
 * search engine reads (the gallery is never indexed).
 */

/**
 * The chips of the bar after « Toutes »: the generic tags in their order,
 * translated, then the owner's own tags in theirs; a word shown twice (an
 * own tag that reads as a generic one) is one chip.
 */
export function galleryTagChips(view, locale) {
  const chips = [];
  for (const tag of view?.tags ?? []) {
    const label = localizedTag(tag, locale);
    if (!chips.includes(label)) chips.push(label);
  }
  for (const tag of view?.ownTags ?? [])
    if (!chips.includes(tag)) chips.push(tag);
  return chips;
}

/** The captures a chip keeps (every capture for « Toutes », `""`). */
export function capturesWithTag(captures, chip, locale) {
  if (!chip) return captures;
  return captures.filter(
    (item) =>
      (item.tags ?? []).some((tag) => localizedTag(tag, locale) === chip) ||
      (item.ownTags ?? []).includes(chip),
  );
}

const fold = (text) =>
  String(text ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();

/**
 * The captures whose title, names, alias, file name or tags hold what was
 * searched (case and accents aside); every capture for an empty search.
 */
export function capturesMatching(captures, query, locale) {
  const needle = fold(query).trim();
  if (!needle) return captures;
  return captures.filter((item) =>
    fold(
      [
        ...(item.targets ?? []).flatMap((target) => [
          target.designation,
          target.name,
          ...(target.aliases ?? []),
        ]),
        item.fileName,
        ...(item.tags ?? []).map((tag) => localizedTag(tag, locale)),
        ...(item.ownTags ?? []),
      ].join(" "),
    ).includes(needle),
  );
}

export function PrivateGalleryGrid({ locale = "en", token, view }) {
  const [chip, setChip] = useState("");
  const [query, setQuery] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);
  const [mode, setMode] = useState("gallery");
  const captures = view?.captures ?? [];
  const chips = galleryTagChips(view, locale);
  const kept = capturesMatching(
    capturesWithTag(captures, chip, locale),
    query,
    locale,
  );
  // The service answers the newest first.
  const shown = newestFirst ? kept : [...kept].reverse();
  const noTarget = capturesCopyFor(locale).noTarget;
  const cards = shown.map((item) => ({
    capture: privateItemAsPublic({
      token,
      item,
      publicName: view?.publicName,
    }),
    // A capture without a target is named by its file.
    noTarget: item.fileName || noTarget,
    href: `${galleryPath(locale, token)}/${encodeURIComponent(item.id)}`,
  }));
  return (
    <>
      <div className="page-navigation gallery-page-navigation">
        <GalleryTools
          locale={locale}
          filters={chips.map((value) => ({ value, label: value }))}
          activeFilter={chip}
          onFilter={setChip}
          query={query}
          onQuery={setQuery}
          newestFirst={newestFirst}
          onSort={() => setNewestFirst((value) => !value)}
          view={mode}
          onView={setMode}
        />
        <GalleryFilterSummary
          locale={locale}
          count={shown.length}
          total={captures.length}
          noun={message(locale, "galleryCaptures")}
        />
      </div>
      {mode === "map" ? (
        <PersonalSkyMap
          locale={locale}
          targets={cards.map(({ capture, noTarget: name, href }) =>
            mapTargetOf(capture, { href, noTarget: name }),
          )}
        />
      ) : (
        <GalleryGrid>
          {cards.map(({ capture, noTarget: name, href }) => (
            <GalleryCaptureCard
              key={capture.id}
              capture={capture}
              locale={locale}
              noTarget={name}
              href={href}
            />
          ))}
        </GalleryGrid>
      )}
    </>
  );
}
