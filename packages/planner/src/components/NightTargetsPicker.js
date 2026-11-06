"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { message } from "portal/i18n.js";
import { BrandLoader } from "portal/components/BrandLoader.js";
import { TargetTile } from "portal/components/ObjectPictogram.js";
import { clockText } from "portal/written-forms.js";
import { framingSearchHighlight } from "../framing-target-search.js";
import {
  decodePersonalTargets,
  nextActiveIndex,
  nightFramingHref,
  nightTargetsAnswer,
  nightTargetsDelayMs,
  nightTargetsPath,
  nightTargetsQueryReady,
  nightTargetsRows,
  nightTargetsSlowAfterMs,
  nightTargetsState,
  personalNightEntries,
} from "../night-targets-search.js";
import {
  visibleTargetFromLibrary,
  visibleTargetsPool,
  visibleTargetsRows,
  visibleTargetsSpan,
} from "../visible-targets.js";
import {
  MissingObjectContext,
  MissingObjectLink,
  missingObjectAvailable,
} from "../missing-object-slot.js";

// The search of the "Cibles" row of a night's page (`night-targets-search.js`
// says why and how). The field the person types in, the list of at most eight
// labelled targets under it (preview, designation and name, "type ·
// constellation"; the space's own targets first), one line that says what the
// field is doing, and as the last row "Créer un cadrage sur la carte…".
// The rows are list items, not
// buttons of a zone; "Demander cet objet" is a link.

const idleAnswer = {
  status: "idle",
  query: "",
  entries: [],
  total: 0,
  slow: false,
};

function Highlighted({ text, query, locale }) {
  return framingSearchHighlight(text, query, locale).map((part, index) =>
    part.match ? <mark key={index}>{part.text}</mark> : part.text,
  );
}

/** Where the night's missing-object request is offered: for a signed-in space. */
function useMissingObjectContext() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/auth/status")
      .then((response) => (response.ok ? response.json() : null))
      .then((auth) => {
        if (live) setAvailable(missingObjectAvailable(auth));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return {
    available,
    signedIn: true,
    signInHref: "/auth/sign-in",
    signInLabel: "",
  };
}

/**
 * The pool of "Visibles cette nuit-là": the catalogue's Essentielles and the
 * person's favourites, read from the routes the planner already uses
 * (`/api/planner-targets`, `/api/target-favorites`, `/api/target-library`),
 * `ra` in hours. Whatever cannot be read is left out: the list is then shorter
 * or absent, never an error.
 */
async function readVisiblePool({ locale, latitude, signal }) {
  const json = async (path) => {
    try {
      const response = await fetch(path, { signal });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  };
  const essentials = await json(
    `/api/planner-targets?${new URLSearchParams({
      locale,
      selection: "best",
      latitude: String(latitude),
    })}`,
  );
  const favorites = [];
  const ids = await json("/api/target-favorites");
  if (
    ids &&
    [...(ids.photoTargetIds ?? []), ...(ids.visualTargetIds ?? [])].length
  )
    for (let offset = 0; offset < 480; offset += 48) {
      const page = await json(
        `/api/target-library?${new URLSearchParams({
          locale,
          favorites: "1",
          limit: "48",
          offset: String(offset),
        })}`,
      );
      for (const target of page?.targets ?? [])
        favorites.push(visibleTargetFromLibrary(target));
      if (!page || offset + 48 >= (page.total ?? 0)) break;
    }
  return visibleTargetsPool(
    (essentials?.targets ?? []).map((target) =>
      visibleTargetFromLibrary(target, { degrees: true }),
    ),
    favorites,
  );
}

function Row({
  entry,
  id,
  active,
  query,
  locale,
  onChoose,
  focusable = false,
}) {
  const kind = entry.personal
    ? [message(locale, "nightPageTargetsPersonal"), entry.kind]
        .filter(Boolean)
        .join(" · ")
    : entry.kind;
  return (
    <li role="presentation">
      <button
        type="button"
        id={id}
        role="option"
        aria-selected={active}
        tabIndex={focusable ? 0 : -1}
        className={`night-target-option${active ? " is-active" : ""}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onChoose(entry)}
      >
        <TargetTile
          className="night-target-tile"
          locale={locale}
          target={{ typeKey: entry.typeKey, designation: entry.designation }}
          previewUrl={entry.photoUrl}
        />
        <span className="night-target-option-text">
          <strong>
            <Highlighted
              locale={locale}
              query={query}
              text={entry.designation}
            />
            {entry.name ? (
              <>
                {" · "}
                <Highlighted locale={locale} query={query} text={entry.name} />
              </>
            ) : null}
          </strong>
          {kind ? (
            <span className="night-field-option-note">{kind}</span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

/**
 * What the field says and lists under the input, for a state of
 * `nightTargetsState`: the line (the hint, the wait with the star, the wait
 * that lasts, nothing found, the search unavailable, "N sur M"), the way to
 * ask for a missing object, the rows and the last row, "Créer un cadrage sur
 * la carte…". Pure: the states are rendered from it as they are.
 */
export function NightTargetsPanel({
  locale,
  sessionId,
  state,
  query = "",
  rows = [],
  shown = 0,
  total = 0,
  active = -1,
  listId = "night-targets",
  onChoose = () => {},
}) {
  const waiting = state === "loading" || state === "slow";
  let status = null;
  if (state === "hint") status = message(locale, "nightPageTargetsHint");
  else if (state === "error")
    status = message(locale, "plannerFramingSearchError");
  else if (state === "empty")
    status = message(locale, "nightPageTargetsEmpty").replace("{query}", query);
  else if (state === "more")
    status = message(locale, "plannerFramingSearchMore")
      .replace("{shown}", String(shown))
      .replace("{total}", String(total));

  return (
    <>
      <p
        className={`night-field-hint night-targets-status${waiting ? " is-waiting" : ""}`}
        data-state={state}
        role="status"
        aria-live="polite"
      >
        {waiting ? (
          <>
            <BrandLoader className="night-targets-loader" size={18} />
            <span>
              {message(
                locale,
                state === "slow"
                  ? "nightPageTargetsSlow"
                  : "plannerFramingSearchLoading",
              )}
            </span>
          </>
        ) : (
          status
        )}
      </p>
      {state === "empty" ? (
        <div className="night-targets-missing">
          <MissingObjectLink locale={locale} query={query} />
        </div>
      ) : null}
      <div className="night-field-options night-target-options">
        <ul
          id={listId}
          role="listbox"
          aria-label={message(locale, "plannerFramingSearchResults")}
          aria-busy={waiting || undefined}
        >
          {rows.map((entry, index) => (
            <Row
              key={entry.id}
              entry={entry}
              id={`${listId}-row-${index}`}
              active={index === active}
              query={query}
              locale={locale}
              onChoose={onChoose}
            />
          ))}
        </ul>
        {sessionId ? (
          <a
            className="night-field-option is-map"
            href={nightFramingHref({ locale, sessionId })}
          >
            {message(locale, "nightPageTargetsFraming")}
          </a>
        ) : null}
      </div>
    </>
  );
}

/**
 * "Visibles cette nuit-là": the targets that were high during the session,
 * the highest first, each with "hauteur max 62° · 23:40" (UTC: the place has
 * no time zone). Rows are list items, not buttons of a zone (UI rule: the
 * list of a search).
 */
export function VisibleThatNight({ locale, rows, onChoose = () => {} }) {
  const title = message(locale, "sessionAddTargetVisible");
  return (
    <section className="night-targets-visible" aria-label={title}>
      <h4 className="night-targets-visible-title">{title}</h4>
      <div className="night-field-options night-target-options">
        <ul role="listbox" aria-label={title}>
          {rows.map((row) => (
            <Row
              key={row.id}
              entry={{
                id: row.id,
                designation: row.designation,
                name: row.name,
                typeKey: row.typeKey,
                photoUrl: row.photoUrl,
                kind: message(locale, "sessionAddTargetVisibleRow")
                  .replace("{altitude}", String(Math.round(row.maxAltitude)))
                  .replace(
                    "{time}",
                    clockText(new Date(row.at).toISOString(), "UTC"),
                  ),
                personal: false,
              }}
              id={`visible-${row.id}`}
              active={false}
              query=""
              locale={locale}
              onChoose={onChoose}
              focusable
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * `excludeIds`: the targets already on the night, never offered again.
 * `onPick({ id, designation })`: a row was chosen. `sessionId`: the night
 * the "cadrage" row leads back to. `visibleFor` (see `visible-targets.js`):
 * where and when the session happened,
 * `{ planPlace, recordedPlace, date, start, end, darkness }`; with it, and
 * while nothing is typed, "Visibles cette nuit-là" lists the Essentielles
 * and the favourites that were high; without it, the search stays alone.
 */
export function NightTargetsPicker({
  locale,
  sessionId,
  excludeIds = [],
  visibleFor = null,
  onPick,
}) {
  const listId = useId();
  const inputRef = useRef(null);
  const controllerRef = useRef(null);
  const slowRef = useRef(null);
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState(idleAnswer);
  const [personal, setPersonal] = useState([]);
  const [active, setActive] = useState(-1);
  const missingObject = useMissingObjectContext();
  const [visiblePool, setVisiblePool] = useState([]);
  // What the session was: its place, its night, its hours (plain data from the
  // page, which does not import the planner).
  const visibleKey = visibleFor ? JSON.stringify(visibleFor) : "";
  const visibleSpan = useMemo(
    () => (visibleFor ? visibleTargetsSpan(visibleFor) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleKey],
  );

  // "Visibles cette nuit-là": the pool is read once for the place.
  const latitude = visibleSpan?.place?.latitude ?? null;
  useEffect(() => {
    if (latitude === null) return undefined;
    const controller = new AbortController();
    readVisiblePool({ locale, latitude, signal: controller.signal })
      .then((pool) => {
        if (!controller.signal.aborted) setVisiblePool(pool);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [latitude, locale]);
  const visibleRows = useMemo(
    () =>
      visibleSpan
        ? visibleTargetsRows({
            pool: visiblePool,
            span: visibleSpan,
            taken: excludeIds,
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visiblePool, visibleSpan, excludeIds.join("\u0000")],
  );

  // The space's own targets: read once; a refusal leaves the list to the catalogue.
  useEffect(() => {
    let live = true;
    fetch("/api/v1/targets/personal")
      .then((response) => (response.ok ? response.json() : null))
      .then((document) => {
        if (live) setPersonal(decodePersonalTargets(document));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const stop = () => {
    controllerRef.current?.abort();
    window.clearTimeout(slowRef.current);
  };

  const search = (value) => {
    stop();
    const controller = new AbortController();
    controllerRef.current = controller;
    setAnswer({ ...idleAnswer, status: "loading", query: value.trim() });
    slowRef.current = window.setTimeout(
      () => setAnswer((current) => ({ ...current, slow: true })),
      nightTargetsSlowAfterMs,
    );
    fetch(nightTargetsPath({ locale, query: value }), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("target search unavailable");
        return response.json();
      })
      .then((document) => {
        window.clearTimeout(slowRef.current);
        const { total, entries } = nightTargetsAnswer(document, value, locale);
        setAnswer({
          status: "ready",
          query: value.trim(),
          entries,
          total,
          slow: false,
        });
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        window.clearTimeout(slowRef.current);
        setAnswer({
          ...idleAnswer,
          status: "error",
          query: value.trim(),
        });
      });
  };

  useEffect(() => {
    setActive(-1);
    if (!nightTargetsQueryReady(query)) {
      stop();
      setAnswer(idleAnswer);
      return undefined;
    }
    const timer = window.setTimeout(() => search(query), nightTargetsDelayMs);
    return () => window.clearTimeout(timer);
    // `search` only reads `locale`, which restarts the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, locale]);

  useEffect(() => stop, []);

  // The keyboard goes straight to the field the row opens on.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const trimmed = query.trim();
  const current = answer.status === "ready" && answer.query === trimmed;
  const rows = nightTargetsRows({
    personal: personalNightEntries(personal, query, locale),
    catalogue: current ? answer.entries : [],
    excludeIds,
  });
  const state = nightTargetsState({ query, answer, rowCount: rows.length });
  const rowId = (index) => `${listId}-row-${index}`;

  useEffect(() => {
    if (active < 0) return;
    const element = document.getElementById(rowId(active));
    if (element && typeof element.scrollIntoView === "function")
      element.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const choose = (entry) => {
    onPick({ id: entry.id, designation: entry.designation });
    setQuery("");
    setActive(-1);
    inputRef.current?.focus();
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!rows.length) return;
      event.preventDefault();
      setActive((index) => nextActiveIndex(index, event.key, rows.length));
      return;
    }
    if (event.key === "Enter") {
      // Never the form's: the field's own "Enregistrer" is a button.
      event.preventDefault();
      if (!nightTargetsQueryReady(query)) return;
      // The answer on screen belongs to what was typed: the best row is
      // chosen. Otherwise the pause before the search is skipped instead.
      const entry = rows[active >= 0 ? active : 0];
      if (entry && (active >= 0 || current)) choose(entry);
      else search(query);
      return;
    }
    // A first Escape puts the list away; the field's own Escape (cancel) is
    // for the next one.
    if (event.key === "Escape" && query) {
      event.stopPropagation();
      setQuery("");
    }
  };

  const open = rows.length > 0;
  return (
    <MissingObjectContext.Provider value={missingObject}>
      <div className="night-targets-picker">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          className="night-field-input"
          value={query}
          maxLength={120}
          data-autofocus=""
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-label={message(locale, "nightPageTargetsSearch")}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? rowId(active) : undefined}
          placeholder={message(locale, "plannerFramingSearchPlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {!trimmed && visibleRows.length ? (
          <VisibleThatNight
            locale={locale}
            rows={visibleRows}
            onChoose={choose}
          />
        ) : null}
        <NightTargetsPanel
          locale={locale}
          sessionId={sessionId}
          state={state}
          query={trimmed}
          rows={rows}
          shown={answer.entries.length}
          total={answer.total}
          active={active}
          listId={listId}
          onChoose={choose}
        />
      </div>
    </MissingObjectContext.Provider>
  );
}
