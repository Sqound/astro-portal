import { nightEveningDate } from "../../persistence/night-evening-date.js";
import {
  createCaptureSession,
  createDefinition,
  createPersonalTarget,
  newUlid,
  uploadCapture,
} from "./captures-client.js";
import { distanceKm } from "./photo-exif.js";

/**
 * « Rangement » of the add box (« a capture always has its session »):
 * what a photo says of its night and its place, how files are gathered
 * into the sessions they will be filed in, and the gesture that creates
 * those sessions and sends the files. Pure data in, plain answers out:
 * the dialog draws, nothing here touches the page.
 *
 * **The night** follows the rule of the places without a time zone
 * (`place-without-timezone`): a night runs from local noon to local noon at
 * the place's longitude, and the browser's time zone is never read. The
 * EXIF stamp of a photo is a wall-clock time at the place it was taken, so a
 * photo taken before noon belongs to the night of the day before.
 */

/** How far from a saved place a photo's position still names that place. */
export const NEAR_PLACE_KM = 5;

const HOUR_MS = 3_600_000;
const NIGHT_EVENING_HOUR = 21;

const finite = (value) => Number.isFinite(value);

/**
 * The instant of a wall-clock time at a place (local mean time: the
 * longitude's hours, never a zone). `date` is `YYYY-MM-DD`, `time` `HH:MM`.
 */
export function wallClockInstant(date, time, longitude) {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  const clock = /^(\d{2}):(\d{2})$/.exec(String(time || "00:00"));
  if (!day || !clock) return null;
  const wall = Date.UTC(
    Number(day[1]),
    Number(day[2]) - 1,
    Number(day[3]),
    Number(clock[1]),
    Number(clock[2]),
  );
  const shift = finite(longitude) ? (longitude / 15) * HOUR_MS : 0;
  return new Date(wall - shift).toISOString();
}

/** The night (`YYYY-MM-DD`, its evening) a photo taken at `date` `time` belongs to. */
export const nightOfPhoto = ({ date, time, longitude }) =>
  nightEveningDate({
    planDate: null,
    startedAt: wallClockInstant(date, time, longitude),
    longitude,
  });

/** The night in progress at `now`, read at the place's longitude. */
export const tonightAt = (now, longitude) =>
  nightEveningDate({
    planDate: null,
    startedAt: new Date(now).toISOString(),
    longitude,
  });

/** The instant a night chosen without a photo's time is taken to begin. */
export const eveningInstant = (night, longitude) =>
  wallClockInstant(night, `${NIGHT_EVENING_HOUR}:00`, longitude);

/** The saved place nearest to a position, within `NEAR_PLACE_KM`, or `null`. */
export function nearbyPlace(places, position, within = NEAR_PLACE_KM) {
  if (!finite(position?.latitude) || !finite(position?.longitude)) return null;
  let best = null;
  for (const place of places ?? []) {
    if (!finite(place?.latitude) || !finite(place?.longitude)) continue;
    const distance = distanceKm(position, place);
    if (distance <= within && (!best || distance < best.distance))
      best = { place, distance };
  }
  return best?.place ?? null;
}

/** The person's current place: the default one, else the first they have. */
export const currentPlace = (places) =>
  (places ?? []).find((place) => place.default) ?? (places ?? [])[0] ?? null;

/**
 * What a chosen file says of its night and its place:
 * `{ night: { date, from, time? }, place: { name, latitude, longitude, from }
 * | null }` where the night is `photo` (the EXIF's date and time) or
 * `tonight` (no EXIF: « Nuit : à choisir », tonight proposed), and the place
 * `saved` (the saved place nearest to the photo's position), `photo` (a
 * position with no saved place near it, named by its coordinates) or
 * `current` (no position: the person's current place).
 */
export function readFileDetails({ exif, places, now = new Date() }) {
  const position =
    finite(exif?.latitude) && finite(exif?.longitude)
      ? { latitude: exif.latitude, longitude: exif.longitude }
      : null;
  const near = position ? nearbyPlace(places, position) : null;
  let place = null;
  if (near) place = { ...near, from: "saved" };
  else if (position)
    place = {
      name: `${position.latitude.toFixed(3)}, ${position.longitude.toFixed(3)}`,
      ...position,
      from: "photo",
    };
  else {
    const current = currentPlace(places);
    if (current) place = { ...current, from: "current" };
  }
  const longitude = place?.longitude;
  const night =
    exif?.date && exif?.time
      ? {
          date: nightOfPhoto({
            date: exif.date,
            time: exif.time,
            longitude,
          }),
          from: "photo",
          photoDate: exif.date,
          time: exif.time,
        }
      : { date: tonightAt(now, longitude), from: "tonight" };
  return { night, place };
}

/** The place of an entry: the person's choice, else the file's. */
const placeOf = (entry) => entry.placeOverride ?? entry.place;

/** The night of an entry: the person's choice, else the file's. */
const nightOf = (entry) =>
  entry.nightOverride
    ? { date: entry.nightOverride, from: "choice" }
    : entry.night;

/** The target of an entry: the person's choice (possibly none), else the guess. */
export const targetOf = (entry) =>
  entry.target !== undefined ? entry.target : (entry.guess ?? null);

/**
 * The files gathered by night and place — one session each. `pinned` is a
 * session the person chose (« Choisir une session existante »): every file
 * then goes to it, in one group. Else a group of a night for which a session
 * exists (the same evening date, the same place first) proposes to join it.
 * Each group: `{ key, night, place, entries: [index…], existing }`.
 */
export function groupEntries({ entries, nights = [], pinned = null }) {
  const groups = [];
  entries.forEach((entry, index) => {
    const night = nightOf(entry);
    const place = placeOf(entry);
    const key = pinned
      ? `session:${pinned.sessionId}`
      : `${night.date}|${place?.name ?? ""}`;
    let group = groups.find((candidate) => candidate.key === key);
    if (!group) {
      group = { key, night, place, entries: [] };
      groups.push(group);
    }
    group.entries.push(index);
  });
  for (const group of groups) {
    if (pinned) {
      group.existing = pinned;
      continue;
    }
    const sameNight = nights.filter(
      (night) => night.night === group.night.date,
    );
    group.existing =
      sameNight.find(
        (night) => night.place && night.place === group.place?.name,
      ) ??
      sameNight[0] ??
      null;
  }
  return groups;
}

/** What each group does: `attach` (to its existing session) or `create`. */
export function groupMode(group, choices = {}) {
  if (!group.existing) return "create";
  return choices[group.key] ?? "attach";
}

/**
 * The night and the place a group is filed under. A group that joins a
 * session has THAT session's night and place, whatever its files say: the
 * lines under « Rattacher à la session … » must not contradict it, and
 * they follow the person when the session changes. A group that creates
 * its session keeps the files' own. `{ night, place, attached }`; the
 * session's place is its name only (`from: "session"`).
 */
export function groupView(group, mode) {
  const session = mode === "attach" ? group.existing : null;
  if (!session)
    return { night: group.night, place: group.place, attached: false };
  return {
    night: session.night
      ? { date: session.night, from: "session" }
      : group.night,
    place: session.place
      ? { name: session.place, from: "session" }
      : session.night
        ? null
        : group.place,
    attached: true,
  };
}

/**
 * The target a file is filed with: the person's choice (possibly none), else
 * the guess from its name, else — in a group that joins a session which
 * observed exactly one target — that target. Several targets: the person
 * says which (« Cible : à préciser »).
 */
export function entryTarget(entry, group, mode) {
  const own = targetOf(entry);
  if (own || entry.target !== undefined) return own;
  const session = mode === "attach" ? group?.existing : null;
  return session?.targets?.length === 1 ? session.targets[0] : null;
}

/**
 * The primary's label: « Créer la session et envoyer », « Rattacher à la
 * nuit du … et envoyer », « Créer {n} sessions et envoyer » — or, when
 * several sessions are not all created, « Ranger et envoyer »; for a capture
 * without an image, « Créer la capture sans image ».
 */
export function primaryLabel({ copy, groups, choices, withFiles, dayOf }) {
  if (!withFiles) return copy.createWithoutImage;
  const modes = groups.map((group) => groupMode(group, choices));
  if (groups.length > 1)
    return modes.every((mode) => mode === "create")
      ? copy.filingCreateManyAndSend(groups.length)
      : copy.filingSendAll;
  return modes[0] === "attach"
    ? copy.filingAttachAndSend(dayOf(groups[0].existing.night))
    : copy.filingCreateAndSend;
}

/**
 * Whether the captures about to be added fit the free space's number of
 * captures — asked before any session is created, so that a refusal leaves
 * nothing half-built. `{ ok: true }` or `{ ok: false, outcome }` with the
 * refusal in the service's own shape (`capture_limit_reached`, the numbers),
 * for the words the dialog already has for that code.
 */
export function captureCountFits({ storage, adding }) {
  const limit = storage?.captureCountLimit;
  if (!Number.isInteger(limit)) return { ok: true };
  const count = Number(storage?.captureCount) || 0;
  if (count + adding <= limit) return { ok: true };
  return {
    ok: false,
    outcome: { kind: "refused", code: "capture_limit_reached", storage },
  };
}

/** The start and the end of the session of a group, from its files. */
function sessionTimes(group, entries) {
  const longitude = group.place?.longitude;
  const instants = group.entries
    .map((index) => entries[index])
    .map((entry) =>
      entry.night?.from === "photo" && !entry.nightOverride
        ? wallClockInstant(entry.exif?.date, entry.exif?.time, longitude)
        : null,
    )
    .filter(Boolean)
    .sort();
  if (instants.length)
    return { startedAt: instants[0], finishedAt: instants.at(-1) };
  const startedAt = eveningInstant(group.night.date, longitude);
  return { startedAt, finishedAt: startedAt };
}

/**
 * The gesture of the primary. For each group — attached to its existing
 * session or created (`createCaptureSession`: create, finish, patch the
 * night with its place and its targets) — each file is uploaded with the
 * session's id and its target (a target that is not in the catalogue is
 * created first); a capture without a file becomes a definition of that
 * session. The count limit of a free space is asked before anything is
 * created. `created` is the memory of the sessions already built, so that a
 * retry after a failure builds none twice. Answers `{ kind: "ok", outcome }`
 * (`outcome`: the last upload's) or `{ kind: "refused" | "failed" | … }`,
 * with `step: "session" | "target" | "upload"`.
 */
export async function fileCaptures({
  fetcher,
  csrf,
  locale,
  entries,
  groups,
  choices = {},
  storage = null,
  created = new Map(),
  uploaded = new Set(),
}) {
  const adding = entries.filter((entry) => !uploaded.has(entry)).length;
  const fits = captureCountFits({ storage, adding });
  if (!fits.ok) return { ...fits.outcome, step: "limit", entry: entries[0] };
  let last = null;
  for (const group of groups) {
    const members = group.entries.map((index) => entries[index]);
    const mode = groupMode(group, choices);
    const view = groupView(group, mode);
    // The targets of the night, the personal ones created first.
    for (const entry of members) {
      const target = entryTarget(entry, group, mode);
      if (target?.new) {
        const made = await createPersonalTarget(fetcher, {
          csrf,
          target: {
            name: target.name ?? target.designation,
            label: "Grand champ",
            ...(view.place?.name ? { placeName: view.place.name } : {}),
            ...(view.night?.date ? { date: view.night.date } : {}),
          },
        });
        if (made.kind !== "ok") return { ...made, step: "target" };
        entry.target = {
          id: made.target.id,
          designation: made.target.name ?? target.name,
          name: null,
        };
      }
    }
    const targetIds = [
      ...new Set(
        members
          .map((entry) => entryTarget(entry, group, mode)?.id)
          .filter(Boolean),
      ),
    ];
    let sessionId;
    if (mode === "attach") sessionId = group.existing.sessionId;
    else {
      if (!created.has(group.key))
        created.set(group.key, { clientSessionId: newUlid(), sessionId: null });
      const memory = created.get(group.key);
      if (!memory.sessionId) {
        const made = await createCaptureSession(fetcher, {
          ...sessionTimes(group, entries),
          clientSessionId: memory.clientSessionId,
          place: group.place,
          targetIds,
          csrf,
        });
        if (made.kind !== "ok") return { ...made, step: "session" };
        memory.sessionId = made.sessionId;
      }
      sessionId = memory.sessionId;
    }
    for (const entry of members) {
      if (uploaded.has(entry)) continue;
      const targetId = entryTarget(entry, group, mode)?.id;
      const outcome = entry.file
        ? await uploadCapture(fetcher, {
            file: entry.file,
            sha256: entry.sha256,
            csrf,
            metadata: {
              sessionId,
              ...(targetId ? { targetIds: [targetId] } : {}),
              stage: "draft",
            },
          })
        : await createDefinition(fetcher, {
            sessionId,
            targetIds: targetId ? [targetId] : [],
            locale,
            csrf,
          });
      if (outcome.kind !== "ok") return { ...outcome, step: "upload", entry };
      uploaded.add(entry);
      last = outcome;
    }
  }
  return { kind: "ok", outcome: last };
}
