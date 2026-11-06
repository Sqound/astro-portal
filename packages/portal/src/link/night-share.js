import { createHash } from "node:crypto";

/**
 * Sharing the night in progress: a reference implementation of the
 * conformance fixture `night-share-link`. Nothing on the web or the service
 * uses it: the share travels over Bluetooth between phones, without a
 * server.
 *
 * - The code (six characters) is the only secret; the host advertises
 *   `PS1` and the start of a SHA-256 of it, and a viewer says the whole
 *   SHA-256 in its `hello`.
 * - What leaves the host: the plan with its place's name, coordinates to a
 *   tenth of a degree, elevation to a hundred metres, no note; the
 *   execution's events without a note, an incident or a text.
 * - A viewer may send `hello`, `ack` and `bye`; anything else is refused
 *   (`bye(readOnly)`, then the connection cut) — but `seen` (GUIDED-EVENING-04,
 *   « Je l'ai vue ! »), counted once per viewer and step, which writes
 *   nothing.
 * - GUIDED-EVENING-04: the host's guided evening (`guided`, versioned) goes
 *   to every viewer when its step changes, and to a newcomer after the
 *   target.
 */

export const NIGHT_SHARE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const NIGHT_SHARE_LINK_HOST = "www.planastro.space";
const PROTOCOL_VERSION = 1;

export function normalizeNightShareCode(input) {
  if (typeof input !== "string") return null;
  const code = input.toUpperCase().replace(/[\s\-·]/g, "");
  if (code.length !== 6) return null;
  for (const character of code) {
    if (!NIGHT_SHARE_CODE_ALPHABET.includes(character)) return null;
  }
  return code;
}

export function nightShareProof(code) {
  return createHash("sha256")
    .update(`planastro-night-share/1\n${String(code).toUpperCase()}`, "utf8")
    .digest("hex");
}

export function nightShareTag(code) {
  return `PS1${nightShareProof(code).slice(0, 8)}`;
}

export function nightShareLink(code) {
  return `HTTPS://${NIGHT_SHARE_LINK_HOST.toUpperCase()}/N/${String(code).toUpperCase()}`;
}

export function nightShareCodeOfLink(link) {
  if (typeof link !== "string") return null;
  let url;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  const scheme = url.protocol.toLowerCase();
  if (scheme !== "https:" && scheme !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (
    host !== NIGHT_SHARE_LINK_HOST &&
    `www.${host}` !== NIGHT_SHARE_LINK_HOST
  ) {
    return null;
  }
  const segments = url.pathname
    .split("/")
    .filter((segment) => segment.length > 0);
  if (segments.length !== 2 || segments[0].toLowerCase() !== "n") return null;
  return normalizeNightShareCode(decodeURIComponent(segments[1]));
}

const PRIVATE_PLAN_FIELDS = new Set([
  "notes",
  "note",
  "owner",
  "ownerEmail",
  "spaceEmail",
  "email",
  "author",
  "createdBy",
  "deviceId",
]);
const PRIVATE_ITEM_FIELDS = new Set(["note", "notes", "comment"]);
const SHARED_PLACE_FIELDS = new Set([
  "name",
  "label",
  "latitude",
  "longitude",
  "timeZone",
  "elevation",
  "horizonMask",
  "horizonStatus",
  "utcOffsetMinutes",
]);
// The four kinds Astro Sync detects describe the equipment: private too.
const PRIVATE_EVENT_TYPES = new Set([
  "note",
  "equipment_issue",
  "exposure_change",
  "guiding_timeouts",
  "sensor_temperature_drift",
  "guiding_spikes",
  // The events of the night's mount or smart telescope and the
  // pointing helps describe the equipment too.
  "mount_connected",
  "mount_goto",
  "mount_stop",
  "mount_link_lost",
  "mount_link_back",
  "mount_disconnected",
  "mount_parked",
  "mount_aligned",
  "pointing_help",
  "device_connected",
  "device_goto",
  "device_stop",
  "device_parked",
  "device_link_lost",
  "device_link_back",
  "device_instrument",
]);
const PRIVATE_EVENT_FIELDS = new Set(["text", "note", "comment"]);

function numberOf(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value.trim());
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function tenth(value) {
  const number = numberOf(value);
  return number === null ? null : Math.floor(number * 10 + 0.5) / 10;
}

function hundred(value) {
  const number = numberOf(value);
  if (number === null) return null;
  const rounded = Math.floor(number / 100 + 0.5) * 100;
  return typeof value === "string" ? String(rounded) : rounded;
}

function sharedPlace(place) {
  if (!place || typeof place !== "object" || Array.isArray(place)) return null;
  const shared = {};
  for (const [key, value] of Object.entries(place)) {
    if (!SHARED_PLACE_FIELDS.has(key)) continue;
    const kept =
      key === "latitude" || key === "longitude"
        ? tenth(value)
        : key === "elevation"
          ? hundred(value)
          : value;
    if (kept !== null && kept !== undefined) shared[key] = kept;
  }
  return shared;
}

export function nightSharePlanPayload(payload) {
  const shared = {};
  for (const [key, value] of Object.entries(payload ?? {})) {
    if (PRIVATE_PLAN_FIELDS.has(key)) continue;
    if (key === "location" || key === "place") {
      const place = sharedPlace(value);
      if (place !== null) shared[key] = place;
    } else if (key === "items") {
      shared.items = Array.isArray(value)
        ? value.map((item) =>
            item && typeof item === "object" && !Array.isArray(item)
              ? Object.fromEntries(
                  Object.entries(item).filter(
                    ([field]) => !PRIVATE_ITEM_FIELDS.has(field),
                  ),
                )
              : item,
          )
        : value;
    } else {
      shared[key] = value;
    }
  }
  return shared;
}

export function nightShareEvents(events) {
  const shared = [];
  for (const event of events ?? []) {
    if (typeof event?.eventId !== "string" || typeof event?.type !== "string")
      continue;
    if (PRIVATE_EVENT_TYPES.has(event.type)) continue;
    const payload = {};
    if (event.payload && typeof event.payload === "object") {
      for (const [field, value] of Object.entries(event.payload)) {
        if (!PRIVATE_EVENT_FIELDS.has(field)) payload[field] = value;
      }
    }
    shared.push({
      eventId: event.eventId,
      type: event.type,
      payload,
      occurredAt: event.occurredAt,
    });
  }
  return shared;
}

export function nightShareSession(session) {
  const header = {};
  for (const key of [
    "id",
    "planId",
    "status",
    "startedAt",
    "finishedAt",
    "updatedAt",
  ]) {
    if (session?.[key] !== undefined && session[key] !== null)
      header[key] = session[key];
  }
  return header;
}

const VIEWER_MESSAGES = new Set(["hello", "ack", "bye", "seen"]);

function samePlanRevision(a, b) {
  return Boolean(a && b && a.id === b.id && a.revision === b.revision);
}

/** The host core, as `NightShareHostCore` runs it. */
class HostCore {
  constructor({ code, label, deviceId, epoch }) {
    this.proof = nightShareProof(code);
    this.label = label;
    this.deviceId = deviceId;
    this.epoch = epoch;
    this.viewers = new Map();
    this.plan = null;
    this.session = null;
    this.events = [];
    this.target = null;
    this.guided = null;
    this.seen = new Map();
    this.seq = 0;
    this.stopped = false;
  }

  next() {
    this.seq += 1;
    return this.seq;
  }

  watching() {
    return [...this.viewers.values()]
      .filter((viewer) => viewer.hello)
      .map((viewer) => viewer.peerId);
  }

  message(t, s, b) {
    return { v: PROTOCOL_VERSION, t, s, b };
  }

  broadcast(build) {
    const peers = this.watching();
    if (peers.length === 0) return [];
    const message = build();
    return peers.map((peerId) => ({ send: peerId, message }));
  }

  planMessage() {
    return this.message("plan", this.next(), {
      plan: this.plan.ref,
      payload: this.plan.payload,
    });
  }

  setPlan(plan) {
    const shared = {
      ref: plan.ref,
      payload: nightSharePlanPayload(plan.payload),
    };
    const previous = this.plan;
    this.plan = shared;
    if (this.stopped) return [];
    if (
      previous &&
      samePlanRevision(previous.ref, shared.ref) &&
      JSON.stringify(previous.payload) === JSON.stringify(shared.payload)
    ) {
      return [];
    }
    return this.broadcast(() => this.planMessage());
  }

  setNight(session, events) {
    const header = nightShareSession(session);
    const shared = nightShareEvents(events);
    const previousHeader = this.session;
    const previous = this.events;
    this.session = header;
    this.events = shared;
    if (this.stopped) return [];
    if (previousHeader === null) {
      return this.broadcast(() =>
        this.message("night", this.next(), {
          session: header,
          events: shared,
          full: true,
        }),
      );
    }
    const before = new Set(previous.map((event) => event.eventId));
    const now = new Set(shared.map((event) => event.eventId));
    const lost = [...before].some((id) => !now.has(id));
    const added = shared.filter((event) => !before.has(event.eventId));
    if (
      !lost &&
      added.length === 0 &&
      JSON.stringify(previousHeader) === JSON.stringify(header)
    ) {
      return [];
    }
    return this.broadcast(() =>
      this.message("night", this.next(), {
        session: header,
        events: lost ? shared : added,
        full: lost,
      }),
    );
  }

  setTarget(target) {
    const previous = this.target;
    if (
      previous &&
      previous.key === target.key &&
      previous.name === target.name
    )
      return [];
    this.target = target;
    if (this.stopped) return [];
    return this.broadcast(() =>
      this.message("target", this.next(), targetBody(target)),
    );
  }

  setGuided(guided) {
    const body = { v: guided?.v ?? 1, evening: guided?.evening ?? null };
    if (this.guided && JSON.stringify(this.guided) === JSON.stringify(body))
      return [];
    this.guided = body;
    if (this.stopped) return [];
    return this.broadcast(() => this.message("guided", this.next(), body));
  }

  seenBy(step) {
    return this.seen.get(step)?.size ?? 0;
  }

  stop() {
    if (this.stopped) return [];
    this.stopped = true;
    const told = this.watching();
    const bye = this.message("bye", this.next(), { reason: "done" });
    const actions = [
      ...told.map((peerId) => ({ send: peerId, message: bye })),
      ...[...this.viewers.keys()].map((peerId) => ({ cut: peerId })),
    ];
    this.viewers.clear();
    return actions;
  }

  connected(peerId) {
    if (this.stopped) return [{ cut: peerId }];
    if (!this.viewers.has(peerId))
      this.viewers.set(peerId, { peerId, hello: null, acknowledged: false });
    return [];
  }

  disconnected(peerId) {
    this.viewers.delete(peerId);
    return [];
  }

  refuse(peerId, type) {
    this.viewers.delete(peerId);
    return [
      { refused: peerId, type },
      {
        send: peerId,
        message: this.message("bye", this.next(), { reason: "readOnly" }),
      },
      { cut: peerId },
    ];
  }

  received(peerId, message) {
    if (this.stopped) return [{ cut: peerId }];
    if (!this.viewers.has(peerId))
      this.viewers.set(peerId, { peerId, hello: null, acknowledged: false });
    const viewer = this.viewers.get(peerId);
    if (!VIEWER_MESSAGES.has(message.t)) return this.refuse(peerId, message.t);
    if (message.t === "ack") {
      if (!viewer.hello) return this.refuse(peerId, "ack");
      viewer.acknowledged = true;
      return [];
    }
    if (message.t === "bye") {
      this.viewers.delete(peerId);
      return [{ cut: peerId }];
    }
    if (message.t === "seen") {
      const step = message.b?.step;
      if (
        !viewer.hello ||
        !Number.isInteger(message.b?.v) ||
        typeof step !== "string" ||
        step.length === 0 ||
        step.length > 200
      )
        return this.refuse(peerId, "seen");
      if (!this.seen.has(step)) this.seen.set(step, new Set());
      const viewers = this.seen.get(step);
      if (viewers.has(peerId)) return [];
      viewers.add(peerId);
      return [{ seen: peerId, step }];
    }
    return this.onHello(viewer, message.b ?? {});
  }

  onHello(viewer, hello) {
    const { peerId } = viewer;
    if (hello.role !== "viewer")
      return this.refuse(peerId, `hello:${hello.role}`);
    const version = Number.isInteger(hello.version)
      ? hello.version
      : PROTOCOL_VERSION;
    if (version > PROTOCOL_VERSION) {
      this.viewers.delete(peerId);
      return [
        {
          send: peerId,
          message: this.message("bye", this.next(), { reason: "version" }),
        },
        { cut: peerId },
      ];
    }
    if (hello.space !== this.proof) {
      this.viewers.delete(peerId);
      return [
        {
          send: peerId,
          message: this.message("bye", this.next(), { reason: "noMatch" }),
        },
        { cut: peerId },
      ];
    }
    viewer.hello = hello;
    viewer.acknowledged = false;
    const actions = [
      {
        send: peerId,
        message: this.message("hello", this.next(), {
          device: this.deviceId,
          epoch: this.epoch,
          role: "pilot",
          space: this.proof,
          name: this.label,
          version: PROTOCOL_VERSION,
          ...(this.plan ? { plan: this.plan.ref } : {}),
        }),
      },
    ];
    if (this.plan && !samePlanRevision(hello.holds, this.plan.ref)) {
      actions.push({ send: peerId, message: this.planMessage() });
    }
    if (this.session) {
      actions.push({
        send: peerId,
        message: this.message("night", this.next(), {
          session: this.session,
          events: this.events,
          full: true,
        }),
      });
    }
    if (this.target) {
      actions.push({
        send: peerId,
        message: this.message("target", this.next(), targetBody(this.target)),
      });
    }
    if (this.guided) {
      actions.push({
        send: peerId,
        message: this.message("guided", this.next(), this.guided),
      });
    }
    return actions;
  }
}

function targetBody(target) {
  return {
    key: target.key ?? null,
    name: target.name ?? "",
    ...(target.target ? { target: target.target } : {}),
  };
}

/**
 * One shared night, replayed: the code's tag, proof and link, the codes read
 * back from `links`, and, for each step of `steps`, what the host did —
 * `{send, message}` (a wire message `{v, t, s, b}`), `{cut}` or
 * `{refused, type}` — then who is watching.
 *
 * A step is one of `{plan}`, `{night: {session, events}}`, `{target}`,
 * `{connect}`, `{receive: {from, message}}`, `{leave}`, `{stop: true}`,
 * `{guided: {v, evening}}` (GUIDED-EVENING-04). A `seen` received answers
 * `{seen, step}`.
 */
export function nightShareScript({
  code,
  label,
  deviceId,
  epoch,
  links = [],
  steps = [],
}) {
  const host = new HostCore({ code, label, deviceId, epoch });
  const replies = steps.map((step) => {
    if (step.plan) return host.setPlan(step.plan);
    if (step.night) return host.setNight(step.night.session, step.night.events);
    if (step.target) return host.setTarget(step.target);
    if (step.guided) return host.setGuided(step.guided);
    if (step.connect) return host.connected(step.connect);
    if (step.receive)
      return host.received(step.receive.from, step.receive.message);
    if (step.leave) return host.disconnected(step.leave);
    if (step.stop) return host.stop();
    return [];
  });
  return {
    tag: nightShareTag(code),
    proof: nightShareProof(code),
    link: nightShareLink(code),
    codes: links.map((link) => nightShareCodeOfLink(link)),
    steps: replies,
    watching: host.watching(),
  };
}
