# La note d’une cible pour ce soir

Cette note classe les cibles pour une nuit ; elle ne remplace pas les contraintes du planificateur.

Le planificateur peut montrer, pour toute cible des recommandations, une
note sur 100 et la raison de chaque point : « Pourquoi cette cible ce
soir ». Aucune pondération cachée. Sept critères, chacun sur son propre
barème, s’additionnent ; chaque critère montre les faits dont il est tiré ;
un critère sans donnée ne compte pas et son barème quitte le maximum : une
nuit sans prévision est notée sur 70, pas sur 100. En visuel, jusqu’à
5 points de plus récompensent une cible utilisable en soirée, et une durée
utile de moins de 45 minutes plafonne la note à 49 (§ 1). Toutes les
valeurs sont des **estimations**.

Les règles sont écrites une fois dans le cœur ouvert
(`packages/planner/src/target-score.js`, `targetTonightScore`) et figées par
la fixture du planificateur `target-tonight-score`. Chaque
règle part des faits tels que la feuille les affiche (degrés entiers,
minutes entières, pourcentages entiers, dixièmes de mag/arcsec²) : on peut
refaire la somme depuis la feuille. Les arrondis se font au demi supérieur.

| Critère                                 | Barème |
| --------------------------------------- | ------ |
| Hauteur et durée de fenêtre             | 30     |
| Lune                                    | 15     |
| Météo                                   | 20     |
| Qualité du ciel                         | 10     |
| Masque d’horizon                        | 5      |
| Adéquation au champ de votre instrument | 10     |
| Vent par rapport à votre matériel       | 10     |
| **Total**                               | 100    |

## 1. Hauteur et durée de fenêtre (30)

Le principe : on ne connaît pas l’horaire d’observation réel et l’on
propose toute la nuit par défaut ; plus une cible est haute et plus elle
reste longtemps utilisable pendant la nuit, mieux c’est.

- **Entrées :** la hauteur de la cible toutes les dix minutes pendant la
  nuit (la série du planificateur), sa culmination (« Déplacement de la
  cible »), ses fenêtres de visibilité (au-dessus de l’altitude minimale du
  plan, hors masque d’horizon, hors Lune, hors limites de la monture), la
  nuit proposée (toute la nuit noire par défaut, sinon la plage choisie) et
  le mode du matériel (photo ou visuel).
- **Faits :** hauteur de culmination `A` (degrés entiers) et heure ; durée
  utile `D` (minutes entières) : la somme des fenêtres de visibilité dans la
  nuit proposée ; la durée `F` qui donne tous les points : 240 min (4 h) en
  photo, où l’on laisse tourner la nuit, 120 min (2 h) en visuel.
- **Formule :** `a = borne(A − 20, 0, 60)`, `d = borne(D, 0, F)` ; points
  `= arrondi(15 × a / 60 + 15 × d / F)`, soit 15 points pour la hauteur
  (aucun à 20°, tous à 80°) et 15 pour la durée utile.
- **Exemple :** M57 en visuel, culmine à 61°, utilisable 2 h 34 au-dessus
  de 30° → `15 × 41 / 60 + 15 = 25,3` → **25 / 30** ; en photo, `10,25 +
15 × 154 / 240 = 19,9` → **20 / 30**.
- **Sans donnée :** une cible sans série n’est pas notée (ce n’est jamais
  une carte) ; sans fenêtres sur la carte, la durée utile se lit sur les
  plages dégagées du masque au-dessus du minimum, à défaut sur la série
  au-dessus du minimum.

### Bonus visuel de début de soirée (jusqu’à 5 points)

En visuel seulement, on observe plutôt en soirée. La soirée va d’une heure
après le début de la nuit astronomique au milieu de la nuit. Bonus
`= arrondi(5 × S / L)`, `S` étant les minutes de la soirée pendant
lesquelles la cible est utilisable et `L` la durée de la soirée. Il
s’ajoute au total, qui ne dépasse jamais le maximum. Une cible utilisable
seulement après minuit ne perd rien : elle n’a pas le bonus. En photo, aucun
bonus : la nuit tourne seule. La phrase du critère le dit : « +2 pour la
soirée (utilisable 1 h 34 entre 19:17 et 23:31) ».

### Fenêtre courte (plafond)

Sous 45 minutes de durée utile, la note est plafonnée : elle
ne dépasse jamais 49 une fois ramenée sur 100 (49 sur 100, 44 sur 90,
47 sur 95) : c’est une « Cible difficile ». La feuille le dit
sous le verdict : « Fenêtre courte : 31 min (moins de 45 min). La note est
plafonnée à 49. » La cible reste proposée quand il n’y en a pas d’autres.

## 2. Lune (15)

- **Entrées :** l’éclairement de la Lune au début de la nuit, sa hauteur
  pendant la nuit, sa distance à la cible à la culmination, et les filtres
  que vous possédez.
- **Faits :** éclairement `I` (%), minutes `U` où la Lune est levée sur les
  `N` minutes de la nuit, distance `S` (degrés entiers), heure de coucher
  ou de lever, le filtre à bande étroite qui aide (s’il y en a un).
- **Formule :** proximité `d = borne(120 − S, 0, 90)` (une distance inconnue
  vaut 90) ; gêne `= (I / 100) × (U / N) × (90 + d) / 180`, divisée par deux
  si vous possédez un filtre à bande étroite (double bande, Hα, O III,
  S II, Hβ) conseillé pour la cible (une nébuleuse en émission ou
  planétaire) ; points `= arrondi(15 × (1 − gêne))`. Une Lune couchée toute
  la nuit, ou nouvelle, ne coûte rien ; une pleine Lune levée toute la nuit
  près de la cible coûte les 15.
- **Quels filtres comptent :** ceux du plan et ceux que vous possédez —
  les filtres de « Mon matériel » (ceux de votre espace, ou ceux de
  l’appareil sans espace) et, pour un visiteur du planificateur web, ceux
  ajoutés dans ce navigateur (« Filtres possédés »). Un filtre que vous
  possédez compte pour la note ; il ne devient pas un filtre du plan.
- **Exemple :** éclairée à 23 %, levée 50 min sur une nuit de 600 min, à
  124° → `gêne = 0,23 × 0,083 × 0,5 = 0,0096` → **15 / 15**.
- **Sans donnée :** pas d’éclairement ou pas de série de la Lune → non
  compté.

## 3. Météo (20)

- **Entrées :** la prévision horaire (nébulosité, humidité, risque de
  rosée) sur la fenêtre de la cible (celle de sa carte ; la nuit à
  défaut).
- **Faits :** nébulosité moyenne `C` (%) ; humidité en hausse (10 points
  au-dessus de la première heure) et depuis quand ; le pire risque de
  rosée et depuis quand.
- **Formule :** pénalité `P` = 4 pour un risque de rosée élevé, 2 pour un
  risque modéré, sinon 1 si l’humidité monte, sinon 0 ; points `= max(0,
arrondi(20 × (1 − C / 100) − P))`.
- **Exemple :** nuages 12 % en moyenne, humidité en hausse après 01:00 →
  `17,6 − 1 = 16,6` → **17 / 20**.
- **Sans donnée :** pas de prévision pour la nuit → non compté
  (« Prévision indisponible »).

## 4. Qualité du ciel (10)

- **Entrées :** la brillance du ciel estimée du lieu (`/v1/sky-quality`, ou
  le raster du pack hors ligne sur l’appareil) et, pour les zones
  lumineuses que la cible traverse, la brillance par direction autour du
  lieu.
- **Faits :** classe de Bortle `B`, brillance `Q` en mag/arcsec²
  (dixièmes).
- **Formule :** points `= arrondi(10 × borne(Q − 18,0, 0, 4,0) / 4,0)` :
  18,0 ou plus lumineux ne rapporte rien, 22,0 tout. Avec la seule classe
  de Bortle : `arrondi(10 × (9 − B) / 8)`. Puis la déduction d’une zone
  lumineuse traversée (ci-dessous).
- **Exemple :** Bortle 3, 21,4 mag/arcsec² → `10 × 3,4 / 4 = 8,5` → **9 /
  10**.
- **Une zone lumineuse traversée :** le zénith n’est pas le ciel à travers
  lequel on voit une cible basse. Quand la brillance du lieu par direction
  est connue (la grille que dessine le calque de pollution lumineuse de la
  carte d’horizon, `/v1/sky-quality/direction`, ou calculée depuis le pack
  hors ligne sur l’appareil), le trajet de la cible est lu à travers elle,
  avec la lecture et les seuils du calque.
  - **Entrées :** les échantillons du trajet de la cible (toutes les dix
    minutes : hauteur et azimut) dans sa meilleure fenêtre — celle de
    « Déplacement de la cible », sinon les plages dégagées du masque
    au-dessus de la hauteur minimale — et la grille.
  - **Poids d’un échantillon :** la brillance `q` de sa direction (lue de
    façon bilinéaire, comme le calque) pèse `w = borne((21,6 − q) / 3,6, 0, 1)` :
    rien à 21,6 mag/arcsec² et plus sombre (là où le calque n’est pas
    teinté), tout à 18,0 et plus lumineux (là où il est le plus fort). Un
    échantillon que la grille ne sait pas lire est ignoré.
  - **Formule :** part `s` = le poids moyen des échantillons lus ; déduction
    `= arrondi(P × s)`, `P` étant les points du ciel au zénith ci-dessus ;
    la ligne vaut `P − déduction`. La déduction ne dépasse jamais `P` : la
    ligne ne descend pas sous 0 et le total ne quitte pas 100 — pas de
    huitième critère, les six autres ne changent pas.
  - **Faits :** où c’est le plus lumineux (point cardinal, mag/arcsec² au
    dixième) et de quand à quand le trajet est dans une zone teintée ; la
    feuille le dit en une phrase de plus, « Traverse une zone lumineuse au
    nord-ouest de 01:00 à 03:10 (jusqu’à 19,2 mag/arcsec²). », seulement
    quand la déduction vaut au moins un point.
  - **Exemple :** Bortle 3, 21,4 mag/arcsec² (9 points) ; la fenêtre de la
    cible compte huit échantillons, quatre vers un est sombre (21,9, poids 0)
    et quatre bas sur le halo d’une ville à 19,8 (poids 0,5) →
    `s = 4 × 0,5 / 8 = 0,25` → déduction `arrondi(9 × 0,25) = 2` → **7 / 10**.
  - **Sans grille** (pas de raster sur le serveur, hors ligne sans copie sur
    l’appareil, pas de lieu) : la note est exactement celle du zénith.
    **L’interrupteur du calque ne change pas la note :** la grille est
    demandée pour le classement que le calque soit dessiné ou non, parce que
    le calque est une option d’affichage et le classement n’en est pas une.
- **Sans donnée :** aucune valeur pour le lieu → non compté (la grille n’est
  alors pas lue non plus).

## 5. Masque d’horizon (5)

- **Entrées :** le trajet de la cible face au masque d’horizon du lieu
  (« Déplacement de la cible ») et l’altitude minimale du plan.
- **Faits :** la plus longue plage dégagée du masque et au-dessus de
  l’altitude minimale (début, fin) ; minutes `V` dégagées et au-dessus du
  minimum ; minutes `H` au-dessus du minimum mais derrière le masque.
- **Formule :** points `= arrondi(5 × V / (V + H))` ; 0 si la cible ne
  dépasse jamais l’altitude minimale. Le temps dégagé compte déjà dans la
  durée utile du critère 1 : ce critère ne garde que la part du trajet que
  le masque cache (5 points au lieu de 10, pour ne pas compter deux fois
  les mêmes arbres).
- **Exemple :** dégagée de 19:55 à 03:10 (435 min), 40 min derrière une
  rangée d’arbres au-dessus de 30° → `5 × 435 / 475 = 4,6` → **5 / 5**.
- **Sans donnée :** un lieu sans masque d’horizon → non compté.

## 6. Adéquation au champ de votre instrument (10)

- **Entrées :** la taille apparente de la cible et le champ du matériel du
  plan (l’adéquation de cadrage du planificateur).
- **Faits :** la part `O` (%) de la largeur ou de la hauteur du champ
  qu’occupe la cible (la plus grande), le champ, le cadrage.
- **Formule :** confortable (`25 ≤ O ≤ 68`) → 10 ; petite (`O < 25`) →
  `max(1, arrondi(10 × O / 25))` ; serré (`68 < O ≤ 98`) → 6 ; mosaïque
  (`O > 98`) → 2. Les bornes 68 et 98 sont celles du fait « Cadrage » du
  planificateur.
- **Exemple :** M31 (≈ 3° × 1°) dans un champ de 3,2° × 2,1° occupe 94 % de
  la largeur → serré → **6 / 10**.
- **Sans donnée :** une taille inconnue ou aucun champ → non compté.

## 7. Vent par rapport à votre matériel (10)

- **Entrées :** les rafales et le vent soutenu heure par heure sur la
  fenêtre de la cible, la tolérance de la monture (« Tolérance au vent »).
- **Faits :** la plus forte rafale (ou le vent soutenu, quand c’est lui qui
  fixe le niveau) et son heure, la limite et le réglage, le niveau (`ok`,
  `near`, `over`).
- **Formule :** pour les rafales et pour le vent soutenu, avec la plus
  forte valeur `v` et la limite `L` : `(110 L − 100 v) / (6 L)`, soit 10 à
  la moitié de la limite ou moins et 0 à 110 % ; le pire des deux, borné à
  0–10 et arrondi ; 0 dès qu’une valeur dépasse sa limite.
- **Exemple :** rafales jusqu’à 27 km/h pour une limite de 30 (Standard) →
  `(3300 − 2700) / 180 = 3,3` → **3 / 10**, avec l’alerte « Vent : rafales
  proches de la limite de votre monture ».
- **Sans donnée :** pas de prévision pour la nuit → non compté.

## Verdict

Le verdict compare le total au maximum des critères comptés :

| Part du maximum | Verdict                  |
| --------------- | ------------------------ |
| 75 % ou plus    | Bonne cible pour ce soir |
| 50 % à 74 %     | Cible possible ce soir   |
| moins de 50 %   | Cible difficile ce soir  |

Une fenêtre courte (moins de 45 min utiles) plafonne la note à 49 sur
100 : son verdict est toujours « Cible difficile ce soir ».

## Les pages suivantes de « À voir ce soir »

Chaque page de dix suggestions est rangée par heure de début (elle sert à
lire la nuit). Sur les pages 2 et suivantes, chaque ligne porte son rang à
côté de la note (« 12ᵉ · 54/100 ») : une cible en tête de page n’est pas la
meilleure, elle est la plus tôt.

## Où on la voit

- Une pastille de note sur chaque carte de cible du planificateur (web et
  applications) ouvre l’explication.
- Les recommandations proposent le tri « Score de ce soir » ; le tri par
  défaut reste la hauteur de culmination.
- Le tri « Score de ce soir », « À voir ce soir » sur « Cette nuit » et le
  remplissage automatique lisent cette note : une cible qui traverse une zone
  lumineuse passe derrière la même cible vue à travers un ciel sombre.
- La note vit dans le cœur ouvert.
