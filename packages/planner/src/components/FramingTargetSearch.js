"use client";

import { useEffect, useId, useRef, useState } from "react";
import { message } from "portal/i18n.js";
import { MissingObjectLink } from "../missing-object-slot.js";
import {
  decodeTargetIndex,
  formatFramingSearchMagnitude,
  formatFramingSearchSize,
  framingSearchDelayMs,
  framingSearchHighlight,
  framingSearchLabel,
  framingSearchPath,
  framingSearchQueryReady,
  framingSearchQueryText,
  framingSearchTarget,
  rankFramingSearchResults,
} from "../framing-target-search.js";

// A small magnifier on the map to search for a target, with a search field
// and a list of targets below. The panel the
// map's magnifier opens, and the chip that names the target it highlighted.
// The search is the catalogue's own (`framing-target-search.js` says how);
// what is here is only what a visitor sees and touches.

const idleAnswer = { status: "idle", query: "", results: [], total: 0 };

// The matched part of a line, in the accent colour.
function Highlighted({ text, query, locale }) {
  return framingSearchHighlight(text, query, locale).map((part, index) =>
    part.match ? <mark key={index}>{part.text}</mark> : part.text,
  );
}

function ResultRow({ entry, locale, onChoose, query }) {
  const { row, target } = entry;
  const kind = [row.typeLabel, row.constellationLabel].filter(Boolean);
  const size = formatFramingSearchSize(row.sizeArcmin, locale);
  const magnitude = formatFramingSearchMagnitude(row.magnitude, locale);
  const details = [
    magnitude
      ? message(locale, "plannerFramingSearchMagnitude").replace(
          "{value}",
          magnitude,
        )
      : "",
    size,
  ].filter(Boolean);
  return (
    <li>
      <button
        className="planner-framing-search-result"
        type="button"
        onClick={() => onChoose(target)}
      >
        <strong>
          <Highlighted locale={locale} query={query} text={row.designation} />
          {row.name && (
            <>
              {" · "}
              <Highlighted locale={locale} query={query} text={row.name} />
            </>
          )}
        </strong>
        {kind.length > 0 && (
          <span>
            {kind.map((part, index) => (
              <span key={part}>
                {index > 0 && " · "}
                <Highlighted locale={locale} query={query} text={part} />
              </span>
            ))}
          </span>
        )}
        {details.length > 0 && <small>{details.join(" · ")}</small>}
      </button>
    </li>
  );
}

export function FramingTargetSearchPanel({ locale, onChoose, onClose }) {
  const titleId = useId();
  const inputId = useId();
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const controllerRef = useRef(null);
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState(idleAnswer);

  const search = (value) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setAnswer((current) => ({ ...current, status: "loading" }));
    fetch(framingSearchPath({ locale, query: value }), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("target search unavailable");
        return response.json();
      })
      .then((document) => {
        const { total, targets } = decodeTargetIndex(document);
        const results = rankFramingSearchResults(targets, value, locale)
          .map((row) => ({ row, target: framingSearchTarget(row) }))
          .filter((entry) => entry.target);
        setAnswer({
          status: "ready",
          query: value.trim(),
          results,
          total,
        });
      })
      .catch((error) => {
        if (error.name !== "AbortError")
          setAnswer((current) => ({ ...current, status: "error" }));
      });
  };

  useEffect(() => {
    if (!framingSearchQueryReady(query)) {
      controllerRef.current?.abort();
      setAnswer(idleAnswer);
      return undefined;
    }
    const timer = window.setTimeout(() => search(query), framingSearchDelayMs);
    return () => window.clearTimeout(timer);
    // `search` only reads `locale`, which is part of what restarts the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, locale]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  // The keyboard goes straight to the field the panel opens on.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape closes the panel from the panel itself and from the editor around
  // it, but never from another dialog open above it (a sheet has its own
  // Escape, and one press must not close both).
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target;
      const inside = panelRef.current?.contains(target);
      const inEditor =
        target === document.body ||
        (target instanceof Element &&
          Boolean(target.closest(".planner-framing-editor-overlay")));
      if (!inside && !inEditor) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const trimmed = query.trim();
  const current = answer.status === "ready" && answer.query === trimmed;

  // Arrow keys walk the field and the results, the way a list of choices is
  // walked; Tab still visits every button in turn.
  const moveFocus = (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [
      inputRef.current,
      ...(listRef.current?.querySelectorAll("button") || []),
    ].filter(Boolean);
    const index = items.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next =
      event.key === "ArrowDown"
        ? Math.min(items.length - 1, index + 1)
        : Math.max(0, index - 1);
    items[next]?.focus();
  };

  const submit = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!framingSearchQueryReady(query)) return;
    // The answer on screen belongs to what was typed: the best result is
    // chosen. Otherwise the pause before the search is skipped instead.
    if (current && answer.results.length > 0)
      onChoose(answer.results[0].target);
    else search(query);
  };

  let statusText = "";
  if (!framingSearchQueryReady(query))
    statusText = message(locale, "plannerFramingSearchHint");
  else if (answer.status === "error")
    statusText = message(locale, "plannerFramingSearchError");
  else if (answer.status === "loading" || !current)
    statusText = message(locale, "plannerFramingSearchLoading");
  else if (answer.results.length === 0)
    statusText = message(locale, "plannerFramingSearchEmpty");
  else if (answer.total > answer.results.length)
    statusText = message(locale, "plannerFramingSearchMore")
      .replace("{shown}", String(answer.results.length))
      .replace("{total}", String(answer.total));

  return (
    <section
      aria-labelledby={titleId}
      aria-modal="false"
      className="planner-framing-search"
      onKeyDown={moveFocus}
      ref={panelRef}
      role="dialog"
    >
      <div className="planner-framing-search-heading">
        <h2 id={titleId}>{message(locale, "plannerFramingSearchTitle")}</h2>
        <button
          aria-label={message(locale, "plannerFramingSearchClose")}
          className="planner-framing-search-close"
          onClick={onClose}
          title={message(locale, "plannerFramingSearchClose")}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="planner-framing-search-field">
        <label className="visually-hidden" htmlFor={inputId}>
          {message(locale, "plannerFramingSearchLabel")}
        </label>
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="10.5" cy="10.5" r="6" />
          <path d="m15 15 5.5 5.5" />
        </svg>
        <input
          autoComplete="off"
          enterKeyHint="search"
          id={inputId}
          inputMode="search"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={submit}
          placeholder={message(locale, "plannerFramingSearchPlaceholder")}
          ref={inputRef}
          spellCheck={false}
          type="text"
          value={query}
        />
        {query && (
          <button
            aria-label={message(locale, "plannerFramingSearchClear")}
            className="planner-framing-search-clear"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            title={message(locale, "plannerFramingSearchClear")}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <line x1="17" y1="7" x2="7" y2="17" />
              <line x1="7" y1="7" x2="17" y2="17" />
            </svg>
          </button>
        )}
      </div>
      <p
        aria-live="polite"
        className="planner-framing-search-status"
        role="status"
      >
        {statusText}
      </p>
      {framingSearchQueryReady(query) &&
        current &&
        answer.results.length === 0 && (
          <div className="missing-object-framing-search">
            <MissingObjectLink locale={locale} query={trimmed} />
          </div>
        )}
      {answer.results.length > 0 && framingSearchQueryReady(query) && (
        <ul
          aria-busy={answer.status === "loading"}
          aria-label={message(locale, "plannerFramingSearchResults")}
          className="planner-framing-search-results"
          ref={listRef}
        >
          {answer.results.map((entry) => (
            <ResultRow
              entry={entry}
              key={entry.target.id}
              locale={locale}
              onChoose={onChoose}
              query={framingSearchQueryText(answer.query)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// The chip under the editor's top bar: the target on show, and the cross that
// takes the highlight off again ("a chip (name + cross) lets one remove
// the highlight").
export function FramingHighlightChip({ locale, onRemove, target }) {
  const label = framingSearchLabel(target);
  return (
    <div
      aria-label={message(locale, "plannerFramingHighlightGroup")}
      className="planner-framing-editor-highlight"
      role="group"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22" />
      </svg>
      <span title={label}>{label}</span>
      <button
        aria-label={message(locale, "plannerFramingHighlightRemove").replace(
          "{name}",
          target.designation || label,
        )}
        onClick={onRemove}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <line x1="17" y1="7" x2="7" y2="17" />
          <line x1="7" y1="7" x2="17" y2="17" />
        </svg>
      </button>
    </div>
  );
}
