# astro-theme

Canonical, platform-neutral semantic design tokens for the Astro Portal
product family (portal web, the mobile applications, Astro Sync and the
native extensions). `tokens.json` is the single source; nothing downstream
may keep an independent raw-color copy.

The portal stylesheet (`packages/portal-app/styles/portal.css`) is the value
authority: when a role has a CSS custom property there, this file carries
that value verbatim. Four roles (`focus`, `success`, `warning`, `error`) had
no custom property of their own — for those, the closest existing semantic
usage in the stylesheet was promoted to a token, documented below.

## Semantic roles (`colors`)

| Role             | Key              | Source in the stylesheet                                             |
| ---------------- | ---------------- | -------------------------------------------------------------------- |
| Page background  | `pageBackground` | `body { background }`, now also `--bg`                               |
| Primary text     | `primaryText`    | `--ink`                                                              |
| Muted text       | `mutedText`      | `--muted`                                                            |
| Panel            | `panel`          | `--panel`                                                            |
| Border           | `border`         | `--line`                                                             |
| Gold accent      | `goldAccent`     | `--accent`                                                           |
| Active gold text | `activeGoldText` | repeated hover/active literal, now also `--active-gold-text`         |
| Active surface   | `activeSurface`  | repeated hover/active literal, now also `--active-surface`           |
| Focus ring       | `focus`          | `--accent` (every `:focus`/`:focus-visible` outline uses the accent) |
| Success          | `success`        | `.planner-sync-status.is-synced` indicator, now also `--success`     |
| Warning          | `warning`        | `.planner-sync-status.is-syncing` indicator, now also `--warning`    |
| Error            | `error`          | `.planner-place-status.is-error` border, now also `--error`          |

Ten further roles name the colours the four button levels and the inactive
look need on a surface that cannot read the portal's stylesheet (Astro Sync).
The first eight are the values of the web's
`--button-*` variables); the last two are the inactive look of the Astro Sync
home screen:

| Role                | Key                  | Used for                                       |
| ------------------- | -------------------- | ---------------------------------------------- |
| Primary edge        | `primaryEdge`        | edge of the plain primary (`#876638`)          |
| Primary ink         | `primaryInk`         | text of the plain primary (`#201507`)          |
| Tertiary edge       | `tertiaryBorder`     | edge of a tertiary (`#465247`)                 |
| Destructive surface | `destructiveSurface` | fill of the destructive primary                |
| Destructive edge    | `destructiveEdge`    | edge of the destructive primary                |
| Destructive ink     | `destructiveInk`     | text of the destructive primary                |
| Destructive outline | `destructiveOutline` | edge of the destructive tertiary               |
| Destructive text    | `destructiveText`    | text of the destructive tertiary and link      |
| Inactive surface    | `inactiveSurface`    | fill of a step that waits, track of a progress |
| Inactive text       | `inactiveText`       | text of a step that waits                      |

## State palette (`status`, `debriefButton`)

One look per state of a plan or a session, the same for both
(the plan's word is masculine, the session's feminine), on the phone and the
web. In colour what waits for an action, in grey what is past:

| State       | Key         | Edge      | Ink       | Surface           |
| ----------- | ----------- | --------- | --------- | ----------------- |
| Planifié    | `planned`   | `#e0a85e` | `#e0a85e` | none              |
| À débriefer | `toDebrief` | `#83c5d0` | `#83c5d0` | `#83c5d0` at 10 % |
| Exécuté     | `executed`  | `#5d6964` | `#c3cac8` | none              |
| En partie   | `partial`   | `#5d6964` | `#c3cac8` | none              |
| Abandonné   | `abandoned` | `#5d6964` | `#c3cac8` | none              |
| Archivé     | `archived`  | `#2c342f` | `#7f8986` | `#101411`         |

`surface` is `null` where the tag has no fill; `surfaceAlpha` is its opacity.
`debriefButton` is the one « Débriefer » button: a secondary in the blue of
« À débriefer » (fill `#15282c`, edge `#83c5d0`, text `#d4f1f6`). The web reads
them as `--status-<state>-edge`, `--status-<state>-ink`,
`--status-<state>-surface` (kebab case: `--status-to-debrief-edge`) and
`--debrief-button-surface`, `--debrief-button-edge`, `--debrief-button-ink` in
`packages/portal-app/styles/portal.css`; the mobile applications read the same
values.

`typography.fontFamily` mirrors the `:root` font stack. `radii` and
`spacing` are a small normalized scale distilled from the most common
`border-radius`/`gap` values of the stylesheet; they are not asserted against
a single CSS variable because none exists yet.

## Drift rule

Any change to a value here must be applied to every consumer before the
change is considered done: the twelve color roles above must stay equal to
the corresponding custom properties of the portal stylesheet.

Never hardcode one of these colors again in a new platform surface — map it
from this file instead.

## Licence

MIT — see [`LICENSE`](./LICENSE).
