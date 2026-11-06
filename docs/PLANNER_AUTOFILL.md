# Filling a night automatically

« Fill the night » proposes a night's worth of targets for the free time of a
plan. It is a proposal to read, target by target, before it is applied; it
never changes what the plan already holds.

The rules are written once in the open core
(`packages/planner/src/auto-fill.js`, `autoFillNight`) and pinned by the
planner fixtures `auto-fill-night` and `auto-fill-free-slots`. The algorithm
is deterministic: the same night, plan and equipment give the same proposal on
every client.

1. **The candidates** are the planner's catalogue for the plan's place, night
   and equipment, without the targets already in the plan, each with its score
   of the night ([the score of a target](PLANNER_SCORE.md)).
2. **The order**: the share of the score's own maximum, highest first (compared
   by cross-multiplication, never a rounded percent); a target without a score
   last; ties go to the earlier culmination, then to the identifier.
3. **The placement**: inside the plan's night (the custom span of the night
   when there is one) and its free time, each candidate goes through the
   placement cascade used when a target is added by hand (ideal position,
   free slot, shortened slot; an overlap is never accepted). A slot lasts the
   target's recommended time, between **45 and 180 minutes**; a target the
   cascade can only shorten below 45 minutes is skipped. At most **six**
   targets are proposed.
4. **The reasons**: each target says why it is where it is (it crosses the
   meridian at a time, it culminates before the dew, it is high from the start
   of the night, or the best free slot it found); each free slot of 15 minutes
   or more that is left says why it is empty (clouds, dew, the Moon, no target
   above the minimum altitude, the limit of six, a slot too short).

Applying adds the targets kept to the plan in **one** edit, so a single
« Undo » takes them all back. The numbers 45, 180, 6 and 15 are
`autoFillRule`; changing one is a change of the rule and of its fixtures.

## Suggestions for a requested count

`suggestNight` (`packages/planner/src/suggest-night.js`) opts into the extended
`autoFillNight` result. There is one placement engine; calls without any new
suggestion argument keep the original result and six-target limit.
`autoFillFreeSlots` is unchanged. The suggestions are part of the open core.

Pass the same candidates, night, span, plan items, forecast, Moon series,
filters and mode, with the following additional inputs:

| Input             | Meaning                                                                                                                                                                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `count`           | Positive integer maximum, or `"all"` without the six-target limit; defaults to 6.                                                                                                                                                                                                         |
| `kept`            | Checked slots, `{ id, startMinute, endMinute }`, or previous result items; positions and supplied fields are retained. They count toward the requested maximum.                                                                                                                           |
| `excluded`        | Previously proposed target ids to leave out.                                                                                                                                                                                                                                              |
| `history`         | `{ id, date, outcome, mode?, acquiredMinutes?, plannedMinutes?, noteThen? }`, one row per target and night; `done` is captured in imaging, `done` and `observed` in visual. `partial` and `abandoned` never mark a capture; a `partial` row counts, at what was done, in the malus below. |
| `continuing`      | `{ id, acquiredMinutes, goalMinutes, projectName }`; unfinished goals rank first, by score among themselves.                                                                                                                                                                              |
| `excludeCaptured` | Defaults to false: a captured target stays in the pool and pays a malus (below). True leaves the captured targets out and ranks without any malus.                                                                                                                                        |
| `noteNow`         | Tonight's note (0 to 100) for the night, place and slot suggested for; absent or unknown, tonight's sky brings no credit.                                                                                                                                                                 |
| `date`            | The night's civil date, to count the age of the last time; defaults to the date of the night's start.                                                                                                                                                                                     |
| `tier`            | Positive decade number; defaults to 1. The displayed position is 1–10, 11–20, etc.                                                                                                                                                                                                        |
| `seed`            | Optional string; omitted for the sheet's first, strict list.                                                                                                                                                                                                                              |
| `only`            | Application selection: these ids alone are placed again in strict ranking order, without substitute targets.                                                                                                                                                                              |
| `layout`          | `"night"` (default) or `"list"` (ten independent suggestions for the home).                                                                                                                                                                                                               |

The pool leaves out plan targets, kept slots and exclusions; with
`excludeCaptured` it also leaves out the captured targets. Every captured
target encountered in that pool is reported with its latest captured date,
whatever the switch says. Continuing targets
carry `group: "continue"` and their `progress`; the others carry `group: "night"`.
A target already at its goal has no priority.

**The malus of a target already done.** A target with a last time (its most
recent `done`, `partial` or, in visual, `observed` row) pays
`40 × done × age × (1 − lift)` points, to a tenth, taken off its percentage of
tonight's suitability to rank it (never under 0). `done` is what was done, 0 to
1 (photo: the acquired minutes over the target's recommended integration, else
the plan's minutes, else complete; visual: minutes over 20); `age` is
`0.5 ^ (days / half-life)`, the half-life being 270 days in photo and 45 in
visual, and the malus is 0 under 0.05; `lift` is what tonight brings over that
time, `(noteNow − noteThen) / 30` between 0 and 1, at most 0.5 when `noteThen`
is 64 or more, 0 when a note is unknown. The constants are one table
(`suggestionMalusRule`) and the function `suggestionMalus` is replayed by the
shared fixture `suggestion-malus`. The comparison is the exact score
cross-product while neither target pays a malus. The continuing group and a
request with `only` are exempt; each ranked target with a last time carries
`previous: { date, outcome, noteThen, noteNow, malus }`.

Otherwise the strict score comparison is unchanged. Variety defers a fourth target of
the same known object type to the next decade; unknown types have no cap.
Checked targets count toward the same cap, and a sparse pool never fills a
sheet with more than three of one type per ten selected targets. Decades may
therefore be incomplete. A seeded decade sorts by the score share on 100 with
an offset in **[−3, +3]**; continuing targets remain first and unscored targets
last. Tiers never exchange members. Rows from tier 2 onward are `lowered` and
retain their score.

`suggestionSeed({ date, latitude, longitude, tier })` builds
`YYYY-MM-DD|latitude|longitude`, coordinates to two decimals; supplying `tier`
appends `|tier` for refresh. `hashSuggestionSeed` is FNV-1a over UTF-16 code
units (initial state 2166136261, multiplier 16777619). The generator is
xorshift32 (left 13, unsigned right 17, left 5), unsigned 32-bit state, divided
by 4294967296. A zero hash uses state 1. These integer rules and the stream
fixtures make the sequence reproducible bit for bit in any language.

Imaging retains recommended slots of **45–180 min**, with a **45 min** floor.
Visual uses **20 min**, never shortened. A candidate that cannot fit is
skipped. The plan and kept slots never move. Unticking is a caller-side change
that leaves its displayed slot free; call with `only` when applying to
recompute placement. All newly placed targets use `plannedItemPlacement` and
reject its overlap fallback.

The estimate uses the free slots before adding proposals, each at least the
mode's floor. Its count is their summed minutes divided by `slotMinutes`,
rounded down. Imaging uses the lower median recommended slot of the first ten
strictly ranked candidates, rounded half up to 15 min; visual uses 20 min.
The count remains an estimate, not a placement guarantee.

The extended result adds `requested`, `placed`, `position`, `estimate`,
`captured` and `shortfall`. Items add `score: { total, max }` (or null), `type`,
`group`, `progress`, `tier`, `lowered` and `kept`. Night items are chronological.
If fewer fit, `shortfall` takes the reason of the longest remaining free slot
at least as long as the floor, the earlier on a tie, and its `start`,
`startMinute` and `minutes`. When none qualifies it is
`{ kind: "short", freeMinutes, minimumMinutes }`, counting all remaining time,
including gaps shorter than the 15-minute listing floor. With enough placed
items, or `count: "all"`, it is null. Reasons are kinds and data, never copy.

With `layout: "list"`, the plan removes only its target ids. Each of the ten
suggestions is placed alone on the empty night; its `bestWindow` is the longest
visibility window within the night's span, the earlier on a tie, and
`maxAltitude` is read inside that window. List slots can overlap; they do not
form a plan. Apply the selected ids in `layout: "night"` to obtain a plan.
An unreadable night returns null in either layout.
