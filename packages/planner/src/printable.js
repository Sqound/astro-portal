import { nightMinutes } from "./recommendations.js";
import { plannedWindow } from "./schedule.js";

// The data behind the printable plan sheet, extracted from `PrintablePlan`
// (`components/PlannerPage.js`). Only geometry and identifiers live here: the
// sheet still resolves its own labels, so this stays locale-independent and
// can be replayed by a native renderer.

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

// `acquisitionText` (`acquisitionTextByItem`, "Prise de vue par cible") adds
// the shooting line of a target to its entry, as `acquisition`; an entry
// without one is as it was.
export function printablePlanSheet({ plan, night, acquisitionText = {} } = {}) {
  if (!plan || !night) return null;
  const cardsById = new Map(
    (night.cards || []).map((card) => [card.target.id, card]),
  );
  const total = nightMinutes(night);
  const entries = (plan.items || [])
    .map((item) => {
      const card = cardsById.get(item.id);
      if (!card) return null;
      const window = plannedWindow(item, card, night);
      const target = card.target;
      return {
        id: item.id,
        title:
          target.title || target.designation || target.objects?.[0] || item.id,
        designation: target.designation || target.objects?.[0] || null,
        constellation: target.skyTarget?.constellation || null,
        type: target.skyTarget?.type || null,
        filter: item.filter || card.filter || "",
        ...(acquisitionText?.[item.id]
          ? { acquisition: acquisitionText[item.id] }
          : {}),
        direction: card.direction ?? null,
        maxAltitude: card.maxAltitude ?? null,
        startMinute: window.start,
        endMinute: window.end,
        durationMinutes: window.end - window.start,
        // The printed timeline is a percentage-positioned bar; a zero-length
        // window still needs a visible sliver.
        leftPercent: total > 0 ? (window.start / total) * 100 : 0,
        widthPercent:
          total > 0
            ? Math.max(1, ((window.end - window.start) / total) * 100)
            : 0,
        integration:
          card.integration?.available !== false &&
          Number.isFinite(number(card.integration?.recommendedMinutes))
            ? {
                recommendedMinutes: card.integration.recommendedMinutes,
                minimumMinutes: card.integration.minimumMinutes,
                maximumMinutes: card.integration.maximumMinutes,
              }
            : null,
      };
    })
    .filter(Boolean);
  return {
    planId: plan.id ?? null,
    name: plan.name || null,
    date: plan.date ?? null,
    start: night.start ?? null,
    end: night.end ?? null,
    totalMinutes: total,
    moonIllumination: night.moonIllumination ?? null,
    field: night.field ?? null,
    plannedCount: entries.length,
    unresolvedCount: (plan.items || []).length - entries.length,
    entries,
  };
}

// The static all-sky plot printed with the sheet: an equirectangular
// right-ascension × declination layout inside the 800 × 380 print canvas.
export const printableSkyMapCanvas = {
  width: 800,
  height: 380,
  left: 24,
  top: 22,
  plotWidth: 752,
  plotHeight: 336,
};

export function printableSkyMapPoint(coordinate) {
  const ra = number(coordinate?.ra);
  const dec = number(coordinate?.dec);
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
  return {
    x:
      printableSkyMapCanvas.left + (ra / 360) * printableSkyMapCanvas.plotWidth,
    y:
      printableSkyMapCanvas.top +
      ((90 - dec) / 180) * printableSkyMapCanvas.plotHeight,
  };
}

export function printableSkyMapMarkers(cards = []) {
  return cards
    .map((card) => card?.target)
    .filter((target) => target?.coordinate)
    .map((target) => {
      const point = printableSkyMapPoint(target.coordinate);
      if (!point) return null;
      return {
        id: target.id,
        label: target.designation || target.objects?.[0] || target.title,
        x: point.x,
        y: point.y,
        radiusX: Math.max(
          5,
          Math.min(35, (target.apparentSizeArcmin?.[0] || 12) / 4),
        ),
        radiusY: Math.max(
          5,
          Math.min(35, (target.apparentSizeArcmin?.[1] || 12) / 4),
        ),
      };
    })
    .filter(Boolean);
}
