"use client";
import {
  placeDistanceKm,
  roundedPlaceDistanceKm,
  VERY_FAR_PLACE_KM,
} from "portal/planner/state.js";
import { plannerFlowMessage as flow } from "../../planner/flow-messages.js";
import { WebDialog } from "../dialog/WebDialog.js";

const placeName = (place) =>
  String(place?.name || place?.locality || "").trim();

// The stylised map of the far-place sheet: a graticule, a ring « Actuel » at
// the current place, a filled disc with « + » « Nouveau » at the new one, a
// dashed arc between them and the distance in a pill. Meaning never rests on
// colour: each point carries its name and its word.
function PlaceFarMap({ locale, current, next, distanceKm }) {
  const a = { x: 70, y: 128 };
  const b = { x: 290, y: 52 };
  const top = { x: 150, y: 42 };
  const control = {
    x: top.x * 2 - (a.x + b.x) / 2,
    y: top.y * 2 - (a.y + b.y) / 2,
  };
  // « 16 960 km », grouped like the distance in the night's alert.
  const grouped = new Intl.NumberFormat(locale).format(distanceKm);
  const distance = flow(locale, "farDistance").replace("{distance}", grouped);
  return (
    <svg
      className="planner-place-far-map"
      data-testid="planner-place-far-map"
      viewBox="0 0 360 180"
      role="img"
      aria-label={flow(locale, "farMapLabel").replace("{distance}", grouped)}
    >
      <g stroke="currentColor" strokeOpacity="0.18">
        {[60, 120, 180, 240, 300].map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="180" />
        ))}
        {[45, 90, 135].map((y) => (
          <line key={y} x1="0" y1={y} x2="360" y2={y} />
        ))}
      </g>
      <path
        d="M6 36 Q44 8 100 28 Q130 54 180 38"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="1.5"
      />
      <path
        d="M200 168 Q250 132 354 144"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="1.5"
      />
      <path
        d={`M${a.x} ${a.y} Q${control.x} ${control.y} ${b.x} ${b.y}`}
        fill="none"
        stroke="var(--planner-gold, #e0a85e)"
        strokeWidth="2"
        strokeDasharray="6 5"
      />
      <circle
        cx={a.x}
        cy={a.y}
        r="8"
        fill="none"
        stroke="var(--planner-gold, #e0a85e)"
        strokeWidth="2.5"
      />
      <circle cx={b.x} cy={b.y} r="11" fill="var(--planner-gold, #e0a85e)" />
      <path
        d={`M${b.x - 5} ${b.y}H${b.x + 5}M${b.x} ${b.y - 5}V${b.y + 5}`}
        stroke="#342918"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <g>
        <rect
          x={top.x - 40}
          y={top.y - 13}
          width="80"
          height="26"
          rx="13"
          fill="#342918"
          stroke="var(--planner-gold, #e0a85e)"
        />
        <text
          x={top.x}
          y={top.y + 4}
          textAnchor="middle"
          fontSize="13"
          fontWeight="600"
          fill="currentColor"
          data-testid="planner-place-far-distance"
        >
          {distance}
        </text>
      </g>
      <g textAnchor="middle" fontSize="12" fill="currentColor">
        <text x={a.x} y={a.y + 26} fontWeight="600">
          {placeName(current)}
        </text>
        <text x={a.x} y={a.y + 41} fillOpacity="0.7">
          {flow(locale, "farCurrent")}
        </text>
        <text x={b.x} y={b.y - 34} fontWeight="600">
          {placeName(next)}
        </text>
        <text x={b.x} y={b.y - 20} fillOpacity="0.7">
          {flow(locale, "farNew")}
        </text>
      </g>
    </svg>
  );
}

/**
 * « Changer pour un lieu très éloigné ? »:
 * the question about the night's plans, asked once the place is saved, as a
 * centred dialog. « Annuler » a link on the left,
 * « Déplacer la nuit vers ce lieu » the one primary on the right -- not
 * destructive: no plan, target or place is deleted. Under the route card an
 * amber box says, for each plan that moves ([planNames]), from where to where
 * (a warning is amber, never red).
 */
export function PlaceFarDialog({
  locale,
  current,
  next,
  planNames = [],
  onCancel,
  onConfirm,
}) {
  const km = roundedPlaceDistanceKm(
    placeDistanceKm(current, next) ?? VERY_FAR_PLACE_KM,
  );
  return (
    <WebDialog
      className="planner-confirmation-dialog planner-place-far-dialog"
      closeLabel={flow(locale, "close")}
      onClose={onCancel}
      title={flow(locale, "farTitle")}
      titleAs="h3"
      footer={
        <>
          <button
            className="btn-link"
            data-testid="planner-place-far-cancel"
            type="button"
            onClick={onCancel}
          >
            {flow(locale, "cancel")}
          </button>
          <button
            className="btn-primary"
            data-testid="planner-place-far-replace"
            type="button"
            onClick={onConfirm}
          >
            {flow(locale, "farReplace")}
          </button>
        </>
      }
    >
      <PlaceFarMap
        locale={locale}
        current={current}
        next={next}
        distanceKm={km}
      />
      {planNames.map((plan, index) => (
        <p
          className="planner-place-far-plan-line"
          data-testid="planner-place-far-plan-line"
          key={`${index}-${plan}`}
        >
          {flow(locale, "farPlanLine")
            .replaceAll("{plan}", plan)
            .replaceAll("{from}", placeName(current))
            .replaceAll("{to}", placeName(next))}
        </p>
      ))}
      <p>{flow(locale, "farBody")}</p>
    </WebDialog>
  );
}
