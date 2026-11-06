# The score of a target for tonight

This score ranks targets for one night; it does not replace the planner's constraints.

The planner can show, for any target of the recommendations, a score out
of 100 and the reason for every point: « Pourquoi cette cible ce soir ».
There is no hidden weighting. Seven criteria, each on its own scale, are
added together; every criterion shows the facts it was computed from; a
criterion without data counts for nothing and its scale leaves the
maximum, so a night without a forecast is scored out of 70, not out of 100.
In visual, up to 5 more points reward a target usable in the evening, and a
useful window under 45 minutes caps the score at 49 (§ 1).
Every value is an **estimate**.

The rules are written once in the open core
(`packages/planner/src/target-score.js`, `targetTonightScore`) and pinned by
the planner fixture `target-tonight-score`. Each rule
computes from the facts as the sheet shows them (whole degrees, whole
minutes, whole percents, tenths of mag/arcsec²), so the sum can be redone
from the sheet. Rounding is half up.

| Criterion                           | Scale |
| ----------------------------------- | ----- |
| Altitude and length of the window   | 30    |
| Moon                                | 15    |
| Weather                             | 20    |
| Sky quality                         | 10    |
| Horizon mask                        | 5     |
| Fit to the field of your instrument | 10    |
| Wind against your equipment         | 10    |
| **Total**                           | 100   |

## 1. Altitude and length of the window (30)

The principle: the real observing hours are unknown and the whole night is
proposed by default; the higher a target and the longer it stays usable
during the night, the better.

- **Inputs:** the target's altitude every ten minutes over the night (the
  planner's series), its culmination (from the target's path, « Déplacement
  de la cible »), its visibility windows (above the plan's minimum altitude,
  clear of the horizon mask, of the Moon and of the mount's limits), the
  night proposed (the whole dark night by default, else the chosen span) and
  the mode of the equipment (imaging or visual).
- **Facts:** culmination altitude `A` (whole degrees) and time; the useful
  window `D` (whole minutes): the sum of the visibility windows inside the
  night proposed; the length `F` that scores in full: 240 min (4 h) in
  imaging, where the night runs on its own, 120 min (2 h) in visual.
- **Formula:** `a = clamp(A − 20, 0, 60)`, `d = clamp(D, 0, F)`; points
  `= round(15 × a / 60 + 15 × d / F)`, that is 15 points for the altitude
  (none at 20°, all at 80°) and 15 for the useful window.
- **Example:** M57 in visual, culminates at 61°, usable 2 h 34 above 30° →
  `15 × 41 / 60 + 15 = 25.3` → **25 / 30**; in imaging, `10.25 + 15 × 154 /
240 = 19.9` → **20 / 30**.
- **Without data:** a target without a series is not scored (it is never a
  card); without windows on the card, the useful window is read on the
  stretches clear of the mask above the minimum, else on the series above
  the minimum.

### Visual evening bonus (up to 5 points)

In visual only, people observe in the evening. The evening runs from one
hour after the start of the astronomical night to the middle of the night.
Bonus `= round(5 × S / L)`, `S` being the minutes of the evening during
which the target is usable and `L` the length of the evening. It is added
to the total, which never exceeds the maximum. A target usable only after
midnight loses nothing: it has no bonus. In imaging, no bonus: the night
runs on its own. The criterion's sentence says it: « +2 en début de nuit
(utilisable 1 h 34 entre 19:17 et 23:31) ».

### Short window (cap)

Under 45 minutes of useful window, the score is capped: it never reads
more than 49 on 100 (49 out of 100, 44 out of 90, 47 out of 95): a « Cible difficile ». The sheet says
so under the verdict: « Fenêtre courte : 31 min (moins de 45 min). La note
est plafonnée à 49. » The target is still proposed when there is nothing
else.

## 2. Moon (15)

- **Inputs:** the Moon's illumination at the start of the night, its
  altitude over the night, its separation from the target at culmination,
  and the filters you own.
- **Facts:** illumination `I` (%), minutes `U` the Moon is above the
  horizon out of the night's `N` minutes, separation `S` (whole degrees),
  when it sets or rises, the narrowband filter that helps (if any).
- **Formula:** closeness `d = clamp(120 − S, 0, 90)` (an unknown separation
  counts as 90); harm `= (I / 100) × (U / N) × (90 + d) / 180`, halved when
  you own a narrowband filter (dual-band, Hα, O III, S II, Hβ) advised for
  the target (an emission or planetary nebula); points `= round(15 × (1 −
harm))`. A Moon below the horizon all night, or new, costs nothing; a
  full Moon up all night next to the target costs all 15.
- **Which filters count:** the filters of the plan and the filters you own
  — the filters of « Mon matériel » (your space's, or the device's own
  without a space) and, for a visitor of the web planner, those added in
  this browser (« Filtres possédés »). A filter you own counts for the
  score; it does not become a filter of the plan.
- **Example:** 23 % lit, up 50 min of a 600 min night, 124° away →
  `harm = 0.23 × 0.083 × 0.5 = 0.0096` → **15 / 15**.
- **Without data:** no illumination or no Moon series → not counted.

## 3. Weather (20)

- **Inputs:** the hourly forecast (cloud cover, humidity, dew risk) over
  the target's window (the window the card shows; the night without one).
- **Facts:** mean cloud cover `C` (%); humidity rising (10 points above the
  first hour) and from when; the worst dew risk and from when.
- **Formula:** penalty `P` = 4 for a high dew risk, 2 for a moderate one,
  else 1 when the humidity rises, else 0; points `= max(0, round(20 × (1 −
C / 100) − P))`.
- **Example:** clouds 12 % on average, humidity rising after 01:00 →
  `17.6 − 1 = 16.6` → **17 / 20**.
- **Without data:** no forecast for the night → not counted (« Prévision
  indisponible »).

## 4. Sky quality (10)

- **Inputs:** the place's estimated sky brightness (`/v1/sky-quality`, or
  the offline pack's raster on the device) and, for the bright zones the
  target crosses, the brightness by direction around the place.
- **Facts:** Bortle class `B`, sky brightness `Q` in mag/arcsec² (tenths).
- **Formula:** points `= round(10 × clamp(Q − 18.0, 0, 4.0) / 4.0)`: 18.0
  or brighter scores nothing, 22.0 everything. With a Bortle class alone:
  `round(10 × (9 − B) / 8)`. Then the deduction for a bright zone crossed
  (below).
- **Example:** Bortle 3, 21.4 mag/arcsec² → `10 × 3.4 / 4 = 8.5` → **9 /
  10**.
- **A bright zone crossed:** the zenith is not the sky a low target is
  seen through. When the place's brightness by direction is known (the
  grid the light layer of the horizon map draws, `/v1/sky-quality/direction`,
  or computed from the offline pack on the device), the target's own path is
  read through it, with the layer's own reading and thresholds.
  - **Inputs:** the samples of the target's path (every ten minutes:
    altitude and azimuth) inside its best window — the one of « Déplacement
    de la cible », else the stretches clear of the mask above the minimum
    altitude — and the grid.
  - **Weight of a sample:** the brightness `q` of its direction (read
    bilinearly, as the layer does) weighs `w = clamp((21.6 − q) / 3.6, 0, 1)`:
    nothing at 21.6 mag/arcsec² and darker (where the layer is not tinted),
    everything at 18.0 and brighter (where it is strongest). A sample the
    grid cannot read is ignored.
  - **Formula:** share `s` = the mean weight of the samples read;
    deduction `= round(P × s)`, `P` being the points of the zenith sky above;
    the row scores `P − deduction`. The deduction never exceeds `P`, so the
    row never goes below 0 and the total never leaves 100: no eighth
    criterion, the other six are untouched.
  - **Facts:** where it is brightest (compass point, mag/arcsec² to the
    tenth) and from when to when the path is in a tinted zone; the sheet
    says it in one more sentence, « Traverse une zone lumineuse au nord-ouest
    de 01:00 à 03:10 (jusqu’à 19,2 mag/arcsec²). », only when the deduction
    is at least one point.
  - **Example:** Bortle 3, 21.4 mag/arcsec² (9 points); the target's window
    is eight samples, four towards a dark east (21.9, weight 0) and four low
    over a town glow at 19.8 (weight 0.5) → `s = 4 × 0.5 / 8 = 0.25` →
    deduction `round(9 × 0.25) = 2` → **7 / 10**.
  - **No grid** (no raster on the server, offline without a copy on the
    device, no place): the score is exactly the zenith's. **The layer's
    switch does not change the score:** the grid is asked for the ranking
    whether or not the layer is drawn, because the layer is a display option
    and the ranking is not.
- **Without data:** no value for the place → not counted (the grid is then
  not read either).

## 5. Horizon mask (5)

- **Inputs:** the target's path against the place's horizon mask (« Déplacement de la cible »)
  and the plan's minimum altitude.
- **Facts:** the longest stretch clear of the mask and above the minimum
  altitude (from, to); minutes `V` clear and above the minimum; minutes `H`
  above the minimum but behind the mask.
- **Formula:** points `= round(5 × V / (V + H))`; 0 when the target never
  rises above the minimum altitude. The clear time already counts in the
  useful window of criterion 1: this criterion keeps only the share of the
  path the mask hides (5 points instead of 10, so the same trees are not
  counted twice).
- **Example:** clear from 19:55 to 03:10 (435 min), 40 min behind a tree
  line above 30° → `5 × 435 / 475 = 4.6` → **5 / 5**.
- **Without data:** a place without a horizon mask → not counted.

## 6. Fit to the field of your instrument (10)

- **Inputs:** the target's apparent size and the field of view of the
  plan's equipment (the planner's framing fit).
- **Facts:** the share `O` (%) of the field's width or height the target
  fills (the larger), the field, the fit.
- **Formula:** comfortable (`25 ≤ O ≤ 68`) → 10; small (`O < 25`) →
  `max(1, round(10 × O / 25))`; tight (`68 < O ≤ 98`) → 6; mosaic (`O >
98`) → 2. The bounds 68 and 98 are those of the planner's « Cadrage »
  fact.
- **Example:** M31 (≈ 3° × 1°) in a 3.2° × 2.1° field fills 94 % of the
  width → tight → **6 / 10**.
- **Without data:** an unknown size or no field of view → not counted.

## 7. Wind against your equipment (10)

- **Inputs:** the hourly gusts and sustained wind over the target's window,
  the mount's tolerance (« Tolérance au vent »).
- **Facts:** the strongest gust (or sustained wind, when it sets the
  level) and when, the limit and the setting, the level (`ok`, `near`,
  `over`).
- **Formula:** for each of the gusts and the sustained wind, with its
  strongest value `v` and its limit `L`: `(110 L − 100 v) / (6 L)`, that is
  10 at half the limit or less and 0 at 110 % of it; the worse of the two,
  clamped to 0–10 and rounded; 0 whenever a value is over its limit.
- **Example:** gusts up to 27 km/h for a limit of 30 (Standard) →
  `(3300 − 2700) / 180 = 3.3` → **3 / 10**, with the alert « Vent :
  rafales proches de la limite de votre monture ».
- **Without data:** no forecast for the night → not counted.

## Verdict

The verdict compares the total with the maximum of the criteria counted:

| Share of the maximum | Verdict                  |
| -------------------- | ------------------------ |
| 75 % or more         | Bonne cible pour ce soir |
| 50 % to 74 %         | Cible possible ce soir   |
| under 50 %           | Cible difficile ce soir  |

A short window (under 45 useful minutes) caps the score at 49 out of
100: its verdict is always « Cible difficile ce soir ».

## The later pages of « À voir ce soir »

Each page of ten suggestions is laid out by start time (it reads the
night). On page 2 and after, each line carries its rank next to the score
(« 12ᵉ · 54/100 »): a target at the top of a page is not the best one, it is
the earliest.

## The filters of the suggestions

« Filtrer les suggestions » (« À voir ce soir », « Suggérer les meilleures
cibles », the planner; one setting per device) changes what is scored, not
how:

- **Period of the night** (« Début », « Milieu », « Fin »: the thirds of the
  dark night, several at once): the target is seen inside the periods only
  and criterion 1 is read there — the altitude at the highest point inside
  them, the useful duration their sum (never above the night's) — with the
  short-window cap when that sum is under 45 min. Every other criterion is
  the night's and the score never exceeds the night's
  (`targetWindowsScore`): a target high for twenty minutes of the period is
  worth less.
- **« Ignorer le masque d'horizon »:** the targets are planned without the
  place's mask, so criterion 5 is « not counted » (as for a place without a
  mask) and the score is brought back on 100. The mask itself is not
  changed; a plan made from the list keeps it.
- **Catalogues, type of target:** which targets are scored (by default every
  target of « Essentielles » and « Étendues »; a catalogue ticked, that whole
  catalogue up to 600 targets), never their score.

## Where it shows

- A score chip on every target card of the planner (web and apps) opens
  the explanation.
- The recommendations offer the sort « Score de ce soir »; the default sort
  stays the culmination altitude.
- The sort « Score de ce soir », « À voir ce soir » on « Cette nuit » and the
  automatic filling all read this score, so a target crossing a bright zone
  ranks below the same target seen through a dark sky.
- The score lives in the open core.
