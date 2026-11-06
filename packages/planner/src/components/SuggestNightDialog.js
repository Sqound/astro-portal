"use client";
import { useEffect, useRef, useState } from "react";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { suggestMessage } from "../suggest-messages.js";
import {
  SUGGEST_RECOMPUTE_DELAY,
  suggestChainRequest,
  suggestDialogModel,
  suggestPlacementRequest,
  suggestRecountRequest,
  suggestShownItems,
  suggestTimelineNumbers,
  suggestVisibleTicks,
  suggestionCount,
  suggestionDefaults,
  suggestionPlacements,
} from "../suggest-dialog-model.js";
import { suggestionSeed } from "../suggestion-seed.js";
import { observationComfortRanges } from "../observation-comfort.js";
import { autoFillTargetName } from "../auto-fill-copy.js";
import { scoreOn100 } from "portal/written-forms.js";
import { BrandLoader } from "portal/components/BrandLoader.js";
import {
  FilterBadges,
  FiltersButton,
} from "portal/components/filters/FilterControls.js";
import { message } from "portal/i18n.js";

export function SuggestTimeline({ proposal, model }) {
  const width = 324,
    left = 6,
    scale =
      312 / (proposal.window.endMinute - proposal.window.startMinute || 1);
  const x = (minute) => left + (minute - proposal.window.startMinute) * scale;
  // Every box is drawn; a number is written only where it does not touch the
  // one before it.
  const written = new Set(
    suggestTimelineNumbers(
      model.items.filter((entry) => entry.selected),
      (entry) => x((entry.startMinute + entry.endMinute) / 2),
    ).map((label) => label.number),
  );
  return (
    <svg
      className="planner-autofill-frise"
      viewBox={`0 0 ${width} 66`}
      role="img"
      aria-label={model.timelineLabel}
    >
      <rect className="is-night" x="6" y="8" width="312" height="32" rx="8" />
      {model.items
        .filter((entry) => entry.selected)
        .map((entry) => (
          <g
            key={entry.target.id}
            className={`planner-autofill-box ${entry.number % 2 ? "is-odd" : "is-even"}`}
          >
            <rect
              x={x(entry.startMinute) + 1}
              y="8"
              width={Math.max(
                2,
                (entry.endMinute - entry.startMinute) * scale - 2,
              )}
              height="32"
              rx="8"
            />
            {written.has(entry.number) && (
              <text
                className="is-number"
                x={x((entry.startMinute + entry.endMinute) / 2)}
                y="28"
              >
                {entry.number}
              </text>
            )}
          </g>
        ))}
      {model.free.map((slot) => (
        <g key={slot.startMinute}>
          <rect
            className="is-free-slot"
            x={x(slot.startMinute) + 1}
            y="8"
            width={Math.max(2, (slot.endMinute - slot.startMinute) * scale - 2)}
            height="32"
            rx="8"
          />
          {(slot.endMinute - slot.startMinute) * scale > 35 && (
            <text
              className="is-free-label"
              x={x((slot.startMinute + slot.endMinute) / 2)}
              y="28"
            >
              {suggestMessage(model.locale, "autoFillLegendFree")}
            </text>
          )}
        </g>
      ))}
      <g className="is-times">
        {suggestVisibleTicks(model.timelineTicks, (tick) =>
          Math.max(22, Math.min(302, x(tick.minute))),
        ).map((tick) => (
          <text
            key={tick.minute}
            x={Math.max(22, Math.min(302, x(tick.minute)))}
            y="60"
          >
            {tick.label}
          </text>
        ))}
      </g>
    </svg>
  );
}

// The proportions of the five counts: 1fr 1fr 1fr 2fr 1.35fr.
const countValues = (defaults) => [...defaults.segments, "all", "custom"];

// One
// dialog, one step — the place and the rig, "Combien de cibles ?", and
// right under it the timeline and the list of the current count, recomputed
// in place when the count changes. The one primary is in the footer, worded
// by the caller. The caller alone writes the open plan.
//
// "Placement", "Idéal | Rapproché",
// under the estimate and above the timeline. It opens on the plan's mode
// default (`suggestionDefaults`: visual "Rapproché", photo "Idéal"), at
// every opening; a choice made by hand lasts while the dialog is open and
// recomputes in place, as a count does. In "Rapproché" the ticked targets
// are chained again at every tick, so that the hours shown are the hours
// `onApply(ids, placement)` adds.
export function SuggestNightDialog({
  proposal: initial,
  propose,
  locale = "en",
  timeZone,
  contextLine,
  equipmentLine,
  visual = false,
  seedInputs = {},
  onApply,
  onClose,
  onChange,
  onOpenPlans,
  onNextNight,
  nextNightDate = null,
  planCount = 0,
  alreadyInPlanIds = [],
  renderVisual,
  // The words that qualify every thumbnail of the list (the eyepiece view is
  // a simulation), said once under it.
  visualNote = null,
  filterAdviceFor,
  renderFooter,
  suspended = false,
  // « Observation confortable », offered by the
  // entry whose proposals and plan are made with it (`{ family, on }`, the
  // instrument's family from `observationComfortFamily`); `null` hides the
  // switch. `onComfort(on)` keeps the choice before the list is made again.
  comfort = null,
  onComfort = () => {},
  // The bar « Filtres » between the
  // place and « Combien de cibles ? » — `{ badges, onOpen, onReset }`
  // (`suggestFilterBadges`); `null` hides it. The page keeps the filters and
  // makes the list again.
  filters = null,
}) {
  const defaults = suggestionDefaults(visual);
  const opening = Number.isInteger(initial.requested)
    ? suggestionCount(initial.requested)
    : defaults.count;
  const [count, setCount] = useState(opening),
    [all, setAll] = useState(initial.requested === "all"),
    [custom, setCustom] = useState(
      initial.requested !== "all" && !defaults.segments.includes(opening),
    );
  const [proposal, setProposal] = useState(initial);
  const [selected, setSelected] = useState(
    () => new Set(initial.items.map((entry) => entry.target.id)),
  );
  // The placement chosen, and the one the proposal on screen was made for (a
  // choice waits `SUGGEST_RECOMPUTE_DELAY` before its list is made again);
  // `chain` is the chain over the ticked targets, `null` while the proposal
  // on screen is the chain.
  const [placement, setPlacement] = useState(defaults.placement),
    [proposalPlacement, setProposalPlacement] = useState(defaults.placement),
    [chain, setChain] = useState(null);
  const [tier, setTier] = useState(
    Math.floor(((initial.position?.from || 1) - 1) / 10) + 1,
  );
  const [excludeCaptured, setExcludeCaptured] = useState(false),
    [exhausted, setExhausted] = useState(false),
    [recomputing, setRecomputing] = useState(false),
    [info, setInfo] = useState(null);
  const [captured] = useState(initial.captured || []);
  const [comfortOn, setComfortOn] = useState(Boolean(comfort?.on));
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const say = (key, values) => suggestMessage(locale, key, values);
  const [proposalCount, setProposalCount] = useState(
    initial.requested === "all" ? "all" : opening,
  );
  const model = {
    ...suggestDialogModel({
      proposal,
      selected,
      locale,
      timeZone,
      visual,
      placement: proposalPlacement,
      chain,
      planCount,
      filtered: Boolean(filters?.badges?.length),
    }),
    locale,
  };
  // The state the delayed recompute reads when it fires.
  const latest = useRef(null);
  latest.current = {
    proposal,
    selected,
    excludeCaptured,
    tier,
    count,
    all,
    placement,
    proposalPlacement,
    proposalCount,
    chain,
  };
  // "Rapproché": the chain over the `ticks`, made again at once (pure);
  // a ticked target the chain cannot place is not added, so it is unticked.
  function chained(next, ticks, nextTier) {
    const made = propose(
      suggestChainRequest({
        proposal: next,
        selected: ticks,
        tier: nextTier,
      }),
    );
    if (!made) return { chain: null, selected: ticks };
    const placed = new Set(made.items.map((entry) => entry.target.id));
    return {
      chain: made,
      selected: new Set([...ticks].filter((id) => placed.has(id))),
    };
  }
  // The proposal `next` is on screen, made for `placementValue`: its targets
  // ticked (or, when only the slots were made again, the ticks kept).
  function install(next, { placementValue, nextTier, ticks = null }) {
    const ids = next.items.map((entry) => entry.target.id);
    const ticked = ticks
      ? new Set(ids.filter((id) => ticks.has(id)))
      : new Set(ids);
    const state =
      placementValue === "chained"
        ? chained(next, ticked, nextTier)
        : { chain: null, selected: ticked };
    setProposal(next);
    setSelected(state.selected);
    setChain(state.chain);
    setProposalPlacement(placementValue);
    return { proposal: next, ...state };
  }
  const shownTicked = (now) =>
    suggestShownItems({
      proposal: now.proposal,
      chain: now.chain,
      selected: now.selected,
      placement: now.proposalPlacement,
    }).filter((entry) => now.selected.has(entry.target.id));
  function load({
    refresh = false,
    best = false,
    capturedValue = excludeCaptured,
  } = {}) {
    const nextTier = best ? 1 : refresh ? tier + 1 : tier;
    const next = propose({
      count: all ? "all" : count,
      tier: nextTier,
      excludeCaptured: capturedValue,
      placement,
      kept: refresh ? shownTicked(latest.current) : [],
      excluded: refresh
        ? proposal.items
            .filter((entry) => !selected.has(entry.target.id))
            .map((entry) => entry.target.id)
        : [],
      seed: refresh
        ? suggestionSeed({ ...seedInputs, tier: nextTier })
        : undefined,
    });
    setExhausted(
      refresh && next.items.every((entry) => selected.has(entry.target.id)),
    );
    install(next, { placementValue: placement, nextTier });
    setProposalCount(all ? "all" : count);
    setTier(nextTier);
    setExcludeCaptured(capturedValue);
  }
  // A new count recomputes the list in place after a short wait (the
  // − and + of "Autre" touched in a row compute once); the ticked targets
  // stay ticked (`suggestRecountRequest`). A new placement too —
  // "Idéal" the same targets with their slots made again, "Rapproché" a
  // chain made again without the unticked ones.
  function recompute() {
    const now = latest.current;
    const wanted = now.all ? "all" : now.count;
    let state = now;
    if (now.proposalPlacement !== now.placement) {
      const placed = propose(
        suggestPlacementRequest({
          proposal: now.proposal,
          count: wanted,
          tier: now.tier,
          placement: now.placement,
          selected: now.selected,
          excludeCaptured: now.excludeCaptured,
        }),
      );
      if (placed) {
        // A chain made again is ticked whole.
        state = install(placed, {
          placementValue: now.placement,
          nextTier: now.tier,
          ticks: now.placement === "chained" ? null : now.selected,
        });
        state = { ...now, ...state, proposalPlacement: now.placement };
      }
      if (!placed || now.proposalCount === wanted) {
        setExhausted(false);
        setRecomputing(false);
        return;
      }
    }
    const next = propose(
      suggestRecountRequest({
        proposal: state.proposal,
        selected: state.selected,
        chain: state.chain,
        placement: now.placement,
        count: wanted,
        excludeCaptured: now.excludeCaptured,
        tier: now.tier,
      }),
    );
    install(next, { placementValue: now.placement, nextTier: now.tier });
    setProposalCount(wanted);
    setExhausted(false);
    setRecomputing(false);
  }
  function schedule() {
    setRecomputing(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(recompute, SUGGEST_RECOMPUTE_DELAY);
  }
  function choose({ nextCount = count, nextAll = false, nextCustom = false }) {
    setCount(nextCount);
    setAll(nextAll);
    setCustom(nextCustom);
    schedule();
  }
  const choosePlacement = (value) => {
    if (value === placement) return;
    setPlacement(value);
    schedule();
  };
  const toggle = (id) => {
    const ticks = new Set(selected);
    if (!ticks.delete(id)) ticks.add(id);
    if (proposalPlacement !== "chained") return setSelected(ticks);
    const state = chained(proposal, ticks, tier);
    setSelected(state.selected);
    setChain(state.chain);
  };
  if (suspended) return null;
  const nothing = !proposal.items.length;
  return (
    <>
      <WebDialog
        className="planner-autofill-dialog planner-suggest-dialog"
        bodyClassName="planner-autofill-body"
        closeLabel={say("autoFillClose")}
        onClose={onClose}
        title={say("suggestAction")}
        focusTitle
        footerClassName="planner-autofill-footer"
        footer={
          nothing ? null : renderFooter ? (
            renderFooter({
              selected: new Set(selected),
              onClose,
              busy: recomputing,
              placement,
            })
          ) : (
            <>
              <p className="planner-autofill-later">{say("autoFillLater")}</p>
              <div className="planner-autofill-actions">
                <button className="btn-link" type="button" onClick={onClose}>
                  {say("autoFillCancel")}
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  disabled={!selected.size || recomputing}
                  onClick={() =>
                    onApply(
                      proposal.items
                        .map((entry) => entry.target.id)
                        .filter((id) => selected.has(id)),
                      placement,
                    )
                  }
                >
                  {selected.size === 1
                    ? say("suggestApplyOne")
                    : say("suggestApply", { count: selected.size })}
                </button>
              </div>
            </>
          )
        }
      >
        <SuggestNightContent
          locale={locale}
          visual={visual}
          proposal={proposal}
          model={model}
          contextLine={contextLine}
          equipmentLine={equipmentLine}
          count={count}
          all={all}
          custom={custom}
          placement={placement}
          recomputing={recomputing}
          tier={tier}
          exhausted={exhausted}
          excludeCaptured={excludeCaptured}
          captured={captured}
          renderVisual={renderVisual}
          visualNote={visualNote}
          filterAdviceFor={filterAdviceFor}
          onChange={onChange}
          onClose={onClose}
          onOpenPlans={onOpenPlans}
          onNextNight={onNextNight}
          nextNightDate={nextNightDate}
          planCount={planCount}
          alreadyInPlanIds={alreadyInPlanIds}
          onInfo={setInfo}
          onToggle={toggle}
          onCount={(value) => {
            if (value === "all") {
              if (!all) choose({ nextAll: true });
            } else if (value === "custom") {
              if (all) choose({ nextCustom: true });
              else setCustom(true);
            } else if (all || custom || value !== count)
              choose({ nextCount: value });
          }}
          onStep={(delta) =>
            choose({
              nextCount: suggestionCount(count + delta),
              nextCustom: true,
            })
          }
          onPlacement={choosePlacement}
          onLoad={load}
          comfort={visual ? comfort : null}
          comfortOn={comfortOn}
          onComfort={(on) => {
            // Kept first: the list made again right after reads it.
            onComfort(on);
            setComfortOn(on);
            load();
          }}
          filters={filters}
        />
      </WebDialog>
      {info && (
        <WebDialog
          className="planner-suggest-info"
          title={
            info === "estimate"
              ? say("suggestEstimateHint")
              : info === "placement"
                ? say("suggestPlacementHint")
                : say("suggestWhy", { count: proposal.requested })
          }
          closeLabel={say("autoFillClose")}
          onClose={() => setInfo(null)}
          footer={
            <button
              className="btn-link"
              type="button"
              onClick={() => setInfo(null)}
            >
              {say("autoFillClose")}
            </button>
          }
        >
          {info === "estimate" ? (
            <p>{model.estimateDetail}</p>
          ) : info === "placement" ? (
            <p>{say("suggestPlacementDetail")}</p>
          ) : (
            <ul>
              {model.shortfallDetail.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </WebDialog>
      )}
    </>
  );
}

// The body of the dialog, without its frame (rendered alone by the tests):
// the count, then the result of the current count right under it.
export function SuggestNightContent({
  locale = "en",
  visual = false,
  proposal,
  model,
  contextLine,
  equipmentLine,
  count,
  all = false,
  custom = false,
  placement = suggestionDefaults(visual).placement,
  recomputing = false,
  tier = 1,
  exhausted = false,
  excludeCaptured = false,
  captured = [],
  renderVisual,
  visualNote = null,
  // `(Entry) => string | null`, the line "Filtre conseillé : …" of a visual
  // target that needs a filter (the entry's target is reduced to its names;
  // the caller holds the catalogue's card).
  filterAdviceFor,
  onChange,
  onClose,
  onOpenPlans,
  onNextNight,
  nextNightDate = null,
  planCount = 0,
  alreadyInPlanIds = [],
  onInfo = () => {},
  onToggle = () => {},
  onCount = () => {},
  onStep = () => {},
  onPlacement = () => {},
  onLoad = () => {},
  comfort = null,
  comfortOn = false,
  onComfort = () => {},
  filters = null,
}) {
  const say = (key, values) => suggestMessage(locale, key, values);
  const defaults = suggestionDefaults(visual);
  const nothing = !proposal.items.length;
  const allTicked =
    proposal.items.length > 0 && model.items.every((entry) => entry.selected);
  const position = proposal.position || { from: 1, to: 10 };
  const range = { from: position.from, to: position.to };
  const searchingCount = all ? proposal.estimate?.count || 0 : count;
  const searching = recomputing && (
    <p className="planner-suggest-searching" role="status">
      <BrandLoader size={24} />
      <span>
        {searchingCount === 1
          ? say("suggestSearchingOne")
          : say("suggestSearching", { count: searchingCount })}
      </span>
    </p>
  );
  const captureText = !captured.length
    ? ""
    : captured.length === 1
      ? say(visual ? "suggestCapturedVisual" : "suggestCapturedPhoto", {
          name: autoFillTargetName(captured[0].target).designation,
          date: new Intl.DateTimeFormat(locale, {
            day: "numeric",
            month: "short",
            timeZone: "UTC",
          }).format(new Date(`${captured[0].date}T12:00:00Z`)),
        })
      : say(visual ? "suggestCapturedManyVisual" : "suggestCapturedManyPhoto", {
          count: captured.length,
        });
  // The one primary of the empty state, if it leads somewhere: the next
  // night where the night is short, the plan where the plan fills it.
  let nothingPrimary = null;
  if (model.nothingCause === "filters" && filters) {
    // SUGGEST-FILTERS-01: « Élargir » opens the filters; nothing is taken
    // off on its own.
    nothingPrimary = {
      testId: "suggest-filters-widen",
      onClick: filters.onOpen,
      label: message(locale, "suggestFiltersWiden"),
    };
  } else if (
    (model.nothingCause === "nightEnding" ||
      model.nothingCause === "nightShort") &&
    onNextNight &&
    nextNightDate
  ) {
    nothingPrimary = {
      testId: "suggest-next-night",
      onClick: onNextNight,
      label: say("suggestNextNight", {
        date: new Intl.DateTimeFormat(locale, {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        }).format(new Date(`${nextNightDate}T12:00:00Z`)),
      }),
    };
  } else if (model.nothingCause === "planFull" && onOpenPlans) {
    nothingPrimary = {
      testId: "suggest-open-plan",
      onClick: onOpenPlans,
      label: say(planCount > 1 ? "suggestOpenPlans" : "suggestOpenPlan"),
    };
  }
  const row = (entry) => {
    const inPlan = alreadyInPlanIds.includes(`${entry.target.id}`);
    return (
      <li key={entry.target.id}>
        <label
          className={`planner-autofill-item${entry.previousText || inPlan ? " has-previous" : ""}`}
        >
          <input
            type="checkbox"
            checked={entry.selected}
            onChange={() => onToggle(entry.target.id)}
          />
          <span className="planner-autofill-number" aria-hidden="true">
            {entry.number}
          </span>
          {renderVisual && (
            <span className="planner-suggest-row-visual">
              {renderVisual(entry)}
            </span>
          )}
          <span className="planner-autofill-lines">
            <span className="planner-autofill-name">
              {entry.name.designation}
              {entry.name.common && (
                <span className="planner-autofill-common">{` · ${entry.name.common}`}</span>
              )}
            </span>
            <span className="planner-autofill-time">
              {entry.windowText} · {scoreOn100(entry.score) ?? 0}
              /100
            </span>
            <span className="planner-autofill-muted">
              {entry.group === "continue" && entry.progress
                ? say("suggestProgress", {
                    acquired: model.duration(entry.progress.acquiredMinutes),
                    goal: model.duration(entry.progress.goalMinutes),
                    name: entry.progress.projectName,
                  })
                : entry.reasonText}
            </span>
            {/* A target that needs a filter at the eyepiece stays in the
                list and says which. */}
            {visual && filterAdviceFor?.(entry) && (
              <span
                className="planner-autofill-muted"
                data-testid={`suggest-filter-advice-${entry.target.id}`}
              >
                {filterAdviceFor(entry)}
              </span>
            )}
          </span>
          {entry.previousText && (
            <span className="planner-autofill-muted planner-autofill-previous">
              {entry.previousText}
            </span>
          )}
          {/* SUGGEST-FILTERS-01: the mask ignored, the stretch of its slot
              the target spends behind it. */}
          {entry.maskHiddenText && (
            <span
              className="planner-autofill-muted planner-autofill-previous"
              data-testid={`suggest-mask-hidden-${entry.target.id}`}
            >
              {entry.maskHiddenText}
            </span>
          )}
          {inPlan && (
            <span
              className="planner-autofill-muted planner-autofill-previous"
              data-testid={`suggest-already-in-plan-${entry.target.id}`}
            >
              {say("suggestAlreadyInPlan")}
            </span>
          )}
        </label>
      </li>
    );
  };
  return (
    <>
      <section
        aria-label={say("suggestPlaceEquipment")}
        className="planner-suggest-context"
      >
        <p>{contextLine}</p>
        <p>{equipmentLine}</p>
        <p>{say(visual ? "suggestVisualMode" : "suggestPhotoMode")}</p>
        <button
          className="btn-tertiary"
          type="button"
          aria-label={say("suggestChangeHint")}
          onClick={onChange}
        >
          {say("suggestChange")}
        </button>
      </section>
      {filters && (
        <div
          className="suggest-filter-bar"
          data-testid="suggest-filter-bar"
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <FiltersButton
              locale={locale}
              count={filters.badges.length}
              onClick={filters.onOpen}
              testId="suggest-filters-button"
            />
          </div>
          <FilterBadges
            locale={locale}
            badges={filters.badges}
            onReset={filters.onReset}
          />
        </div>
      )}
      <div className="planner-suggest-count">
        <h3>{say("suggestHowMany")}</h3>
        <div
          className="planner-suggest-segments"
          role="radiogroup"
          aria-label={say("suggestCountLabel")}
        >
          {countValues(defaults).map((value) => {
            const checked =
              value === "all"
                ? all
                : value === "custom"
                  ? custom
                  : !all && !custom && value === count;
            return (
              <button
                type="button"
                key={value}
                className={`planner-suggest-segment${checked ? " is-active" : ""}`}
                role="radio"
                aria-checked={checked}
                onClick={() => onCount(value)}
              >
                {value === "all"
                  ? say("suggestAll")
                  : value === "custom"
                    ? say("suggestOther")
                    : value}
              </button>
            );
          })}
        </div>
      </div>
      {custom && (
        <div className="planner-suggest-stepper">
          <span>{say("suggestCustom")}</span>
          <button
            className="btn-tertiary"
            type="button"
            aria-label={say("suggestLess")}
            disabled={count <= 1}
            onClick={() => onStep(-1)}
          >
            −
          </button>
          <output>{count}</output>
          <button
            className="btn-tertiary"
            type="button"
            aria-label={say("suggestMore")}
            disabled={count >= 20}
            onClick={() => onStep(1)}
          >
            +
          </button>
        </div>
      )}
      {/* « environ 0 » is never written, and the line is silent when no
          target fits — the state under the placement says why. */}
      {proposal.estimate.count > 0 && !nothing && (
        <p className="planner-autofill-muted">
          {model.estimate}{" "}
          <button
            className="btn-link"
            type="button"
            aria-label={say("suggestEstimateHint")}
            onClick={() => onInfo("estimate")}
          >
            ⓘ
          </button>
        </p>
      )}
      {/* « Placement », the same radio
          group as the count, one help line that says the chosen mode and its
          ⓘ — under the estimate, above the timeline that shows the
          difference. */}
      <div className="planner-suggest-placement">
        <h3>{say("suggestPlacement")}</h3>
        <div
          className="planner-suggest-segments planner-suggest-segments--placement"
          role="radiogroup"
          aria-label={say("suggestPlacementLabel")}
        >
          {suggestionPlacements.map((value) => (
            <button
              type="button"
              key={value}
              className={`planner-suggest-segment${placement === value ? " is-active" : ""}`}
              role="radio"
              aria-checked={placement === value}
              onClick={() => onPlacement(value)}
            >
              {say(
                value === "chained"
                  ? "suggestPlacementChained"
                  : "suggestPlacementIdeal",
              )}
            </button>
          ))}
        </div>
      </div>
      <p className="planner-autofill-muted planner-suggest-placement-help">
        {say(
          placement === "chained"
            ? "suggestPlacementChainedHelp"
            : "suggestPlacementIdealHelp",
        )}{" "}
        <button
          className="btn-link"
          type="button"
          aria-label={say("suggestPlacementHint")}
          onClick={() => onInfo("placement")}
        >
          ⓘ
        </button>
      </p>
      {/* « Confort »: the same radio group as
          « Placement » — « Sans restriction » and « Visée confortable » —
          and, with the latter, one help line per instrument. */}
      {visual && comfort && observationComfortRanges[comfort.family] && (
        <>
          <div className="planner-suggest-placement planner-suggest-comfort">
            <h3>{say("suggestComfort")}</h3>
            <div
              className="planner-suggest-segments planner-suggest-segments--placement"
              role="radiogroup"
              aria-label={say("suggestComfortLabel")}
              data-testid="suggest-comfort"
            >
              {[false, true].map((value) => (
                <button
                  type="button"
                  key={String(value)}
                  className={`planner-suggest-segment${comfortOn === value ? " is-active" : ""}`}
                  role="radio"
                  aria-checked={comfortOn === value}
                  disabled={recomputing}
                  onClick={() => comfortOn !== value && onComfort(value)}
                >
                  {say(value ? "suggestComfortEasy" : "suggestComfortAny")}
                </button>
              ))}
            </div>
          </div>
          {comfortOn && (
            <p
              className="planner-autofill-muted planner-suggest-placement-help"
              data-testid="suggest-comfort-help"
            >
              {comfortLine(say, comfort.family)}
            </p>
          )}
        </>
      )}
      {nothing ? (
        <div
          className="planner-autofill-nothing"
          data-testid="suggest-nothing"
          data-cause={model.nothingCause}
        >
          {searching}
          <p data-testid="suggest-nothing-title">{model.nothingTitle}</p>
          {model.nothingDetail && (
            <p className="planner-autofill-muted">{model.nothingDetail}</p>
          )}
          {/* The primary of the zone is the next night where the night is
              short, the plan where the plan fills it; nowhere else, and never
              a way back to the page the dialog came from. */}
          <div className="planner-suggest-nothing-actions">
            <button className="btn-link" type="button" onClick={onClose}>
              {say("autoFillClose")}
            </button>
            {nothingPrimary && (
              <button
                className="btn-primary"
                type="button"
                data-testid={nothingPrimary.testId}
                onClick={nothingPrimary.onClick}
              >
                {nothingPrimary.label}
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {proposal.requested !== "all" &&
            proposal.placed < proposal.requested && (
              <div className="planner-suggest-shortfall">
                <p>
                  {say("suggestShortfall", {
                    requested: proposal.requested,
                    placed: proposal.placed,
                  })}
                </p>
                <p className="planner-autofill-muted">
                  {model.shortfallReason}{" "}
                  <button
                    className="btn-link"
                    type="button"
                    aria-label={say("suggestWhy", {
                      count: proposal.requested,
                    })}
                    onClick={() => onInfo("shortfall")}
                  >
                    ⓘ
                  </button>
                </p>
              </div>
            )}
          <div
            className={`planner-suggest-timeline${recomputing ? " planner-suggest-dimmed" : ""}`}
          >
            <SuggestTimeline proposal={proposal} model={model} />
          </div>
          {searching}
          <div
            className={`planner-suggest-groups${recomputing ? " planner-suggest-dimmed" : ""}`}
            inert={recomputing ? true : undefined}
          >
            {["continue", "night"].map((group) => {
              const rows = model.items.filter(
                (entry) => (entry.group || "night") === group,
              );
              return rows.length ? (
                <section
                  key={group}
                  aria-label={say(
                    group === "continue"
                      ? "suggestContinue"
                      : "suggestNightOrder",
                  )}
                >
                  <h3>
                    {say(
                      group === "continue"
                        ? "suggestContinue"
                        : "suggestNightOrder",
                    )}
                  </h3>
                  <ul className="planner-autofill-list">{rows.map(row)}</ul>
                </section>
              ) : null;
            })}
          </div>
          {renderVisual && visualNote && (
            <p
              className="planner-autofill-muted planner-suggest-visual-note"
              data-testid="suggest-visual-note"
            >
              {visualNote}
            </p>
          )}
          {position.from > 1 && (
            <p className="planner-autofill-muted">
              {say("suggestLower", range)}
            </p>
          )}
          {!!captured.length && (
            <>
              <label className="planner-suggest-switch">
                <input
                  type="checkbox"
                  checked={excludeCaptured}
                  disabled={recomputing}
                  onChange={(event) =>
                    onLoad({ capturedValue: event.target.checked })
                  }
                />
                {say("suggestExcludeCaptured")}
              </label>
              {excludeCaptured && (
                <p className="planner-autofill-muted">{captureText}</p>
              )}
            </>
          )}
          {/* 12 above the line, 8 between the button and its sentence. */}
          <div className="planner-suggest-others">
            <div className="planner-suggest-others-line">
              <p className="planner-autofill-muted">
                {say("suggestPosition", range)}
              </p>
              {tier > 1 && (
                <button
                  className="btn-link"
                  type="button"
                  disabled={recomputing}
                  onClick={() => onLoad({ best: true })}
                >
                  {say("suggestBest")}
                </button>
              )}
              <button
                className="btn-tertiary"
                type="button"
                disabled={allTicked || exhausted || recomputing}
                onClick={() => onLoad({ refresh: true })}
              >
                {say("suggestOthers")}
              </button>
            </div>
            <p className="planner-autofill-muted planner-suggest-others-help">
              {say(
                exhausted
                  ? "suggestExhausted"
                  : allTicked
                    ? "suggestAllTicked"
                    : "suggestReplacement",
              )}
            </p>
          </div>
        </>
      )}
    </>
  );
}

// The line under « Observation confortable » for an instrument's family: what
// its range spares, with the degrees of the table.
function comfortLine(say, family) {
  const range = observationComfortRanges[family];
  const values = {
    min: Math.round(range.minAltitude ?? 0),
    max: Math.round(range.maxAltitude ?? 90),
  };
  const key = {
    refractor: "suggestComfortRefractor",
    "rear-eyepiece": "suggestComfortRearEyepiece",
    "newtonian-altaz": "suggestComfortNewtonianAltaz",
    "newtonian-equatorial": "suggestComfortNewtonianEquatorial",
  }[family];
  return say(key ?? "suggestComfortBinoculars", values);
}
