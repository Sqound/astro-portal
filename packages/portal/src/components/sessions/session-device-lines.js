// What the night's pointing devices did, as lines of the session page and of
// the debriefing (« M110 pointée par GoTo à 21:57 », « Monture arrêtée à 23:40
// », « Liaison perdue 2 min »).
//
// Read from the events the drivers' controllers write (`mount_*`, `device_*`,
// `pointing_help`; packages/astro-contracts/schemas/session-events.md, « The
// pointing-device kinds »). Pure: no string, no React — the page composes the
// sentence in the person's language from the kind and the figures here.
//
// One line per fact, not one per event:
//
// - a GoTo `sent` is a line only when no `arrived` / `refused` of the same
//   target follows it before the next GoTo (a GoTo that never ended stays
//   visible);
// - a `…_link_lost` pairs with the next `…_link_back` of the same device into
//   one line that knows how long the link was down; without a return it stays
//   « lost »;
// - a `mount_disconnected` is the person closing the link: a line of its own,
//   never a lost link; a link lost before it and not back stays « lost », and
//   a later `…_link_back` does not pair with it;
// - a park `requested` is a line only when no `parked` / `refused` follows.

import { isDeviceEventType } from "../../session-events/device-event-types.js";

const textOf = (value) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const gapOf = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;

const instantOf = (value) => {
  const at = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(at) ? at : null;
};

/**
 * The lines of the pointing devices in `events` (`{ type, recordedAt, payload
 * }`, any order), in time order: `{ kind, source, at, target, gapDegrees,
 * lostForMs, manual, nightEnd }` (`at` in milliseconds, `source` `mount`,
 * `telescope` or `help`). Events of other types are ignored.
 */
export function sessionDeviceLines(events = []) {
  const sorted = events
    .filter(
      (event) =>
        isDeviceEventType(event?.type) && instantOf(event.recordedAt) !== null,
    )
    .map((event) => ({
      type: event.type,
      at: instantOf(event.recordedAt),
      payload:
        event.payload && typeof event.payload === "object" ? event.payload : {},
    }))
    .sort((a, b) => a.at - b.at);

  const lines = [];
  const line = (kind, source, at, extra = {}) => ({
    kind,
    source,
    at,
    target: null,
    gapDegrees: null,
    lostForMs: null,
    manual: false,
    nightEnd: false,
    ...extra,
  });
  let openGoto = null;
  let openDeviceGoto = null;
  let openPark = null;
  let openDevicePark = null;
  const lostAt = new Map();

  for (const { type, at, payload } of sorted) {
    switch (type) {
      case "mount_connected":
        lines.push(line("connected", "mount", at));
        break;
      case "device_connected":
        lines.push(line("connected", "telescope", at));
        break;
      case "mount_goto":
      case "device_goto": {
        const mount = type === "mount_goto";
        const source = mount ? "mount" : "telescope";
        const target = textOf(payload.targetLabel);
        const kind =
          { sent: "gotoSent", arrived: "gotoArrived", refused: "gotoRefused" }[
            payload.outcome
          ] ?? null;
        if (!kind) break;
        const open = mount ? openGoto : openDeviceGoto;
        if (kind !== "gotoSent" && open !== null) {
          // The answer replaces the « sent » it ends, when it is the same
          // target (or one of them has no name).
          const sent = lines[open];
          if (
            sent.target === null ||
            target === null ||
            sent.target === target
          ) {
            lines[open] = line(kind, source, at, {
              target: target ?? sent.target,
              gapDegrees: gapOf(payload.gapDegrees),
            });
            if (mount) openGoto = null;
            else openDeviceGoto = null;
            break;
          }
        }
        lines.push(
          line(kind, source, at, {
            target,
            gapDegrees: gapOf(payload.gapDegrees),
          }),
        );
        const next = kind === "gotoSent" ? lines.length - 1 : null;
        if (mount) openGoto = next;
        else openDeviceGoto = next;
        break;
      }
      case "mount_stop":
      case "device_stop": {
        const source = type === "mount_stop" ? "mount" : "telescope";
        // A STOP ends the GoTo it interrupted: its « sent » stays a line.
        if (source === "mount") openGoto = null;
        else openDeviceGoto = null;
        lines.push(
          line("stopped", source, at, {
            nightEnd: payload.cause === "night_end",
          }),
        );
        break;
      }
      case "mount_link_lost":
      case "device_link_lost": {
        const source = type === "mount_link_lost" ? "mount" : "telescope";
        if (lostAt.has(source)) break;
        lines.push(line("linkLost", source, at));
        lostAt.set(source, lines.length - 1);
        break;
      }
      case "mount_link_back":
      case "device_link_back": {
        const source = type === "mount_link_back" ? "mount" : "telescope";
        const lost = lostAt.get(source);
        if (lost === undefined) break;
        lostAt.delete(source);
        lines[lost] = line("linkLost", source, lines[lost].at, {
          lostForMs: at - lines[lost].at,
        });
        break;
      }
      case "mount_disconnected":
        // The person closed the link: not a loss, and nothing to pair a later
        // return with.
        lostAt.delete("mount");
        lines.push(line("disconnected", "mount", at));
        break;
      case "mount_parked":
      case "device_parked": {
        const mount = type === "mount_parked";
        const source = mount ? "mount" : "telescope";
        const kind =
          {
            requested: "parkRequested",
            parked: "parked",
            refused: "parkRefused",
          }[payload.outcome] ?? null;
        if (!kind) break;
        const open = mount ? openPark : openDevicePark;
        if (kind !== "parkRequested" && open !== null) {
          lines[open] = line(kind, source, at);
          if (mount) openPark = null;
          else openDevicePark = null;
          break;
        }
        lines.push(line(kind, source, at));
        if (kind === "parkRequested") {
          if (mount) openPark = lines.length - 1;
          else openDevicePark = lines.length - 1;
        }
        break;
      }
      case "mount_aligned":
        lines.push(
          line(
            payload.outcome === "refused" ? "alignRefused" : "aligned",
            "mount",
            at,
            { target: textOf(payload.targetLabel) },
          ),
        );
        break;
      case "pointing_help": {
        const kind =
          {
            centred: "helpCentred",
            failed: "helpFailed",
            refused: "helpRefused",
            stopped: "helpStopped",
            lost: "helpLost",
          }[payload.outcome] ?? null;
        if (!kind) break;
        lines.push(
          line(kind, "help", at, {
            target: textOf(payload.targetLabel),
            gapDegrees: gapOf(payload.gapDegrees),
            manual: payload.method === "manual",
          }),
        );
        break;
      }
      default:
        break;
    }
  }
  // A GoTo answered later takes the answer's instant: keep the time order.
  return lines
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.at - b.entry.at || a.index - b.index)
    .map(({ entry }) => entry);
}
