# Astro Portal session event registry

This is the registry of the append-only vocabulary a session's field journal is
written in (`packages/portal/src/persistence/migrations.ts` migration 17, table
`session_events`). Two devices annotating the same session offline produce
two event sets whose synchronization is a union by `(session_id, event_id)` —
"idempotent union" (doctrine rule 1) — with no conflict possible, because
nothing here is ever updated or deleted. There is no update or delete
endpoint for an event, by design; a correction is a new event, not an edit of
an old one.

Every event type is designed for the field: one-handed, at night, often with
a glove on and the screen dimmed red. A type with no strictly required
payload field (`pause`, `resume`) is a single tap. A type that needs a
minimum of information (`note`, `target_started`, `target_finished`,
`target_skipped`, `equipment_issue`, `auto_time_confirmed`) asks for exactly
one thing. `condition` accepts a single tapped icon. None of the registered types
ever carries precise
position or any other personal data — a session's location, if any, is the
plan's, not the event's.

## The envelope

A client submits an array of these to `POST /v1/sessions/{id}/events`
(not implemented by this task). Schema:
[`session-events/event-envelope.schema.json`](session-events/event-envelope.schema.json).

```json
{
  "eventId": "01J8Z3K9QZ6N3S6R3E6G8H1234",
  "type": "note",
  "payload": { "text": "Guide star lost after the meridian flip." },
  "recordedAt": "2026-09-19T21:14:03.000Z"
}
```

- `eventId` is a ULID the **client** generates once, before the first send
  attempt, and replays unchanged on every retry. Together with the session it
  is the idempotency key the server's `PRIMARY KEY (session_id, event_id)`
  enforces: resending the same pair is a silent no-op, never a duplicate and
  never an error.
- `type` selects the payload schema below; a `type` outside the names
  in this registry is rejected.
- `payload` is validated against that type's own schema — `additionalProperties: false`
  throughout, so an unrecognized field is a validation error, not a
  silently-dropped one.
- `recordedAt` is the device's own clock. It is informational only: the
  debrief's "night passed" detection and every ordering decision use the
  server's `receivedAt`, assigned on arrival, never the device's.
- The envelope never names the originating device. The server sets
  `session_events.origin_device_id` itself, from the caller's device bearer
  token — a client cannot claim to be a device it is not. It sets in the same
  way the stored event's `source`: `astro-sync` when the token is the one of a
  device of the application Astro Sync, `declared` for anything else (the
  phone's or the web's gestures, a debriefing, a rework). A client cannot send
  it.

## The thirteen types

### `note`

**Purpose.** The catch-all field note — anything the other twelve types don't
already have a home for. **Emitted by** the observer, from either surface,
at any point in an open or paused session.

| Field        |     Required     | Type   | Notes                                                                                                  |
| ------------ | :--------------: | ------ | ------------------------------------------------------------------------------------------------------ |
| `text`       | one of the three | string | 1–500 characters.                                                                                      |
| `targetId`   |                  | string | Attaches the note to a target already named by a `target_started`.                                     |
| `pauseCause` | one of the three | object | `{ pauseEventId, cause }`, both required: gives a cause to a pause already in the journal.             |
| `appStopped` | one of the three | object | `{ from, to }`, two ISO 8601 instants, both required: the application did not run from `from` to `to`. |

```json
{ "text": "Guide star lost after the meridian flip." }
```

```json
{
  "pauseCause": {
    "pauseEventId": "01J8Z3K9QZ6N3S6R3E6G8H1234",
    "cause": "wind"
  }
}
```

```json
{
  "appStopped": {
    "from": "2026-10-02T21:12:00.000Z",
    "to": "2026-10-02T21:40:00.000Z"
  }
}
```

Invalid: `{}` (neither `text`, `pauseCause` nor `appStopped`); `{ "text": "" }`
(below `minLength`); `{ "pauseCause": { "cause": "wind" } }` (no
`pauseEventId`); `{ "appStopped": { "from": "2026-10-02T21:12:00.000Z" } }`
(no `to`); `{ "appStopped": { "from": "23:12", "to": "23:40" } }` (not
instants).

**The cause of a pause, given after the tap.** The journal is append-only, so
a cause chosen while the session is already paused — or the next morning — is
not an edit of the `pause` event: it is this note, naming the pause by its
`eventId`. It is the smallest additive form the registry allows (one optional
object on an existing type, no ninth type, nothing for a reader that ignores
it), and it needs no `text`. When several corrections name the same pause,
the latest by `recordedAt` (then `eventId`) wins; a correction always wins
over the pause's own `cause`. A correction naming an `eventId` that is not a
`pause` of the same session changes nothing.

A correction may also carry `text`: the person's own precision about that
pause (the sheet shown when a stopped night is resumed asks « Était-ce une
pause ? », a cause and « Une précision, si vous voulez »). The summary of the night reads the `text` of the latest correction
naming a pause as that pause's `note`. The resume itself writes, in order, a
`pause` dated at the stop, this correction, and a `resume` dated now; nothing
already in the journal is rewritten.

**The stretch the application did not run.** When the application is
closed by the system, frozen or restarted in the middle of an open session,
nothing is written while it is gone. The application keeps a last sign of
life on the device while a session is open; at its next cold start, if that
sign is more than a few minutes old and the session was open (not paused) at
that moment, it writes one note carrying `appStopped` `{ from, to }` — from
the last sign of life to the start — before anything else it owes. The
capture is assumed to have gone on (the telescope does not depend on the
phone): the session stays as it was and the time stays counted. A passage of
a target that runs through the stretch keeps its time, counted as automatic
time not confirmed yet (`session-passages`: `holeMs`, `holeConfirmed`), until
a later `auto_time_confirmed` of that target; a `pause` and a `resume` dated
at `from` and `to` (the observer's « J’étais en pause ») take it out of the
counted time like any pause. It is the same additive form as `pauseCause`:
one optional object on an existing type, no text, nothing for a reader that
ignores it. A note whose `to` is not after its `from` changes nothing.

**Is not:** a structured weather/seeing report (`condition`) or an equipment
failure report (`equipment_issue`) — either of those, even mentioned in
passing, belongs in its own typed event so the debrief and any later "planned
vs. achieved" analysis can read it back structurally instead of parsing free
text.

### `target_started`

**Purpose.** Marks the moment observation of one target began; timing comes
from the envelope, not from a payload field. **Emitted by** the observer,
tapping a target from the plan or naming one ad hoc, when a direct session has
no plan to draw from.

| Field         |    Required    | Type   | Notes                                                                                       |
| ------------- | :------------: | ------ | ------------------------------------------------------------------------------------------- |
| `targetId`    | one of the two | string | Catalogue id (e.g. `"m31"`, as in `GET /v1/targets`) or a plan item's own target reference. |
| `targetLabel` |                | string | Free display name, for an uncatalogued or custom target.                                    |
| `planItemId`  |                | string | The originating plan item, when started from a plan.                                        |
| `notes`       |                | string | ≤ 300 characters.                                                                           |
| `auto`        |                | `true` | Only on a start the device's clock wrote in automatic mode (see below). Absent: a gesture.  |
| `advance`     |                | enum   | `auto` / `manual`: the advance mode in force when this target started (see below).          |

At least one of `targetId`/`targetLabel` is required — an event naming no
target at all defeats its purpose.

```json
{ "targetId": "m31", "planItemId": "item-7" }
```

```json
{ "targetId": "m33", "planItemId": "m33", "auto": true, "advance": "auto" }
```

Invalid: `{ "notes": "Starting now." }` (neither `targetId` nor
`targetLabel`); `{ "targetId": "m33", "auto": false }` (`auto` is `true` or
absent); `{ "targetId": "m33", "advance": "clock" }` (outside the list).

**Automatic or manual move to the next target (`auto`, `advance`).** A plan
night moves on in one of two ways, chosen in the launch sheet and changeable
during the night. _Automatic_: when the now line reaches a target's slot, the
device starts it by itself, and finishes the previous one at its planned end;
those events carry `auto: true`, and the time they imply is _unconfirmed_
until an `auto_time_confirmed` names the target (the device cannot know that
the acquisition really moved on). _Manual_: the current target keeps counting
past its planned end until the observer's gesture; an overrun is written as an
ordinary plan revision of the next target (never an overlap), and no event
carries `auto`. `advance` records the mode in force when each target started:
the launch's first start carries the mode chosen in the launch sheet, and a
mode changed in the middle of a target is written at the next start only (a
second device learns it then). Both fields are additive: an event without them
reads as a gesture, in a mode the journal does not state.

**A target may be observed in several passages.** Each `target_started`
opens a _passage_ of its target, which ends at that target's own
`target_finished` or `target_skipped`, at the next `target_started` of
another target, or at the session's end; coming back to a target already
observed opens a second passage beside the first, never instead of it. A
`target_started` of the target already running continues its passage. The
time spent on a target is the sum of its passages, pauses deducted. The rule
is `sessionPassages` (`packages/portal/src/session-passages.js`, proved by
the public fixture `session-passages.json`); the summary of a night and the execution screen
both read it. No field changes: the events already say all this, only their
reading does.

**Is not:** a session start (that is `sessions.started_at`) and not
a frame-by-frame capture log (filter, exposure count, calibration — that
level of detail belongs to the log/FITS analysis).

### `target_finished`

**Purpose.** Marks the moment observation of one target ended. **Emitted by**
the observer, mirroring `target_started`'s identification fields so a client
or the debrief's prefill can match the pair by `targetId`/`targetLabel` and
session order.

| Field         |    Required    | Type   | Notes                                                        |
| ------------- | :------------: | ------ | ------------------------------------------------------------ |
| `targetId`    | one of the two | string | Same catalogue id used by the matching `target_started`.     |
| `targetLabel` |                | string | Same free label used by the matching `target_started`.       |
| `planItemId`  |                | string | The originating plan item, when started from a plan.         |
| `notes`       |                | string | ≤ 300 characters.                                            |
| `auto`        |                | `true` | Only on a finish the device's clock wrote in automatic mode. |

```json
{ "targetId": "m31", "notes": "Clouds rolled in, cut it short." }
```

```json
{ "targetId": "m31", "planItemId": "m31", "auto": true }
```

Invalid: `{ "planItemId": "item-7" }` (neither `targetId` nor `targetLabel`);
`{ "targetId": "m31", "auto": false }` (`auto` is `true` or absent).

**Closes one passage.** A `target_finished` ends the passage its target's
latest `target_started` opened (see « A target may be observed in several
passages » above); the target may be started again later, which opens
another passage. A finish naming a target that is not running closes
nothing.

**Is not:** a verdict on whether the target was fully captured or partially
captured — that classification is the debrief's `sessionAdjustments` (the
`partial` outcome), decided by a person looking back at the whole
night, not inferred field-side from one event. It is not the way a skipped
target is recorded either: that target was never observed and produces no
`target_finished` at all; it produces a `target_skipped` below.

### `target_skipped`

**Purpose.** Says that a planned target was **not** observed, so the journal
states it instead of staying silent. Without this type a partial night reads
as if the untouched targets had never been planned, and nothing can later
answer "why is this target not progressing?" — the question the multi-night
projects are built on. **Emitted by**
two producers, with the same payload: the **debriefing**, for every target
the person marked `skipped` or left unticked under `partial`; and the
**device in the field**, the moment the person gives a target up and moves on
— the field-side tap that saves them from having to remember it hours later.

| Field         |    Required    | Type   | Notes                                                                                  |
| ------------- | :------------: | ------ | -------------------------------------------------------------------------------------- |
| `targetId`    | one of the two | string | Same catalogue id a `target_started` would have used for this target.                  |
| `targetLabel` |                | string | Same free label a `target_started` would have used for this target.                    |
| `planItemId`  |                | string | The originating plan item, when the target came from a plan.                           |
| `reason`      |                | enum   | `weather` / `equipment` / `time` / `visibility` / `other`. Absent means "did not say". |
| `notes`       |                | string | ≤ 300 characters.                                                                      |

At least one of `targetId`/`targetLabel` is required, exactly as for
`target_started` — an event naming no target skips nothing in particular.

```json
{ "targetId": "m45", "planItemId": "m45", "reason": "weather" }
```

```json
{ "targetId": "ngc7000", "reason": "other", "notes": "Neighbour's floodlight." }
```

Invalid: `{ "reason": "weather" }` (neither `targetId` nor `targetLabel`);
`{ "targetId": "m45", "reason": "clouds" }` (outside the list).

**The five reasons, and why exactly these.** The list is short, closed and
stable on purpose. Short, because it is chosen one-handed in the dark and a
scrolling list is not; closed, because the point of recording a cause is to
count comparable causes across many nights, and free text cannot be counted;
stable, because a reason recorded in 2026 must still mean the same thing when
a multi-night project reads it back. Each entry names a different kind of
cause, so the choice is rarely ambiguous:

- `weather` — the **sky** was unusable: cloud, haze, wind, dew, frost. The
  whole night was affected, not this target in particular;
- `equipment` — the **setup** stopped this target: the mount could not reach
  it, a filter was missing, guiding or power failed;
- `time` — nothing went wrong; the **night ran out**, or an earlier target
  overran. This is the most common skip of a well-filled plan and the one a
  project most wants to distinguish from a failure;
- `visibility` — **this target** was unavailable where the person stood: too
  low, behind a tree, a building or the horizon, or drowned by the Moon. The
  discriminator against `weather` is whether the sky or the target was the
  problem;
- `other` — everything else, with `notes` carrying the detail. It is what
  keeps the four above from growing: a list that absorbs every new case stops
  being countable.

Deliberately absent: a `moon` entry (it is a `visibility` cause, and a
separate one would make "washed out by the Moon" ambiguous between two
buttons), and anything naming the person — tiredness, a change of mind, a
visitor. Those are real and they belong in `notes` behind `other`; a product
does not put a label on them in a log its owner re-reads for years.

**Is not:** a verdict on quality — a target that _was_ observed, well or
badly, produces `target_started`/`target_finished` and the debrief's
`modified` classification, never this. Not a deletion either: nothing leaves
the plan, which stays frozen with the target in it, and nothing leaves the
journal, which is append-only. A later `target_started` for the same target —
from a supplement, or from a second device — is appended beside this event,
not instead of it, and a reader shows both in order.

### `pause`

**Purpose.** Marks the session as paused — a meridian flip, a break, waiting
out a cloud. **Emitted by** the observer, one tap.

| Field    | Required | Type   | Notes                                                                                        |
| -------- | :------: | ------ | -------------------------------------------------------------------------------------------- |
| `reason` |          | string | ≤ 200 characters.                                                                            |
| `cause`  |          | enum   | `clouds` / `wind` / `dew` / `guiding` / `meridian_flip` / `equipment` / `fatigue` / `other`. |

```json
{}
```

```json
{ "reason": "Meridian flip." }
```

```json
{ "cause": "meridian_flip" }
```

Invalid: `{ "reason": 12 }` (wrong type); `{ "cause": "rain" }` (outside the
list).

**The eight causes.** The pause stays a single tap: the empty payload is
valid and stays the commonest. A cause, when the person gives one, lets the
debriefing count the time a night lost by cause instead of in one lump. The
list is closed for the same reasons as `target_skipped`'s (chosen one-handed
in the dark, countable across nights, stable for years); it is finer than
that list's `weather` on purpose, because a pause is where the night tells
clouds, wind and dew apart:

- `clouds`, `wind`, `dew` — the sky (`dew` covers frost too);
- `guiding` — the guide star was lost, or the guiding would not settle;
- `meridian_flip` — the flip itself, a planned pause and not a failure;
- `equipment` — anything else in the setup: power, focus, a cable, the mount;
- `fatigue` — the observer needed a rest (the
  eighth cause, offered too when a stopped night is resumed);
- `other` — everything else, with `reason` carrying the detail.

A device that pauses at once and offers the causes afterwards (the mobile
application does) records the chosen cause as a correction `note` (see
`note`, "The cause of a pause, given after the tap"), never by holding the
pause back until a cause is picked.

**Is not:** the end of the session (`finished`) — a paused session is still
open and resumable, and the in-field rule holds while it
is: no resolution or debrief prompt is ever shown for an open or paused
session on the device that holds it.

### `resume`

**Purpose.** Marks the session as resumed after a `pause`. **Emitted by** the
observer, one tap; pairing with the pause it ends is by session order, not by
an id carried in either payload.

| Field                  | Required | Type   | Notes                                                                                                                                |
| ---------------------- | :------: | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `note`                 |          | string | ≤ 200 characters.                                                                                                                    |
| `policy`               |          | enum   | `crop` or `shift`: the resume sheet's choice (rogner / décaler the rest of the night), kept in the journal beside the resume itself. |
| `pauseDurationMinutes` |          | number | ≥ 0. The real elapsed duration of the pause this resume ends, in minutes, as the resume sheet computed it.                           |

```json
{}
```

```json
{ "policy": "shift", "pauseDurationMinutes": 25 }
```

Invalid: `{ "note": null }` (wrong type — omit the field instead),
`{ "policy": "stretch" }` (not `crop` or `shift`) and
`{ "pauseDurationMinutes": -1 }`.

**Is not:** a guarantee that a `pause` precedes it in the journal — the
server accepts the event regardless of prior state (append-only, no state
machine enforced at the schema level); a `resume` with no preceding `pause`
is simply a fact this journal records as-is.

### `condition`

**Purpose.** A weather/seeing field note. **Emitted by** the observer, from a
one-tap sky-state icon or a couple of quick numbers.

| Field          |    Required     | Type    | Notes                                                                                                  |
| -------------- | :-------------: | ------- | ------------------------------------------------------------------------------------------------------ |
| `sky`          | one of the four | enum    | `clear` / `mostly_clear` / `partly_cloudy` / `mostly_cloudy` / `overcast` / `fog` / `hazy` / `cloudy`. |
| `seeing`       | one of the four | integer | 1 (poor) – 5 (excellent).                                                                              |
| `transparency` | one of the four | integer | 1 (poor) – 5 (excellent).                                                                              |
| `notes`        | one of the four | string  | ≤ 300 characters.                                                                                      |
| `cause`        | one of the four | enum    | `clouds` / `wind` / `dew`: what in the sky is the trouble right now.                                   |

At least one of the fields is required — an empty `condition` event carries
no information. `cause` is what tells wind and dew apart from clouds when a
target is given up for `weather` (`target_skipped`'s list stays as it is): the
debriefing counts such a skip under the `cause` of the latest condition
carrying one recorded before it, and under clouds when none does.

```json
{ "sky": "clear", "seeing": 4 }
```

Invalid: `{}` (none of the four present); `{ "seeing": 6 }` (out of range).

**Is not:** a precise-position weather reading — no coordinates are part of
this payload, unlike `GET /v1/weather`'s provider-backed forecast; it is a
human's one-line impression of the sky, logged where it happened in the
timeline.

### `equipment_issue`

**Purpose.** Reports a problem with equipment. **Emitted by** the observer,
as soon as something misbehaves.

| Field         | Required | Type   | Notes                                                                 |
| ------------- | :------: | ------ | --------------------------------------------------------------------- |
| `description` |    ✓     | string | 1–300 characters.                                                     |
| `equipmentId` |          | string | One of the tenant's own inventory items (`GET /v1/equipment`).        |
| `severity`    |          | enum   | `minor` (noted, kept going) / `blocking` (session paused or stopped). |

```json
{ "description": "Guiding lost, RMS spiking.", "severity": "blocking" }
```

Invalid: `{ "severity": "blocking" }` (missing `description`).

**Is not:** a weather/seeing report (`condition`), and not itself a `pause` —
a blocking issue that halts the session still needs its own `pause` event if
the observer wants the session marked paused; this registry does not infer
one state change from another.

### `auto_time_confirmed`

**Purpose.** The observer confirms the time the device's clock counted on one
target in automatic mode. **Emitted by** the observer, one tap on «
Confirmer » beside « 01:30 comptée automatiquement, pauses déduites » in the
list of the night's targets.

| Field         |    Required    | Type   | Notes                                                                   |
| ------------- | :------------: | ------ | ----------------------------------------------------------------------- |
| `targetId`    | one of the two | string | Same catalogue id the target's `target_started`/`target_finished` used. |
| `targetLabel` |                | string | Same free label, for a target with no catalogue id.                     |
| `planItemId`  |                | string | The originating plan item, when the target came from a plan.            |

```json
{ "targetId": "m31", "planItemId": "m31" }
```

Invalid: `{ "planItemId": "m31" }` (neither `targetId` nor `targetLabel`);
`{ "targetId": "m31", "minutes": 90 }` (unknown field).

**Why an event, not a field.** The journal is append-only: a confirmation
given after the fact cannot be set on the `target_started`/`target_finished`
it confirms. This event confirms every event of the same target carrying
`auto: true` that comes before it in session order (by `recordedAt`, then
`eventId`); an `auto` event written after it is unconfirmed until a later
confirmation. Naming a target that has no `auto` event changes nothing. The
execution screen and the debriefing read the same rule, so the time is shown
« auto » in both until confirmed.

**Is not:** a verdict on the target (the debriefing's `sessionAdjustments`
still says done, modified, partial or skipped), and not an edit of the
counted time: confirming says the clock's account is right, nothing more.

## The four kinds detected by Astro Sync

Astro Sync reads a night's
files and logs and finds facts that no gesture of the observer declared; four
of them had no kind to be written in. They are ordinary events of the journal,
written by Astro Sync through `POST /v1/sessions/{id}/events` with its own
device token (the service then stores `source: "astro-sync"`), at the instant
of the first finding (`recordedAt`). Each payload carries **structured
fields**, from which every application composes its own sentence in the
person's language, and an optional `description` (≤ 300 characters), the
sentence for an application that does not know the type yet. They are a
**point** on the night's timeline (the pause stays the only interval); the
span of a group is in `firstAt` / `lastAt`.

**One event per group.** The guiding timeouts and the guiding spikes found in
one night are not written one by one: close findings make **one** event with
`count`, `firstAt` and `lastAt`. Two findings of the same kind more than
**60 minutes** apart belong to two
groups. The rule is the emitter's (Astro Sync); the service stores what it is
given, checking only the payload.

**Private in a shared night.** These four types describe the equipment: the
shared night (`night-share-link`) never carries them, like `note` and
`equipment_issue`.

**An unknown type is tolerated by a reader.** A newer service may store a type
this version does not know. A reader shows it as an ordinary report (« Signalement
», the `description` of its payload when it has one), never as a note, never
as an error, and without the mention of an origin.

### `exposure_change`

| Field         | Required | Type   | Notes                                |
| ------------- | :------: | ------ | ------------------------------------ |
| `fromSeconds` |   yes    | number | 0.001–86 400, the previous exposure. |
| `toSeconds`   |   yes    | number | 0.001–86 400, the new exposure.      |
| `description` |          | string | ≤ 300 characters.                    |

```json
{ "fromSeconds": 120, "toSeconds": 180 }
```

Invalid: `{ "toSeconds": 180 }` (no `fromSeconds`); `{ "fromSeconds": 0, "toSeconds": 180 }` (below the minimum).

### `guiding_timeouts`

| Field         | Required | Type    | Notes                                     |
| ------------- | :------: | ------- | ----------------------------------------- |
| `count`       |   yes    | integer | ≥ 1, the timeouts of the group.           |
| `firstAt`     |   yes    | instant | ISO 8601, the first timeout of the group. |
| `lastAt`      |   yes    | instant | ISO 8601, the last one.                   |
| `description` |          | string  | ≤ 300 characters.                         |

```json
{
  "count": 11,
  "firstAt": "2026-08-14T23:44:10Z",
  "lastAt": "2026-08-15T05:44:02Z"
}
```

Invalid: `{ "count": 0, "firstAt": "…", "lastAt": "…" }` (below the minimum); `{ "count": 3 }` (no span).

### `sensor_temperature_drift`

| Field         | Required | Type   | Notes                                  |
| ------------- | :------: | ------ | -------------------------------------- |
| `fromCelsius` |   yes    | number | −100 to 100, the temperature at first. |
| `toCelsius`   |   yes    | number | −100 to 100, the temperature after.    |
| `description` |          | string | ≤ 300 characters.                      |

```json
{ "fromCelsius": -10, "toCelsius": -6 }
```

Invalid: `{ "fromCelsius": -10 }` (no `toCelsius`).

### `guiding_spikes`

| Field           | Required | Type    | Notes                                   |
| --------------- | :------: | ------- | --------------------------------------- |
| `count`         |   yes    | integer | ≥ 1, the spikes of the group.           |
| `maxArcSeconds` |   yes    | number  | ≥ 0, the largest error, in arcseconds.  |
| `firstAt`       |   yes    | instant | ISO 8601, the first spike of the group. |
| `lastAt`        |   yes    | instant | ISO 8601, the last one.                 |
| `description`   |          | string  | ≤ 300 characters.                       |

```json
{
  "count": 3,
  "maxArcSeconds": 9.0,
  "firstAt": "2026-08-15T02:10:00Z",
  "lastAt": "2026-08-15T03:08:00Z"
}
```

Invalid: `{ "count": 3, "firstAt": "…", "lastAt": "…" }` (no `maxArcSeconds`).

**What a rework does with them.** A person can remove one (the bin of
« Remanier »: `eventRemovals`), never correct it: `session-rework` adds and
replaces only `note`, `condition`, `equipment_issue` and `pause`.

## The pointing-device kinds

The mount's events are kept in the session (they are useful afterwards to
understand what happened). Until then a night run with a mount held only `target_started` /
`target_finished`: no GoTo, no STOP, no lost link, no park. The application now
writes these kinds from the code path of every driver, with the night's clock
(`recordedAt` is the device's instant; a reader shows it in the place's time
zone, UTC without one). They are **additive and optional**: every field but the
ones marked required is optional, and a service or an application that does not
know a type shows it as an ordinary report.

**One naming scheme.** `mount_*` — the night's mount link, whatever the
protocol (LX200, Alpaca, INDI, SynScan, iOptron, NexStar; a smart telescope in
mode simplifié is driven through the same link and writes these too).
`device_*` — a smart telescope in mode expérimental, which has its own link.
`pointing_help` — the pointing helps (the aiming with the phone's camera, the
mount's « Aide au pointage »). A GoTo, a park and a sync each write **one event
per outcome** (`sent` then `arrived`; `requested` then `parked`), so a command
that never ended stays visible.

**Private in a shared night.** They describe the equipment: the shared night
(`night-share-link`) never carries them.

**Written once per fact.** Nothing is written by a poll (one bounded
exception: the instrument's samples, « The instrument kind » below): an event is the
consequence of a gesture (a GoTo, a STOP, a park, a sync, a pointing help) or
of a change of the link (`*_link_lost`, `*_link_back`, `*_connected`). A
gesture made before the session exists (the link is opened on the sheet « Exécuter le plan » before the first
event) is held on the device and written, with its own instant, when the
session is born.

| Type                 | Required            | Optional fields                                                                               |
| -------------------- | ------------------- | --------------------------------------------------------------------------------------------- |
| `mount_connected`    |                     | `protocol`, `mountName`, `family`                                                             |
| `mount_goto`         | `outcome`           | `targetId`, `targetLabel`, `gapDegrees`, `refusedBy`, `reason`, `protocol`                    |
| `mount_stop`         |                     | `cause` (`person`, `night_end`), `protocol`                                                   |
| `mount_link_lost`    |                     | `protocol`                                                                                    |
| `mount_link_back`    |                     | `protocol`                                                                                    |
| `mount_disconnected` |                     | `protocol`                                                                                    |
| `mount_parked`       | `outcome`           | `reason`, `protocol`                                                                          |
| `mount_aligned`      | `outcome`           | `targetId`, `targetLabel`, `refusedBy`, `reason`, `protocol`                                  |
| `pointing_help`      | `method`, `outcome` | `targetId`, `targetLabel`, `gapDegrees`, `rounds`, `turnAskedDegrees`, `turnAnswer`, `sensor` |
| `device_connected`   |                     | `family`, `model`                                                                             |
| `device_goto`        | `outcome`           | `targetId`, `targetLabel`, `reason`, `family`                                                 |
| `device_stop`        |                     | `cause`, `outcome` (`sent`, `refused`), `family`                                              |
| `device_parked`      | `outcome`           | `reason`, `family`                                                                            |
| `device_link_lost`   |                     | `family`                                                                                      |
| `device_link_back`   |                     | `family`                                                                                      |

`mount_link_lost` is a connection that dropped without being asked to;
`mount_disconnected` is the person closing the link (« Déconnecter »): a reader
says it apart (« Déconnectée par vous », never « Liaison perdue ») and pairs it
with nothing.
`mount_goto.outcome`: `sent`, `arrived` (`gapDegrees` read from the mount),
`refused` (`refusedBy`: `safety`, `mount`, `no_coordinates`).
`mount_parked.outcome`: `requested`, `parked`, `refused`.
`mount_aligned.outcome`: `synced`, `refused`.
`pointing_help.method`: `manual`, `mount`; `outcome`: `centred`, `failed`,
`refused`, `stopped`, `lost`.
`pointing_help.turnAnswer` (with `turnAskedDegrees`): `continued`, `declined` — the
answer to « La monture va tourner de N° : continuer ? », asked by the mount-driven
course before an automatic adjustment that turns the mount more than 3°.
`pointing_help.sensor` (CAM-4): `phone`, `aimingPhone`, `camera` — who measured the
mount-driven course (this phone, the aiming phone on the tube, the telescope's camera).

```json
{
  "outcome": "arrived",
  "targetId": "m110",
  "targetLabel": "M110",
  "gapDegrees": 0.2
}
```

Invalid: `{ "targetId": "m110" }` (no `outcome`); `{ "outcome": "done" }` (not
in the list); `{ "outcome": "sent", "ra": 0.7 }` (a position is never written).

**What a rework does with them.** Nothing: a rework neither corrects nor
removes them (they are not the person's words).

## The plan-edited kind

A plan changed during the night is a fact of the night (« every
change must be in the session's events »). Until then adding a
target while the night ran left no trace: the debriefing called the target
« Ajoutée sur le terrain · Pas dans le plan » although it was in the plan,
while the targets it pushed showed their new hours. The application now writes
**one `plan_edited` event per applied change**: the single add of the « + » of
the list, the undo the person gives it a few seconds later, and the whole of an
« Édition de la nuit » once « Valider les changements » applied it. It is
**additive and optional**: a service or an application that does not know the
type shows it as an ordinary report.

| Field     | Required               | Type                  | Notes                                                                                                                                                                                                                    |
| --------- | ---------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `origin`  |                        | `add`, `undo`, `edit` | How the change was made.                                                                                                                                                                                                 |
| `added`   | one of the three lists | array (1 to 60)       | `{ targetId or targetLabel, planItemId?, startMinute, endMinute }`: the targets put in the plan, with the slot they got.                                                                                                 |
| `removed` | (non-empty)            | array (1 to 60)       | `{ targetId or targetLabel, planItemId?, noTimeTonight? }`: the targets taken out of tonight's plan; `noTimeTonight: true` when the target stays a line of the plan with no time tonight (another target took its slot). |
| `moved`   |                        | array (1 to 60)       | `{ targetId or targetLabel, planItemId?, fromStartMinute?, fromEndMinute?, startMinute, endMinute }`: a target that stays, with its new slot.                                                                            |

Slots are minutes counted from the start of the night of the plan, the unit of
`plan.items[].startMinute` / `endMinute`.

```json
{
  "origin": "add",
  "added": [
    {
      "targetId": "m45",
      "planItemId": "m45",
      "startMinute": 294,
      "endMinute": 354
    }
  ],
  "moved": [
    {
      "targetId": "ngc253",
      "planItemId": "ngc253",
      "fromStartMinute": 254,
      "fromEndMinute": 274,
      "startMinute": 314,
      "endMinute": 334
    }
  ]
}
```

Invalid: `{}` and `{ "added": [] }` (nothing changed); `{ "added": [{ "targetId":
"m45" }] }` (no slot); `{ "removed": [{ "planItemId": "m45" }] }` (neither
`targetId` nor `targetLabel`); `{ "added": [...], "plan": {} }` (the plan itself
is never written: the plan is the plan's).

**What a reader does with it.** The debriefing counts a target named in
`added` as a target of the plan: its promise is the slot of the event (« Prévu
02:54 → 03:54 »), never « Pas dans le plan »; a target named in `moved` shows
its new hours. Not a report on a target, and it never moves the night's window.
Not private in a shared night (the plan is shared).

**What a rework does with it.** Nothing: a rework neither corrects nor removes
it.

## The instrument kind

Added by SMART-SCOPE-INSTRUMENT-PANEL-01 (contract revision 2026-11-03),
**additive and optional**: a service, an application or an Astro Sync that
predates it stores it or ignores it like any type it does not know (an
ordinary report at most, never an error), and nothing it already reads
changes.

A smart telescope in mode expérimental says things of itself while the night
runs: the filter it carries (a Vespera's `status.filter`, a Seestar's
built-in light-pollution filter, a DWARF's `ir`), its hygrometer (humidity,
temperature, dew-point depression), its dew heater, its battery, its
temperatures, the frames of the capture under way with the ones it rejected
and why, and the pointing attempts that failed. `device_instrument` keeps
them with the session, so that the session's statistics can say « Filtre
double bande monté de 19:46 à 21:09 » or « 190 rejetées : étoiles non
rondes » afterwards.

**A sample, not a poll.** It is the one exception to « nothing is written by
a poll » above, and a bounded one: the application reads the device every few
seconds but writes **one sample every 5 minutes and one at each change** (a
filter mounted or removed, the heater switching, the target changing, a
pointing given up; rejected frames climbing, at most one every 2 minutes) —
about 130 samples of 100 bytes for a night of 11 hours. A sample carries
only what the device said at that instant; a field it did not say is absent,
never guessed. The application writes nothing before the session exists.

**When the application was closed.** The system cuts the network of an
application in the background: no sample is written while it is gone (the
`note`'s `appStopped` says the stretch when the system killed it). A reader
sees the hole as two live samples more than 12 minutes apart. At the
reopening the application reads back what the device kept (a Vespera's
previous operations: the frames kept and rejected, the pointing given up; a
Seestar's last stack) and writes it as `origin: rebuilt`, dated when it was
read, with `endedAt` when the device says when its capture ended. Humidity,
heater and battery during the hole are lost: a reader says « relevés jusqu’à
20:30 ».

| Field                                   | Type                 | Notes                                                                                              |
| --------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------- |
| `family`                                | string               | `vespera`, `seestar`, `dwarf`.                                                                     |
| `origin`                                | `live`, `rebuilt`    | `live` when absent.                                                                                |
| `reason`                                | `interval`, `change` | Why the sample was written.                                                                        |
| `endedAt`                               | ISO 8601             | With `rebuilt`: when the device's capture ended.                                                   |
| `targetId`, `targetLabel`               | string               | The target the device works on.                                                                    |
| `captureId`                             | string               | The device's capture; its counts only grow, a reader keeps the largest.                            |
| `filter`                                | enum                 | `none`, `dual_band`, `cls`, `light_pollution`, `other` (+ `filterLabel`, the device's word).       |
| `humidity`                              | number               | Percent.                                                                                           |
| `temperature`, `dewPointDepression`     | number               | °C, the hygrometer's.                                                                              |
| `heater`                                | `on`, `off`          | The dew heater.                                                                                    |
| `battery`, `charging`                   | integer, boolean     | The device's own battery.                                                                          |
| `boardTemperature`, `overheated`        | number, boolean      | A Seestar's board.                                                                                 |
| `temperatureMin`, `temperatureMax`      | number               | A DWARF's capture.                                                                                 |
| `framesTaken`, `framesStacked`          | integer              | The capture's frames.                                                                              |
| `framesRejected`, `rejections`          | integer, array       | `rejections`: `[{ cause, count }]`, the device's code (`StackingRoundnessError`) or `star_trails`. |
| `pointingFailures`, `pointingAbandoned` | integer, boolean     | Failed attempts on the target; given up.                                                           |

At least one reading is present (`filter`, `humidity`, `temperature`,
`heater`, `battery`, `boardTemperature`, `temperatureMin`, `temperatureMax`,
`framesTaken`, `framesStacked`, `framesRejected`, `pointingFailures`,
`pointingAbandoned`).

```json
{
  "family": "vespera",
  "reason": "change",
  "targetLabel": "IC 1805",
  "captureId": "observation-253",
  "filter": "dual_band",
  "humidity": 81,
  "temperature": 12,
  "dewPointDepression": 4,
  "heater": "on",
  "battery": 74,
  "framesTaken": 13,
  "framesStacked": 9,
  "framesRejected": 4,
  "rejections": [{ "cause": "StackingRoundnessError", "count": 4 }]
}
```

Invalid: `{ "family": "vespera" }` (no reading); `{ "filter": "DUAL" }` (the
device's own word goes in `filterLabel` with `other`, the known ones are
named); `{ "humidity": 81, "ra": 40.5 }` (a position is never written);
`{ "rejections": [{ "cause": "étoiles non rondes", "count": 4 }] }` (a
cause is a machine word, never a sentence).

**What a reader does with it** (`session-instrument-lines.js` on the web,
and the phone's own reader; the shared fixture
`session-instrument-summary.json` pins that the two read a journal alike):
one line per fact of the night — the filter's stretches, the humidity's
range and the smallest dew-point depression, the heater's stretches, the
frames kept and rejected by cause (the largest count of each capture,
summed), the targets given up, the battery from first to last — and a line
that says where the samples stop when the application was closed. It moves
no window, ends no passage and is no report on a target. **Private in a
shared night**, like the other `device_*` kinds. A rework neither corrects
nor removes it.

## The guided-evening kind

A guided evening (`packages/astro-core/sky-data/guided-evenings/`, the
application's « Soirée guidée ») walks one target at a time. To the naked eye,
with binoculars or on a tripod without aid it writes nothing: it stays on the
phone (a card of its Journal) and counts for nothing. With the pointing aid, a
mount or the share it runs under the night's execution; at its end
(« Terminer la soirée », or closed the morning after) the application writes
**one `guided_evening` event** in that session, so the session's page shows
the evening as the phone's Journal does. It is **additive, optional and
versioned** (`version`, 1): a service or an application that does not know
the type shows it as an ordinary report; a later version is a new schema.

| Field             | Required | Type    | Notes                                                                               |
| ----------------- | :------: | ------- | ----------------------------------------------------------------------------------- |
| `version`         |   yes    | integer | 1.                                                                                  |
| `evening`         |   yes    | string  | The route's id (`brightest-stars-tonight`, `season-constellations`, …).             |
| `title`           |          | string  | The route's title as the application showed it, in the observer's language (1–200). |
| `mode`            |   yes    | enum    | `naked`, `binoculars`, `tripod`, `mount`, `smartTelescope` (`observingModes`).      |
| `help`            |          | enum    | `none`, `aim` (« Aide au pointage »), `refine` (« Affinage du GoTo »).              |
| `stepsSeen`       |   yes    | integer | The steps moved past with « Étape suivante » (0–200).                               |
| `stepCount`       |   yes    | integer | The route's steps that evening (1–200).                                             |
| `startedAt`       |   yes    | string  | The evening's start, UTC instant.                                                   |
| `finishedAt`      |   yes    | string  | Its end, UTC instant.                                                               |
| `durationMinutes` |          | integer | From the start to the end, whole minutes.                                           |
| `kids`            |          | boolean | « Pour les enfants » was on at some point of the evening.                           |

```json
{
  "version": 1,
  "evening": "brightest-stars-tonight",
  "title": "Les dix étoiles les plus brillantes",
  "mode": "tripod",
  "help": "aim",
  "stepsSeen": 7,
  "stepCount": 10,
  "startedAt": "2026-10-14T19:40:00.000Z",
  "finishedAt": "2026-10-14T20:45:00.000Z",
  "durationMinutes": 65,
  "kids": true
}
```

Invalid: `{}`; a payload without `version`, `evening`, `mode`, the two counts
or the two instants; `{ "mode": "telescope", … }` (not a way of observing);
`{ "stepCount": 0, … }`; a place or a name (`additionalProperties: false`:
nothing personal is ever written).

**What a reader does with it.** The session's page says « Soirée guidée :
Les dix étoiles les plus brillantes · sur pied, aide au pointage · 7 étapes
vues sur 10 · 1 h 05 · pour les enfants ». Not a report on a target and no
time of the night: it moves no window and ends no passage. Not private in a
shared night (it describes no equipment).

**What a rework does with it.** Nothing.

## Schema files

| Type                       | Schema                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| envelope                   | [`session-events/event-envelope.schema.json`](session-events/event-envelope.schema.json)                     |
| `note`                     | [`session-events/note.schema.json`](session-events/note.schema.json)                                         |
| `target_started`           | [`session-events/target-started.schema.json`](session-events/target-started.schema.json)                     |
| `target_finished`          | [`session-events/target-finished.schema.json`](session-events/target-finished.schema.json)                   |
| `target_skipped`           | [`session-events/target-skipped.schema.json`](session-events/target-skipped.schema.json)                     |
| `pause`                    | [`session-events/pause.schema.json`](session-events/pause.schema.json)                                       |
| `resume`                   | [`session-events/resume.schema.json`](session-events/resume.schema.json)                                     |
| `condition`                | [`session-events/condition.schema.json`](session-events/condition.schema.json)                               |
| `equipment_issue`          | [`session-events/equipment-issue.schema.json`](session-events/equipment-issue.schema.json)                   |
| `auto_time_confirmed`      | [`session-events/auto-time-confirmed.schema.json`](session-events/auto-time-confirmed.schema.json)           |
| `exposure_change`          | [`session-events/exposure-change.schema.json`](session-events/exposure-change.schema.json)                   |
| `guiding_timeouts`         | [`session-events/guiding-timeouts.schema.json`](session-events/guiding-timeouts.schema.json)                 |
| `sensor_temperature_drift` | [`session-events/sensor-temperature-drift.schema.json`](session-events/sensor-temperature-drift.schema.json) |
| `guiding_spikes`           | [`session-events/guiding-spikes.schema.json`](session-events/guiding-spikes.schema.json)                     |
| `mount_connected`          | [`session-events/mount-connected.schema.json`](session-events/mount-connected.schema.json)                   |
| `mount_goto`               | [`session-events/mount-goto.schema.json`](session-events/mount-goto.schema.json)                             |
| `mount_stop`               | [`session-events/mount-stop.schema.json`](session-events/mount-stop.schema.json)                             |
| `mount_link_lost`          | [`session-events/mount-link-lost.schema.json`](session-events/mount-link-lost.schema.json)                   |
| `mount_link_back`          | [`session-events/mount-link-back.schema.json`](session-events/mount-link-back.schema.json)                   |
| `mount_disconnected`       | [`session-events/mount-disconnected.schema.json`](session-events/mount-disconnected.schema.json)             |
| `mount_parked`             | [`session-events/mount-parked.schema.json`](session-events/mount-parked.schema.json)                         |
| `mount_aligned`            | [`session-events/mount-aligned.schema.json`](session-events/mount-aligned.schema.json)                       |
| `pointing_help`            | [`session-events/pointing-help.schema.json`](session-events/pointing-help.schema.json)                       |
| `device_connected`         | [`session-events/device-connected.schema.json`](session-events/device-connected.schema.json)                 |
| `device_goto`              | [`session-events/device-goto.schema.json`](session-events/device-goto.schema.json)                           |
| `device_stop`              | [`session-events/device-stop.schema.json`](session-events/device-stop.schema.json)                           |
| `device_parked`            | [`session-events/device-parked.schema.json`](session-events/device-parked.schema.json)                       |
| `device_link_lost`         | [`session-events/device-link-lost.schema.json`](session-events/device-link-lost.schema.json)                 |
| `device_link_back`         | [`session-events/device-link-back.schema.json`](session-events/device-link-back.schema.json)                 |
| `plan_edited`              | [`session-events/plan-edited.schema.json`](session-events/plan-edited.schema.json)                           |
| `device_instrument`        | [`session-events/device-instrument.schema.json`](session-events/device-instrument.schema.json)               |
| `guided_evening`           | [`session-events/guided-evening.schema.json`](session-events/guided-evening.schema.json)                     |
