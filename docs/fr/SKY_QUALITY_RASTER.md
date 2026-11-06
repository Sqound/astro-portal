# Raster de qualité du ciel

L'estimation Bortle/SQM du planificateur est servie depuis un raster que cette
instance prépare et héberge elle-même. Aucune requête sortante à la demande,
aucun service cartographique tiers. Sans le raster installé, `/v1/sky-quality`
et `/api/planner-sky-quality` répondent l'état d'indisponibilité déjà prévu par
le contrat (`503 sky_quality_unavailable` avec `Retry-After`) ; le
planificateur continue de fonctionner et le panneau affiche son tiret habituel.

Chaque cellule du raster contient **la radiance montante de tout ce qui se
trouve dans un rayon de 300 km, cumulée avec un noyau de distance** — et non la
radiance que le satellite a mesurée au-dessus de cette cellule. C'est ce qui
permet à une vallée sombre à 55 km d'une ville de porter la lueur de cette
ville. Le service ne fait qu'échantillonner ce champ et le convertir ; toute la
modélisation a lieu une fois, hors ligne.

## Données source

VIIRS Nighttime Lights (VNL), composites annuels de l'Earth Observation Group
(EOG), Payne Institute for Public Policy, Colorado School of Mines —
<https://eogdata.mines.edu/products/vnl/>.

|            |                                                             |
| ---------- | ----------------------------------------------------------- |
| Produit    | Annual VNL V2 (V2.2 à la rédaction), `average_masked`       |
| Résolution | 15 secondes d'arc, EPSG:4326                                |
| Unité      | nW/cm²/sr                                                   |
| Couverture | 180O/75N à 180E/65S (rien au-delà de 75N ni en deçà de 65S) |
| Livraison  | un GeoTIFF gzippé par année                                 |
| Licence    | Creative Commons Attribution 4.0 International              |

`average_masked`, et non `average` : le produit masqué a été débarrassé du
bruit de fond, des aurores et des feux, c'est donc une carte propre des
**émissions** — exactement ce qu'un modèle de propagation attend en entrée. La
lueur diffuse autour des villes que montre le produit non masqué est de la
lumière diffusée vue d'en haut ; elle n'est pas calibrée comme telle, et
l'utiliser reviendrait à compter deux fois la diffusion que ce pipeline
modélise explicitement.

Le « World Atlas 2015 » (Falchi et al.) n'est **pas** utilisé, ni en entrée ni
en calibration : sa licence est non commerciale et cette instance doit pouvoir
redistribuer ce qu'elle sert. Ses ordres de grandeur publiés ne servent
ci-dessous que de contrôle de vraisemblance.

### Attribution

Le document de licence d'EOG
(<https://eogdata.mines.edu/files/EOG_products_CC_License.pdf>, Exhibit 1)
exige cette mention mot pour mot sur tout produit dérivé de ses données :

> This product was made utilizing (name the appropriate EOG data product) data
> produced by the Earth Observation Group, Payne Institute for Public Policy,
> Colorado School of Mines.

et, là où la place manque, la ligne de crédit courte :

> Source: EOG, Colorado School of Mines.

Les deux sont écrites dans le `manifest.json` généré, et la forme longue est
affichée dans l'infobulle de qualité du ciel du planificateur web ainsi que
dans la fiche d'information des applications. L'Exhibit 2 demande aux
publications de citer Elvidge, C.D., Zhizhin, M., Ghosh, T., Hsu, F.-C.,
Taneja, J. (2021), « Annual time series of global VIIRS nighttime lights
derived from monthly averages: 2012 to 2019 », _Remote Sensing_ 13(5), 922,
doi:10.3390/rs13050922.

## Obtenir le composite

Le téléchargement est derrière une authentification OpenID Connect (Keycloak,
realm `eog`) : demander
`https://eogdata.mines.edu/nighttime_light/annual/v22/<année>/` sans session
redirige vers `https://eogauth.mines.edu/…/auth`.

- Un **compte gratuit** avec une adresse vérifiée donne l'accès par
  navigateur. Connectez-vous, ouvrez le répertoire de l'année, téléchargez le
  fichier `…average_masked…tif.gz`. C'est la voie prise en charge.
- L'accès **programmatique** exige un abonnement payant : la page
  d'inscription d'EOG indique « Effective June 1 2026 EOG is limiting
  programmatic access via OpenID Client to paid subscribers. » Les abonnés
  reçoivent un `client_id` / `client_secret` et obtiennent un jeton de cinq
  minutes par un grant OAuth2 « password » sur
  `https://eogauth.mines.edu/realms/eog/protocol/openid-connect/token`.

`npm run prepare:sky-quality-raster -- --download --url <url du fichier>`
implémente ce flux, en lisant `ASTRO_PORTAL_EOG_CLIENT_ID`,
`ASTRO_PORTAL_EOG_CLIENT_SECRET`, `ASTRO_PORTAL_EOG_USERNAME`,
`ASTRO_PORTAL_EOG_PASSWORD` (ou un `ASTRO_PORTAL_EOG_TOKEN` déjà prêt) dans
l'environnement. **Il n'a jamais été exécuté contre le vrai service** — aucun
compte n'existe ici — donc traitez-le comme non vérifié. Ne committez jamais
ces valeurs.

## Préparer le raster

```bash
npm run prepare:sky-quality-raster -- \
  --input /chemin/vers/VNL_npp_2025_…average_masked.dat.tif.gz \
  --static-data-dir /chemin/vers/static-data \
  --work-dir /chemin/vers/scratch \
  --year 2025 --version v2.2 --product average_masked --arcminutes 2
```

Une entrée `.gz` est d'abord décompressée parce que le répertoire du GeoTIFF se
trouve à la fin du fichier et que le lecteur a besoin d'un accès aléatoire. Le
composite 2025 décompressé fait **11,6 Go**, donc `--work-dir` doit pointer sur
un volume qui a de la place ; l'intermédiaire est supprimé à la fin. Le
composite lui-même est lu bande par bande et n'est jamais tenu en mémoire
entier.

L'exécution comporte deux étapes :

1. **Rééchantillonnage.** Moyenne pondérée par l'aire des cellules source qui
   tombent dans chaque cellule de sortie. La pondération est exacte plutôt
   qu'une affectation au plus proche voisin, parce que les deux grilles ne sont
   pas emboîtées : le tiepoint VNL lie le _centre_ de sa première cellule à
   180O/75N, ses cellules sont donc décalées d'une demi-cellule de 15″ par
   rapport à la grille au degré entier et une cellule source peut chevaucher
   une frontière de sortie. Les colonnes s'enroulent, ce qui replie la colonne
   180° dupliquée du composite sur la première. Le résultat est mis en cache
   dans `--work-dir` en float32 brut
   (`sky-quality-mean-<arcminutes>min.f32`, 233 Mo en 2′), avec un fichier
   annexe qui enregistre quel composite et quelle géométrie l'ont produit.
   Itérer sur le noyau ne relit donc jamais les 11,6 Go. `--mean-cache=off`
   le désactive ; `--cache-only` s'arrête après cette étape.
2. **Propagation.** Chaque cellule éclairée répand sa lumière sur ses alentours
   avec le noyau décrit plus bas. Voir « Le modèle de propagation ».

Le script écrit, de façon atomique :

```text
<static-data>/sky-quality/
├── manifest.json
└── raster.bin
```

`manifest.json` enregistre l'année, le produit et la version VNL de la source,
la date de génération, la géométrie de la grille, les constantes d'encodage,
les paramètres du noyau et leur citation, un SHA-256 de `raster.bin` et le
texte d'attribution EOG. Réexécuter sur la même entrée produit une sortie
identique octet pour octet et la même empreinte : la diffusion parcourt les
lignes, puis les colonnes, puis la table d'offsets de chaque ligne dans un
ordre fixe, donc chaque somme est accumulée dans la même séquence à chaque
exécution.

Pointez le portail dessus avec `ASTRO_PORTAL_STATIC_DATA_DIR` (le raster est lu
depuis `<static-data>/sky-quality/`), ou surchargez ce seul répertoire avec
`ASTRO_PORTAL_SKY_QUALITY_RASTER_DIR`.

### Mesuré, 2025 V2.2 `average_masked`, hôte macOS

|                             | 2 minutes d'arc         | 5 minutes d'arc       |
| --------------------------- | ----------------------- | --------------------- |
| Grille                      | 10800 × 5400            | 4320 × 2160           |
| `raster.bin`                | 58 320 000 o (55,6 Mio) | 9 331 200 o (8,9 Mio) |
| `raster.bin`, gzip -9       | 7 183 738 o (6,9 Mio)   | 1 428 355 o (1,4 Mio) |
| Cellules source éclairées   | 3 023 367 (5,2 %)       | 747 341 (8,0 %)       |
| Cellules de sortie remplies | 12 051 062 (20,7 %)     | 1 946 546 (20,9 %)    |
| Pic de la cellule propagée  | 1091 nW/cm²/sr          | 603 nW/cm²/sr         |
| Exécution complète, à froid | 25 s, pic RSS 1,04 Gio  | 15 s, 473 Mio         |
| dont propagation            | 7 s                     | 3 s                   |
| Exécution complète, à chaud | 7,3 s, 887 Mio          | 3,4 s, 447 Mio        |

La grille 5′ reste disponible pour un hôte où 58 Mo résidents ne le sont pas,
et rien d'autre que la valeur `--arcminutes` ne change — le service et le
manifeste lisent la géométrie depuis le manifeste. Le
pack hors ligne n'embarque pas le raster 2′ lui-même ; il embarque une
variante 6′ encore réduite, ci-dessous.

## Variante pour le pack hors ligne

Voir [OFFLINE_PACKS.md](OFFLINE_PACKS.md) pour la vue au niveau du manifeste
de ce composant (`sky-quality`, `kind: "file-set"`), sa licence et ses
obligations d'attribution.

Le pack hors ligne a besoin que l'estimation Bortle/SQM fonctionne sans réseau
dès le tout premier lancement, mais le raster 2′ complet (55,6 Mio, 6,9 Mio
gzippé) est trop gros pour un pack qui doit rester petit. Le pack embarque à
la place une variante **6′** — 0,1°, **10800 × 5400 → 3600 × 1800 =
exactement 6 480 000 octets**, une réduction propre par blocs de 3 × 3 de la
grille 2′ — assez petite pour tenir dans le téléchargement automatique du
premier lancement, aux côtés de l'index compact du catalogue et des tuiles DSS
d'ordre 0 à 2.

**Dérivation.** Chaque cellule 6′ moyenne le bloc 3 × 3 exact de cellules 2′
qui se trouve dessous, sur leurs **radiances décodées** (jamais les niveaux
8 bits : la moyenne de deux octets encodés en log n'est pas le log de leur
radiance moyenne), pondérées par l'aire des cellules selon la même règle
`sin(φ_nord) − sin(φ_sud)` que le rééchantillonnage ci-dessus — les trois
lignes d'un bloc ne portent pas toutes le même poids, mais chaque colonne
d'une même ligne si. Le résultat est ré-encodé avec **les constantes
d'encodage du raster source lui-même**, lues dans son manifeste au moment de
la dérivation plutôt que supposées : une révision future qui changerait
`offset`/`maximum`/`levels` ne peut pas désynchroniser silencieusement le pack
du raster dont il est dérivé. L'implémentation est unique,
`deriveSkyQualityPackGrid` (`packages/portal/src/sky-quality.js`), appelée
par exactement deux points :

- **`--pack-arcminutes`** (défaut `6`, `0` la désactive) sur
  `prepare-sky-quality-raster.mjs` lui-même, qui produit la variante du pack
  en même temps que le raster de base, au moment de la préparation ;
- **paresseusement, mémoïsée sur disque**, par `ensureSkyQualityPackRaster`
  (`packages/portal/src/planner/sky-quality.server.js`), la première fois
  qu'un portail qui n'a jamais lancé l'option en a réellement besoin — et de
  nouveau chaque fois que le `checksum` du raster source installé change,
  détecté en le comparant au `derivedFrom.checksum` du manifeste du pack. Une
  requête qui ne change rien ne redérive jamais : seul `manifest.json`
  (quelques centaines d'octets) est relu pour vérifier la fraîcheur. Mesuré
  sur une grille synthétique 10800 × 5400 (ce dépôt n'embarque aucun vrai
  raster) : **≈80–90 ms** et **+9 Mo de RSS** quand la source est
  majoritairement sombre (comme le vrai composite, ~21 % rempli), montant à
  **≈700 ms** dans le pire cas irréaliste où chaque cellule source est
  éclairée — largement dans le budget d'une seule requête.

Les deux chemins écrivent dans `<static-data>/sky-quality/pack/` :

```text
<static-data>/sky-quality/pack/
├── raster.bin       3 600 × 1 800 octets
├── raster.bin.gz    gzip -9, précalculé
└── manifest.json
```

écrits atomiquement et dans cet ordre — `raster.bin`, puis son `.gz`, puis
`manifest.json` en dernier, pour qu'un lecteur qui observe le manifeste
puisse supposer que les deux binaires sont déjà entièrement en place. Si
`<static-data>` est en lecture seule, ou si l'écriture échoue pour toute
autre raison, la dérivation journalise un avertissement et abandonne : le
composant `sky-quality` est simplement absent de `GET /v1/offline-pack`,
jamais une `500`.

**`pack/manifest.json`** a EXACTEMENT la même forme que le manifeste du
raster de service ci-dessus — `grid`, `encoding`, `attribution`, `license`,
`year`, `checksum`, … — pour qu'un lecteur du manifeste du raster de service le
lise **sans aucune modification** : il ne lit jamais que `grid.{width,height,cellSizeDegrees,
north,west}` et, au premier niveau, `attribution`/`year`, dont aucun n'est
codé en dur pour une résolution particulière. Un champ est nouveau :
`derivedFrom` (`{checksum, cellSizeDegrees, width, height}` du raster SOURCE
dont il a été dérivé), que seule la dérivation elle-même lit, pour décider
s'il faut redériver.

**Routes.** `GET /v1/offline-pack/sky-quality/manifest.json` et
`GET /v1/offline-pack/sky-quality/raster.bin`
(`packages/portal-app/src/routes/api/v1/offline-pack/sky-quality/[file]/route.js`) ne servent
exactement que ces deux noms de fichier — tout le reste est un `404` au
format d'erreur v1 standard — avec un accès invité, comme la route du
manifeste elle-même. Les deux sont servies en flux depuis le disque. L'`ETag`
de `raster.bin` est `"sha256-<hex>"` des octets **non compressés** (identique
au `revision` du composant `sky-quality` et à son `files[].checksum` dans
`GET /v1/offline-pack`), honoré par `If-None-Match` avec un `304` ; il est
servi en `Content-Encoding: gzip` depuis le `raster.bin.gz` précalculé quand
l'`Accept-Encoding` du client l'accepte (`Vary: Accept-Encoding` toujours
posé), en identité sinon — avec un repli gracieux vers l'identité si jamais un
`.gz` compagnon venait à manquer (un pack installé à la main sans lui, par
exemple).

## Encodage

Chaque cellule est un octet sur une échelle logarithmique, avec
`offset = 0,01 nW/cm²/sr`, `maximum = 2000 nW/cm²/sr`, `levels = 256` et
`scale = log10(1 + maximum / offset)` :

```text
encode(R) = round(255 * log10(1 + R / offset) / scale)
decode(L) = offset * (10 ** (L * scale / 255) - 1)
```

`decode(0)` vaut exactement 0, `decode(255)` exactement `maximum`, et
`encode(decode(L)) === L` pour chaque niveau. Le pas est un constant
0,0208 dex, soit 0,052 mag/arcsec² là où la composante artificielle domine —
très en dessous de l'incertitude du modèle lui-même. `maximum` couvre le champ
**propagé** : une cellule brute atteint 8191 nW/cm²/sr dans le composite 2025,
mais le noyau étale cela et le pic propagé est de 1091. Le script prévient au
lieu d'écrêter en silence si une cellule dépassait `maximum`.

La définition unique vit dans `packages/portal/src/sky-quality.js` ; les
fixtures partagées (`sky-quality-encode`, `sky-quality-decode`,
`sky-quality-nearest`, `sky-quality-sample`, `sky-quality-radiance`) la
fixent.

## Le modèle de propagation

VIIRS mesure la lumière qui quitte chaque cellule **vers le haut**. La
luminance au zénith que voit un observateur est de la lumière diffusée par une
large zone autour du site. Les deux ne coïncident que là où le satellite
regarde justement de la lumière diffusée plutôt que des lampes, et
`average_masked` rend la chose impossible à contourner : il met à zéro toute
cellule où aucune lumière n'a été détectée, si bien que sans noyau une vallée à
55 km de Madrid ressort comme un ciel vierge. Cumuler les alentours avec une
pondération par la distance est ce qui supprime ce défaut — et c'est le cas qui
intéresse réellement un astrophotographe.

### Noyau

Duriscoe, D. M., Anderson, S. J., Luginbuhl, C. B. & Baugh, K. E., « A
simplified model of all-sky artificial sky glow derived from VIIRS Day/Night
band data », _Journal of Quantitative Spectroscopy and Radiative Transfer_ 214
(2018) 133–145, doi:10.1016/j.jqsrt.2018.04.028. Publié en accès ouvert sous
CC BY 4.0 ; lu intégralement depuis la copie hébergée par la NOAA sur
<https://repository.library.noaa.gov/view/noaa/21007>.

Leur équation (9), page 135, cumule la radiance de la bande Day/Night sur les
cellules autour d'un site avec une pondération en puissance de la distance, et
l'équation (11), page 139, fait croître l'exposant avec la distance :

```text
ALR = c · Σ rᵢ dᵢ^(−α)          α = 2,3 (d/350)^0,28        (d en km)
```

L'article décrit cet exposant comme allant « from −0.45 at 1 km to −2.20 at
300 km » (page 139), ce qui lève l'ambiguïté typographique de `2.3(…)` en
faveur d'une multiplication : 2,3·(1/350)^0,28 = 0,446 et
2,3·(300/350)^0,28 = 2,203 reproduisent exactement ces bornes. Un exposant
variable est ce que prédisent les modèles de transfert radiatif de Garstang —
Garstang, R. H., « Model for artificial night-sky illumination », _PASP_ 98
(1986) 364, page 369, écrit que pour `b = C P D^α`, « α becomes more negative
for increasing D », et sa Table II ainsi que la Table 1 à Terre courbe de
Garstang (1989), _PASP_ 101, 306, page 314, tabulent α de −1,90 à −4,50. La loi
de Walker pour une ville unique — Walker, M. F., « The effects of urban
lighting on the brightness of the night sky », _PASP_ 89 (1977) 405, section
III, page 407, où les observations « have been represented by a straight line
corresponding to I ∝ D^−2.5 » — en est le cas particulier à exposant constant.
Elle est citée ici comme origine de la loi de puissance, pas comme la loi
employée : elle a été mesurée à 45° de hauteur en direction d'une seule ville
entre 8 et 99 km, et Walker n'écrit jamais la forme population-et-distance
qu'on lui attribue habituellement.

**Un seul changement est apporté.** L'équation (11) a été ajustée sur la
luminance moyenne de TOUT LE CIEL, alors que ce portail publie une valeur au
ZÉNITH. Le même article dit explicitement que les deux ne sont pas
interchangeables : il mesure ALR/ZLR entre 1,58 et 3,27 dans le modèle et entre
2,0 et 6,0 dans les observations, « highest in the darkest locations » (page
141), et indique qu'une relation zénith/distance distincte « would have to be
derived ». La luminance au zénith décroît plus vite, donc l'échelle de
l'exposant est réajustée ici sur des mesures de luminance **au zénith** :

```text
K(d) = d^(−α(d)),   α(d) = 3,8 (d/350)^0,28,   K(0) = 1,   d ≤ 300 km
```

L'exposant effectif va de 0,74 à 1 km à 3,64 à 300 km, à l'intérieur de la
plage tabulée par Garstang. La troncature est celle de Duriscoe, 300 km
(section 2.3, page 137), pour les raisons qui y sont données : la bibliothèque
de propagation de Cinzano & Falchi s'étend à 350 km, les caméras tout-ciel
montrent des dômes lumineux « readily visible from large cities up to 300 km
away », et Las Vegas vu depuis le Great Basin National Park à 311 km
« contributes less than 2% of the natural background ». Réajuster à 150, 200,
250, 300 et 350 km déplace la constante de calibration de moins de 0,4 % : rien
ici ne dépend de la coupure exacte.

**Champ proche.** Le noyau est déjà borné — α → 0 quand d → 0, donc d^(−α) → 1,
avec un maximum de 1,797 à d ≈ 28 m — et il n'y a pas de singularité à
supprimer. Bará, S. & Lima, R. C., « Photons without borders », _International
Journal of Sustainable Lighting_ 20 (2018) 51–61, arXiv:1809.05376, notent que
l'approximation « clearly subestimates the actual value » à l'origine et la
bloquent à la valeur du noyau à 0,4 km, un choix « suggested by the pixel
size ». Aucun blocage n'est utilisé ici, parce que le script de préparation
n'échantillonne pas le noyau en un point : il le **moyenne sur chaque cellule
source** partout où la cellule est assez proche pour que le noyau varie d'un
bord à l'autre (jusqu'à quatre cellules). C'est la quadrature correcte de la
somme de l'équation (9), et c'est ce qui fait qu'une région uniformément
éclairée se propage exactement à sa propre radiance — une propriété que la
suite de tests vérifie.

**Unités.** L'équation (9) est une somme sur des cellules, donc sa constante
dépend de la taille de cellule utilisée par les auteurs. Diviser plutôt par
l'intégrale de surface du noyau lui-même supprime cette dépendance et garde le
champ en nW/cm²/sr à n'importe quelle résolution. La constante de calibration
qui transforme la radiance propagée en luminance vit donc au moment de la
lecture et peut être changée sans reconstruire le raster.

### Comment c'est calculé

Une convolution directe en 2′ jusqu'à 300 km, c'est environ 3 × 10¹⁰ produits.
Le noyau est donc coupé en deux par une rampe cubique C¹ entre 30 et 66 km,
`K = K_proche + K_lointain` exactement : la moitié compacte est diffusée depuis
les 5,2 % de cellules éclairées, à pleine résolution, et la moitié lointaine,
lisse, depuis une grille de flux à 6′ dont les cellules s'emboîtent exactement
dans les cellules de sortie. Comme `K_lointain` est identiquement nul en deçà
du bord intérieur de la rampe **et** y a une dérivée nulle, quantifier une
source — ou l'observateur — sur la grille grossière ne peut pas la faire
traverser une partie raide du noyau.

Comparée à une convolution exacte cellule par cellule sur la vraie grille 2025,
aux points de contrôle et le long du transect ci-dessous, la coupure est exacte
à 2,4 % près (0,026 mag) partout, sauf pour les cellules dont la valeur propagée
est proche du plancher d'encodage, où le pas 8 bits domine et où la luminance du
ciel vaut 22,00 de toute façon.

## De la radiance à la luminance du ciel

La luminance artificielle au zénith est linéaire en la lumière qui atteint
l'observateur, donc une seule constante convertit la radiance propagée :

```text
B_artificielle [mcd/m²] = 0,2990 × radiance propagée [nW/cm²/sr]
SQM = −2,5 log10((B_artificielle + 0,171168465) / 1,08e8)
```

Le fond naturel de 22,0 mag/arcsec² (0,171168465 mcd/m²) et le point zéro de
1,08 × 10⁸ mcd/m² sont inchangés, et le résultat entre dans la table
`bortleFromSqm` inchangée.

### Quel fond naturel, et pourquoi 22,0

Deux conventions circulent. Falchi et al. (2016) « chose 22.0 mag/arcsec²,
corresponding to 174 μcd/m² » ; le National Park Service utilise 171 μcd/m²,
soit 22,02 mag/arcsec² sur le même point zéro — la même convention à 0,02 mag
près. Zamorano et al. (2016) prennent 21,8. Ce pipeline garde **22,0**, parce
que c'est la convention des deux sources contre lesquelles il calibre et qu'il
cite, et parce que c'est la valeur que le portail utilisait déjà partout
ailleurs.

C'est une convention, pas une mesure. Le vrai ciel naturel au zénith varie de
0,3 à 0,4 mag au fil du cycle solaire (Patat 2008 donne V = 21,71 ± 0,24 à
Paranal en moyenne de cycle et 21,99 au minimum solaire), donc 22,00 est le
plancher du modèle plutôt qu'une affirmation sur une nuit donnée. Rien dans ce
pipeline ne peut annoncer un ciel plus sombre que 22,00.

### Calibration

`packages/portal/scripts/calibrate-sky-quality.mjs` ajuste cette constante et
imprime les résidus. Il utilise deux sources, toutes deux redistribuables sans
restriction non commerciale ni partage à l'identique. **Aucune n'est committée
dans ce dépôt** : le script les reçoit avec `--input`, ou les télécharge avec
`--download`.

| Source                                                      | Contenu                                                                                         | Licence                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------- |
| National Park Service Night Skies Program, `nsdmap.geojson` | 656 mesures tout-ciel en bande V ; `ZENITH_ART` est la luminance artificielle au zénith, µcd/m² | Domaine public (œuvre du gouvernement US) |
| Globe at Night, NSF NOIRLab, `GaN<année>.csv`               | relevés SQM au zénith par science participative, mondiaux                                       | CC BY 4.0                                 |

L'ajustement minimise le résidu quadratique moyen **en magnitudes de luminance
totale du ciel**, pas en luminance : près du plancher naturel un dixième de
magnitude représente une grande fraction de la partie artificielle, et un
ajustement en luminance laisserait les sites les plus sombres dominer.

Globe at Night est bruité, donc filtré durement puis agrégé : ciel clair
uniquement ; relevés hors de 16,0–22,3 mag/arcsec² écartés (la distribution
brute s'entasse sur 10,0 et 23,0, les bornes du formulaire lui-même, et le
zénith mesuré des pires cœurs de ville tourne autour de 17) ; une médiane par
cellule du raster ; au moins trois relevés indépendants par cellule ; et les
cellules dont les relevés divergent de plus de 1,5 mag entre les 16ᵉ et 84ᵉ
centiles sont écartées entièrement. `--from-year` vaut 2019 par défaut, parce
que l'éclairage public a assez changé en une décennie pour qu'un relevé de 2013
ne décrive plus le même endroit qu'un composite 2025.

Résultat, contre le raster 2′ construit depuis le composite annuel 2025, avec
des mesures de 2019 à 2025 :

|                       |   sites | constante ajustée |   résidu RMS |
| --------------------- | ------: | ----------------: | -----------: |
| National Park Service |     104 |            0,2012 |     0,35 mag |
| Globe at Night        |     382 |            0,3064 |     0,79 mag |
| **Les deux, livré**   | **486** |        **0,2990** | **0,73 mag** |

L'échelle de l'exposant du noyau est cuite dans le raster, elle ne peut donc
pas être ajustée à la lecture. Elle a été choisie par balayage : reconstruire
le raster pour chaque valeur, relancer la calibration, comparer. L'objectif est
plat de 3,5 à 4,4 (0,716–0,721 mag) ; **3,8** est pris à l'intérieur de ce
plateau, comme la valeur pour laquelle le sous-ensemble National Park Service —
la moitié des données qui a de la vraie photométrie derrière elle — n'a aucun
biais résiduel (−0,001 mag, contre −0,15 mag avec le 2,3 de Duriscoe).

Délibérément **non** utilisés, pour raisons de licence, ni en entrée ni en
calibration : le supplément de mesures du World Atlas (CC BY-NC et non
téléchargeable publiquement), le relevé SQM mobile de Madrid par l'UCM
(doi:10.5281/zenodo.51713, CC BY-NC) et l'archive TESS/STARS4ALL (ODbL, partage
à l'identique). MySkyAtNight ne publie aucune licence.

### Une troisième source : le Japon, non utilisée pour la constante mondiale, utilisée pour sa propre région

Les deux sources ci-dessus baignent dans de l'air sec, ce qui a longtemps été
un angle mort admis du modèle. `--input-japan <fichier>` lit un contrôle en
climat humide : la campagne 環境省 (ministère de l'Environnement) / 星空公団
「デジタルカメラによる夜空の明るさ調査」, menée deux fois par an depuis 2018 —
un appareil photo numérique pointé au zénith (35–50 mm, 30 s, f/5,6, ISO 800),
réduit contre des étoiles standard présentes dans la même image, rendu en
mag/arcsec², avec l'indicateur de dispersion par image propre à la campagne,
ばらつき. Ses lignes ne sont **jamais intégrées à la constante MONDIALE**
(`--calibrate-with-japan` reste l'option explicite pour cela, toujours
inutilisée), mais elles **sont** ce que `--region japan` ajuste — l'entrée
`japan` de la table de calibration régionale ci-dessous — par choix de
conception.

La campagne est publiée deux fois, sous deux régimes différents, et une seule
des deux publications porte des coordonnées :

| Publication                                                                   | Coordonnées | Conditions                                                                                                                                                 |
| ----------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tableaux de résultats 環境省 (PDF joints à chaque 報道発表資料 sur env.go.jp) | non         | 公共データ利用規約（第1.0版）/ PDL1.0, rédigée pour être compatible CC BY 4.0 ; mention de la source obligatoire (出典：環境省 星空観察)                   |
| Couche cartographique 星空観察 de 環境展望台 / 環境GIS, 国立環境研究所        | oui         | politique de site propre à l'institut, qui réserve la reproduction : 「私的使用又は引用等著作権法上認められた行為を除き…引用、転載、複製等はお断りします」 |

Donc la copie sous licence ouverte ne donne que la préfecture, la commune et un
nom de lieu en texte libre, et la copie qui porte les positions n'est pas sous
licence ouverte. **Ce qui est livré est une constante ajustée et sa
provenance, jamais un relevé ni une position** — les tableaux PDL1.0 de la
campagne l'autorisent déjà d'eux-mêmes.

Contre le raster 2′ construit depuis le composite 2025, mesures 2019–2025,
ばらつき ≤ 0,2, agrégées en une médiane par cellule du raster avec au moins
trois relevés :

|                     | cellules | constante ajustée | résidu RMS |
| ------------------- | -------: | ----------------: | ---------: |
| Japon, tout         |      215 |            0,8323 |   0,37 mag |
| Japon, été (humide) |      175 |            0,7239 |   0,40 mag |
| Japon, hiver (sec)  |      186 |            0,9161 |   0,39 mag |

La constante mondiale, 0,2990, laisse **+0,75 mag** de biais sur ces 215
cellules — le modèle lit le ciel d'autant plus sombre qu'il ne l'est — et le
biais suit la brillance : +0,88 dans les cellules mesurées sous 19, +0,95 entre
19 et 20,5, +0,62 entre 20,5 et 21,3, +0,35 au-delà de 21,3. C'est la forme
d'une luminance artificielle sous-estimée d'un facteur constant, et c'est
pourquoi réajuster cette seule constante sur les seules données japonaises fait
tomber leur RMS de 0,83 à 0,37 mag — c'est cet ajustement que
`skyQualityCalibrationRegions.japan` livre.

Deux contrôles indépendants disent qu'il s'agit d'un effet régional réel et non
d'un artefact de la méthode photographique. D'abord, les relevés SQM de Globe
at Night au Japon — autre instrument, autres observateurs, déjà dans le jeu
mondial — portent le même signe : en réajustant sur ces seuls relevés,
restreints au même polygone `japan`, on obtient ≈0,491 sur 91 relevés
répartis en 7 cellules (RMS 0,55 mag, biais +0,12 mag par rapport à cette
constante régionale) — `--region japan` sans `--input-japan` reproduit ce
résultat. Ensuite, la même décomposition appliquée à Globe at Night ailleurs
s'aligne sur le climat plutôt que sur la géographie : l'ouest sec des
États-Unis se réajuste à 0,25 et la péninsule Ibérique à 0,29, tandis que le
sud-est humide des États-Unis se réajuste à 0,36 et l'Europe du Nord-Ouest à
0,34. Le Japon est l'extrémité de ce gradient, pas un phénomène séparé.

**Mise en garde de bande, non corrigée.** Cette campagne réduit une image
photo contre des étoiles standard, proche de la bande V, alors que la
constante mondiale est ajustée surtout sur des relevés SQM de Globe at Night,
une bande beaucoup plus large qui lit typiquement quelques dixièmes de
magnitude plus sombre que la bande V sous un ciel pollué. La valeur régionale
tirée de Globe at Night seul ci-dessus (≈0,491) est l'alternative « même
bande que la constante mondiale » vers laquelle cet écart pourrait se
trancher, une fois le décalage caméra↔SQM connu pour ce type de ciel ; aucune
correction de couleur n'est appliquée à l'une ou l'autre valeur.

Ce qui n'est **pas** confirmé, c'est le volet saisonnier. Au Japon, c'est la
campagne d'été, humide, que le modèle décrit le _mieux_ (biais +0,65 contre
+0,83 en hiver), et les cellules mesurées aux deux saisons ressortent
0,18 ± 0,02 mag plus sombres en été qu'en hiver. Quoi qui produise le décalage
national, ce n'est pas l'oscillation saisonnière de l'humidité.

L'effet de bord « l'océan n'émet rien » a été testé aussi, et largement écarté :
sur 1392 sites le résidu ne corrèle presque pas avec la fraction de terre
pondérée par le noyau dans les 300 km (r = 0,04). Il est réel mais confiné à
une poignée de sites brillants d'îles ou de littoraux étroits — parmi les sites
mesurés sous 19, les quatorze dont moins de la moitié des alentours est de la
terre sont à +2,59 mag, contre +1,15 pour les 268 autres.

Rien de tout cela ne change la constante MONDIALE, et c'est voulu : ajuster
une constante globale unique sur le jeu livré plus le Japon donne 0,3937, ce
qui améliorerait le résidu japonais de 0,82 à 0,67 mag tout en faisant passer
le reste du monde de +0,09 à −0,09 mag de biais et de 0,707 à 0,740 de RMS.
Le Japon représenterait 30 % du jeu de calibration. Ce que le Japon obtient à
la place, c'est sa propre entrée dans la table régionale ci-dessous, qui ne
change rien pour aucune autre position.

### Calibration régionale

`skyQualityLuminancePerRadiance` n'est lue directement que lorsqu'une position
est inconnue ou ne tombe dans aucune région. `skyQualityCalibrationRegions`
dans `packages/portal/src/sky-quality.js` est une liste ORDONNÉE de
`{ id, polygons, luminancePerRadiance, provenance }` : `sqmFromViirsRadiance`
accepte une position `(latitude, longitude)` optionnelle, cherche
`skyQualityCalibrationAt(latitude, longitude)` — un simple test
point-dans-polygone par comptage de croisements, sans dépendance — et applique la constante de la première région
correspondante, sinon la constante mondiale. Tout appelant existant qui
n'avait jamais de position reste inchangé : aucune région ne peut correspondre
sans elle. `GET /v1/sky-quality` et `/api/planner-sky-quality` indiquent
quel jeu de calibration a répondu dans un champ additif `calibration`,
`<version>/<id de région>` (p. ex. `2026-09/japan`, `2026-09/global`) ; voir
`packages/astro-contracts/schemas/api/v1.md`.

L'unique entrée aujourd'hui :

| id      | polygone(s)                                                                                                                   | constante | provenance                                                                                                |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- | --------: | --------------------------------------------------------------------------------------------------------- |
| `japan` | archipel Hokkaidō–Yaeyama (17 sommets) + un petit anneau pour les Ogasawara (4 sommets) ; exclut Corée, Russie, Chine, Taïwan |     0,832 | campagne 環境省 星空観察, 2 799 mesures filtrées → 215 cellules, RMS 0,37 mag, biais +0,05 mag, 2019–2025 |

Les deux anneaux passent surtout en mer, **sans lissage à la frontière** —
Tokyo et Busan, à la même radiance, lisent un SQM différent, volontairement
(voir le transect et les points de contrôle plus bas pour ce que « différent »
signifie en pratique). C'est un compromis assumé, énoncé dès le début de la
conception de ce document : une frontière dure à l'échelle d'un pays, à
quelques kilomètres en mer, ne gêne personne, et tracer une frontière fidèle
au littoral coûterait des dizaines de sommets de plus pour un gain
imperceptible.

**Limites de la valeur japonaise, dites franchement** : 215 cellules et
2 799 mesures forment un échantillon solide pour un seul pays, mais c'est un
seul instrument (un appareil photo, proche de la bande V) réduit par une
seule campagne, et la mise en garde de bande ci-dessus est réelle et non
tranchée — un client qui compare cette constante à un relevé SQM pur ailleurs
compare deux bandes de couleur différentes, pas un défaut de construction.

#### Frontières entre régions

Quand une seconde région touche la première (une frontière terrestre, pas
l'arête en mer du Japon), la table suit une seule règle, vérifiée par
`packages/portal/tests/sky-quality-region-borders.test.mjs` sur chaque région
de la table :

- **Une arête franche sur la frontière administrative, aucun fondu.** Une
  position d'un côté lit la constante de sa région, une position à quelques
  kilomètres de l'autre côté lit celle du voisin (ou la constante mondiale).
  Les constantes des régions mesurées jusqu'ici diffèrent de quelques
  centièmes (Globe at Night : 0,25 à 0,36) contre un résidu de 0,4 mag ou
  plus : la marche à la frontière est plus petite que le bruit de
  l'estimation, et un fondu ajouterait de l'arithmétique pour un gain non
  mesurable.
- **Une région est quelques anneaux simples**, chacun une liste de
  `[latitude, longitude]` fermée implicitement (le premier sommet n'est pas
  répété). Les sommets suivent la frontière administrative simplifiée à
  quelques kilomètres : c'est la frontière du modèle, pas la frontière
  légale.
- **Deux régions qui se touchent partagent les mêmes sommets de frontière** :
  les mêmes coordonnées, chiffre pour chiffre, dans les deux anneaux, donc la
  frontière est une seule chaîne d'arêtes parcourue en sens inverse. Le test
  échoue sur des arêtes qui se croisent (chevauchement), sur un sommet posé
  à l'intérieur de l'arête de l'autre région sans en être un sommet (une
  jonction en T), sur un sommet à moins de 0,05° (environ cinq kilomètres) de
  l'arête de l'autre région sans être dessus (un copeau, donc un trou ou un
  chevauchement), et sur un anneau à l'intérieur d'un autre. Deux régions
  distantes de plus de 0,05° ne se gênent pas.
- **L'ordre de la table départage toujours une égalité** : la première
  correspondance gagne, comme aujourd'hui. Cela ne compte que pour un point
  exactement sur une arête ou un sommet partagé.
- **En mer, l'arête est tracée sur l'eau libre**, comme l'entrée du Japon ;
  une côte n'est jamais suivie.
- **Aucune fusion.** Un pays dont les parties diffèrent n'en fait deux
  régions que si chacune passe la règle d'acceptation ci-dessous ; sinon il
  garde la constante mondiale.

**Ajouter une autre région** suit les mêmes étapes que celles qui ont produit
celle-ci :

1. Obtenir des mesures sous une licence compatible avec ce dépôt : CC0, CC BY,
   domaine public, la Public Data License 1.0, une Open Government Licence,
   ou — comme pour le Japon — un accord écrit pour ne livrer qu'une constante
   ajustée et sa provenance, jamais les mesures ni les positions
   sous-jacentes. **Jamais** rien de non commercial ni de partage à
   l'identique, rien de sans licence, et jamais l'archive STARS4ALL / TESS
   comme entrée (ODbL, une licence de partage à l'identique : validation
   seulement, voir plus bas).
2. Mettre la campagne dans l'unique forme que lit `--input-region`, un CSV
   avec deux lignes de tête qui disent d'où il vient :

   ```text
   # source: <qui l'a publiée>
   # license: CC BY 4.0
   latitude,longitude,magnitude,date,scatter
   46.51,8.02,20.31,2023-07-14,0.08
   ```

   `magnitude` est la brillance du ciel au zénith en mag/arcsec² (14,0 à 22,5
   conservées), `date` une date ISO ou une année (l'année alimente
   `--from-year`), `scatter` est facultatif et écarte les lignes au-dessus de
   `--max-variation`. Un fichier sans ligne `# license:`, ou dont la licence
   n'est pas dans la liste ci-dessus, est refusé avec la raison. Le fichier
   est lu sur disque et jamais commité.

3. Essayer la région avant qu'elle soit dans la table, avec un fichier de
   polygone (les anneaux de la table, `{"polygons": [[[lat, lon], …]]}`),
   `--region <id> --region-polygon <fichier> --input-region <fichier>
--bootstrap 1000`. L'ajustement utilise exactement les mêmes filtres que
   l'ajustement mondial (fenêtre d'années, une médiane par cellule du raster,
   au moins trois relevés par cellule) ; Globe at Night et le jeu du National
   Park Service dans le polygone sont ajustés aussi et imprimés à côté de la
   campagne. `--validate-region <fichier>` compare les constantes à un jeu
   réservé à la validation (toute licence) et n'ajuste rien.
4. **La règle d'acceptation**, vérifiée par cette exécution
   (`assessRegionFit`) : au moins 30 cellules, un intervalle à 95 % de la
   constante (cellules rééchantillonnées, 1000 tirages) qui exclut la
   constante mondiale, et une RMS inférieure à celle de la constante mondiale
   sur les mêmes cellules. Une région qui échoue à l'un des trois n'est pas
   ajoutée : son marché garde la constante mondiale et les écrans disent déjà
   « estimation ». Une région qui passe avec moins de 100 cellules est livrée
   avec `provenance.note` disant que l'ajustement est mince, et le dit dans
   ce document.
5. Tracer le polygone dans `skyQualityCalibrationRegions` selon la règle de
   frontière ci-dessus (une poignée de sommets, partagés avec tout voisin,
   eau libre en mer), ajouter l'entrée avec la constante imprimée (trois
   décimales) et sa provenance, incrémenter `skyQualityCalibrationVersion`,
   ajouter des cas de part et d'autre de chaque frontière à
   `fixtures/spec/sky-quality-region.json` et régénérer les fixtures. Si la
   source demande une ligne d'attribution, étendre
   `skyQualityCalibrationCredit` dans `i18n.js` côté web.

### Calibration régionale par marché

La même étude pour le marché de chaque langue d'interface après les trois
premières. La seule source ouverte mondiale avec positions est Globe at Night
(CC BY 4.0) avec le jeu du National Park Service (domaine public), déjà dans
l'ajustement mondial, et hors des États-Unis et de l'Europe ils sont minces.
Exécuté sur 2019 à 2025 contre le composite 2025, avec les filtres par
défaut :

| Langue  | Marché                                     | Relevés | Cellules | Ajustée | Intervalle à 95 % | Verdict                                           |
| ------- | ------------------------------------------ | ------: | -------: | ------: | ----------------- | ------------------------------------------------- |
| zh-Hans | Chine continentale                         |      11 |        1 |       — | —                 | pas d'ajustement                                  |
| zh-Hant | Taïwan, Hong Kong, Macao                   |       3 |        0 |       — | —                 | pas d'ajustement                                  |
| de      | Allemagne, Autriche, Suisse                |     391 |       26 |   0,269 | 0,229 à 0,321     | l'intervalle contient 0,299, moins de 30 cellules |
| es      | Espagne                                    |     427 |       10 |   0,369 | 0,232 à 0,585     | l'intervalle contient 0,299, 10 cellules          |
| es      | Mexique (pas le premier marché de l'étude) |     184 |       10 |   0,325 | 0,139 à 0,645     | l'intervalle contient 0,299, 10 cellules          |
| it      | Italie                                     |      42 |        2 |       — | —                 | pas d'ajustement                                  |
| pt-BR   | Brésil                                     |      12 |        1 |       — | —                 | pas d'ajustement                                  |
| ru      | Russie                                     |       2 |        0 |       — | —                 | pas d'ajustement                                  |

**Aucune région n'a été ajoutée**, et `skyQualityCalibrationVersion` n'a pas
été incrémentée (une incrémentation ne fait que périmer toutes les
estimations en cache). Chacun de ces marchés garde la constante mondiale, et
`fixtures/spec/sky-quality-region.json` l'épingle par un cas par ville de
marché. Les raisons, dites sans détour :

- _Trop peu de relevés_ pour la Chine, Taïwan, l'Italie, le Brésil et la
  Russie : zéro à deux cellules avec trois relevés par ciel clair en six
  années de Globe at Night.
- _Aucune séparation de la constante mondiale_ pour le marché
  germanophone, l'Espagne et le Mexique : avec 10 à 26 cellules,
  l'intervalle de la constante ajustée contient 0,299 et le gain de RMS est de
  0,00 à 0,03 mag. La constante germanophone bouge aussi avec la fenêtre de
  données (0,269 dès 2019, 0,328 dès 2016, 0,375 dès 2013, tandis que la
  constante mondiale ajustée sur la même fenêtre passe de 0,295 à 0,326),
  ce qui est la marque du bruit, pas d'un pays. Le découpage par climat plus haut dans ce document (Ibérie 0,29, Europe du Nord-Ouest 0,34) est le même genre de chiffre sur une autre fenêtre de données : cette exécution ne le retrouve pas comme une différence régionale stable.
- _L'Amérique latine_ ne fait pas non plus une région : les 23 cellules
  réparties entre le Mexique, le Chili, l'Argentine et l'Uruguay vont de 0,33
  à 0,82 selon le pays.
- _D'autres sources ouvertes_ ont été regardées et ne sont pas utilisables
  comme entrées : les mesures STARS4ALL / TESS-W et EELabs sont servies par un
  tableau de bord, sans fichier en bloc portant des positions, sous une
  politique de données qui n'est pas indiquée comme une licence d'attribution (validation
  seulement) ; un jeu toscan sous CC BY porte des codes de station et aucune
  coordonnée ; un réseau galicien sous CC0 est de 14 capteurs fixes pour une
  année, moins de cellules que Globe at Night n'en donne déjà. Une campagne
  nationale comparable à celle du Japon, aux conditions qui permettent une
  constante ajustée, n'a été trouvée pour aucun de ces marchés.

Ce qui changerait la donne : une campagne nationale sous une licence
acceptable dans la forme `--input-region` (quelques dizaines de cellules
suffiraient), ou plusieurs années de Globe at Night de plus. L'exécution est
une commande par région candidate, et le verdict est imprimé.

## Ce que cela donne

### Transect au départ de Madrid

Huit points depuis la Puerta del Sol selon l'azimut 315°, sur le raster 2′
préparé. `node packages/portal/scripts/check-sky-quality-raster.mjs` reproduit
ce tableau.

|  km | radiance |   SQM | Bortle | avant (modèle par pixel) |
| --: | -------: | ----: | -----: | ------------------------ |
|   0 |    43,00 | 17,30 |      8 | 16,71 / B9               |
|  20 |    11,74 | 18,67 |      7 | 19,42 / B6               |
|  35 |     9,83 | 18,85 |      7 | 17,70 / B8               |
|  45 |     4,88 | 19,55 |      5 | 19,63 / B5               |
|  55 |     1,69 | 20,51 |      4 | **22,00 / B1**           |
|  75 |     0,76 | 21,08 |      4 | 19,78 / B5               |
| 110 |     0,70 | 21,13 |      4 | 21,56 / B4               |
| 170 |     0,50 | 21,32 |      4 | 22,00 / B1               |

Le profil s'assombrit désormais de façon monotone jusqu'au bout, et **aucun
point à moins de 100 km de la ville ne descend sous Bortle 4**. Le 22,00 de
l'ancien modèle à 55 km — un ciel vierge à 55 km de six millions d'habitants —
était le défaut que ceci remplace ; il venait de ce que `average_masked` avait
mis cette cellule à zéro.

Comparé au seul profil mesuré dense de cette région — le relevé SQM mobile de
l'UCM, utilisé ici comme contrôle et jamais comme entrée — le modèle s'accorde
à 0,03–0,06 mag près dans l'anneau 40–90 km et à moins de 0,7 mag partout :

| distance  | médiane mesurée (2010–2014) | modèle (composite 2025) |
| --------- | --------------------------: | ----------------------: |
| 0–5 km    |                       17,52 |                   17,41 |
| 5–15 km   |                       18,15 |                   17,61 |
| 15–25 km  |                       19,08 |                   18,39 |
| 25–40 km  |                       19,67 |                   19,28 |
| 40–60 km  |                       20,40 |                   20,37 |
| 60–90 km  |                       20,90 |                   20,96 |
| 90–150 km |                       21,16 |                   21,46 |

Les deux sont séparés de onze ans et Madrid est passée aux LED entre-temps :
le résidu mélange donc erreur de modèle et changement réel sur le terrain.

### Points de contrôle

Les lignes `mesuré` ont une mesure au sol publiée derrière elles ; les lignes
`indicatif` ne sont que des ordres de grandeur.

| Lieu                            | type      |   SQM | Bortle | attendu   |
| ------------------------------- | --------- | ----: | -----: | --------- |
| Madrid, Puerta del Sol          | mesuré    | 17,30 |      8 | 17,0–17,8 |
| Madrid, observatoire UCM        | mesuré    | 17,45 |      8 | 18,2–18,6 |
| Campagne madrilène, ~60 km      | mesuré    | 20,76 |      4 | 21,0–21,5 |
| Pic du Midi de Bigorre          | mesuré    | 21,84 |      3 | 20,9–21,5 |
| Roque de los Muchachos          | mesuré    | 21,81 |      3 | 21,7–22,0 |
| Cerro Paranal                   | mesuré    | 22,00 |      1 | 21,7–22,0 |
| Paris, Notre-Dame               | indicatif | 17,38 |      8 | 17,3–18,5 |
| New York, Manhattan             | indicatif | 16,65 |      9 | 17,0–17,8 |
| Tokyo, Chiyoda                  | indicatif | 16,98 |      9 | 17,0–17,8 |
| Banlieue de Paris, ~20 km NE    | indicatif | 18,20 |      8 | 18,5–19,5 |
| Sierra de Guadarrama, ~55 km NO | indicatif | 20,52 |      4 | 20,3–21,3 |
| Cévennes / mont Lozère          | indicatif | 21,92 |      2 | 21,4–21,8 |
| Cherry Springs State Park       | indicatif | 21,94 |      2 | 21,5–21,8 |
| Atlantique, pleine mer          | indicatif | 22,00 |      1 | 22,0      |
| Mauna Kea                       | indicatif | 21,93 |      2 | —         |
| Kiruna, ville minière arctique  | indicatif | 18,47 |      7 | —         |

Sources des lignes mesurées : Zamorano et al. 2016, _JQSRT_ 181, 52
(arXiv:1512.06694) pour le centre de Madrid et sa campagne ; Robles et al.
2021, _Remote Sensing_ 13, 1511 pour l'observatoire de l'UCM ; Charlier 2017,
HAL halshs-01620903 pour le pic du Midi (SQM-L, moyenne 21,26 sur n = 33,
étendue 20,92–21,52) ; Benn & Ellison 1998 pour La Palma ; Patat 2008 pour
Paranal.

Un seul point mesuré s'écarte de plus de 0,5 mag : **l'observatoire de l'UCM,
0,75 mag trop clair**. Il se trouve à 3,5 km de la Puerta del Sol, soit moins
d'une cellule de 2′, donc le modèle ne peut pas résoudre le gradient d'environ
1 mag entre les deux ; il coupe la poire en deux et tombe sur le plus clair. Ce
n'est pas une erreur de calibration mais une limite de résolution.

## Ce que l'estimation ne modélise pas

- **Le masquage par le relief.** Une crête entre une ville et le site bloque
  une partie de la lueur, et rien ici n'en sait quoi que ce soit. Sánchez de
  Miguel et al. (2020) signalent exactement ce manque : « the circled area in
  Fig. 13 shows a significant difference between our model of skyglow based on
  VIIRS and ISS data and the sky brightness reported by the World Atlas. We
  believe this is most likely due to the mountains blocking the light of
  Madrid, resulting in a darker sky beyond them ». Le pic du Midi, 0,32 mag
  plus sombre dans le modèle que la moyenne mesurée, est un cas plausible en
  sens inverse : un site de sommet dont le noyau traite l'horizon comme du sol
  plat.
- **L'altitude de l'observateur.** La masse d'air et la couche d'aérosols
  au-dessus d'un site à 2000 m diffèrent de celles au niveau de la mer, et il
  n'y a aucun terme d'altitude nulle part dans ce pipeline.
- **L'atmosphère locale.** La constante MONDIALE ne peut pas connaître la
  charge en aérosols. Le jeu de calibration est dominé par de l'air sec (tous
  les sites du National Park Service sont aux États-Unis, la plupart dans
  l'Ouest), donc un ciel humide et plus brumeux est probablement un peu plus
  clair que ce que dit la constante mondiale, hors d'une région dotée de sa
  propre entrée. Ce n'est plus une suspicion mais une mesure : voir « Une
  troisième source : le Japon, non utilisée pour la constante mondiale,
  utilisée pour sa propre région » plus haut, où la constante mondiale lit
  0,75 mag trop sombre sur 215 cellules japonaises, et où la même
  décomposition de Globe at Night place les régions sèches vers 0,25–0,29 et
  les régions humides vers 0,34–0,36 sur la même constante — voir
  « Calibration régionale » plus haut pour la façon dont l'entrée japonaise
  traite ce cas pour les positions qu'elle couvre.
- **Le spectre des lampes, et la bande.** La constante est ajustée en partie
  contre de la photométrie tout-ciel en bande V et en partie contre des
  relevés SQM, qui diffèrent d'environ 0,5 (B−V) du ciel — et cette couleur
  dépend des lampes, qui changent vite. Aucune correction de couleur n'est
  appliquée, parce qu'en appliquer une seule reviendrait à inventer un nombre.
- **Les villages masqués à zéro.** `average_masked` retire les cellules où
  aucune lumière n'a été détectée. Les petits hameaux isolés sous ce seuil ne
  contribuent donc rien, et le modèle **sous**-estime légèrement la clarté en
  rase campagne.
- **La résolution.** Une cellule de 2′ fait 3,7 km à l'équateur. Deux lieux
  plus proches que cela reçoivent la même réponse, comme le montre la ligne de
  l'observatoire de l'UCM ci-dessus.

Il n'existe actuellement **aucun moyen pour un utilisateur de saisir son propre
SQM ou sa propre classe de Bortle mesurés** pour un lieu : le lieu
d'observation porte un nom, des coordonnées, un fuseau horaire, une altitude et
un masque d'horizon, et rien d'autre. Une mesure saisie prenant le pas sur
l'estimation serait l'amélioration réelle la moins coûteuse pour un site que le
modèle rate.

## Clarté par direction (estimation)

Le raster donne un seul nombre par lieu : la clarté **au zénith**.
`skyBrightnessByDirection` (`packages/portal/src/sky-quality-direction.js`) estime
le reste du ciel à partir du même champ, pour qu'un dôme lumineux puisse être
dessiné sur la carte d'horizon. C'est **une estimation, pas une mesure**, et
chaque résultat le dit (`estimate: true`, `model: "line-of-sight-v1"`).

**Entrée.** `skyQualityWindow` (ou `skyQualityWindowFromGrid` pour une grille
installée, `loadSkyQualityWindow` côté serveur, `skyQualityWindowFromRaster`
sur l'appareil à partir du raster à 6′ du pack hors ligne) découpe les
cellules du raster lui-même dans un rayon de 150 km autour du lieu, décodées
en radiances. À 2′, cela fait environ 100 × 84 cellules ; à 6′, environ
35 × 30. Rien d'autre n'est lu : ni réseau, ni relief.

**Modèle.** En regardant à la hauteur _h_ vers l'azimut _A_, la ligne de visée
traverse une couche diffusante dont la densité décroît exponentiellement avec
l'altitude (hauteur d'échelle _H_, `layerHeightKm`, 5 km par défaut). À la
distance horizontale _x_, elle se trouve à la hauteur
`z = x·tan h + x²/(2R⊕)` au-dessus d'un point au sol _P_. La lumière diffusée
vers l'observateur à cet endroit est prise proportionnelle à la lueur
zénithale de _P_ — la valeur du raster, qui cumule déjà toutes les sources
autour de _P_ — multipliée par la densité locale de la couche, et atténuée par
la couche traversée au retour :

```text
B(h, A) = K · Σ R(P(x_k, A)) · e^(−τ·q_k) · Δq_k  /  Σ_zénith e^(−τ·q_k) · Δq_k
```

où `q` compte les colonnes zénithales de couche déjà traversées, 64
échantillons répartis régulièrement dans la couche jusqu'à dix hauteurs
d'échelle, et _K_ la même constante régionale luminance/radiance que
l'estimation zénithale. Le fond naturel de 22,0 mag/arcsec² est ajouté une
seule fois, sans pondération. La distance moyenne de traversée vaut environ
`H / tan h` (28 km à 10°, 5 km à 45°), le premier modèle écrit pour cette
fonction ; intégrer le long de toute la ligne de visée plutôt que lire un seul
point à cette distance garde une ville proche plus claire sur l'horizon,
plutôt que dans un anneau à la seule hauteur dont la distance de traversée
tombe sur elle.

**Pondération par la longueur du trajet, et son plafond.** Pour un champ
uniforme, le rapport au zénith vaut `W(h) = (1 − e^(−τ·Q(h))) / (1 − e^(−τ))`,
où `Q(h)` est la masse d'air de la couche (≈ 1/sin h près du zénith, finie sur
l'horizon grâce à la courbure de la Terre : ≈ 45 pour H = 5 km). Près du
zénith, la lueur artificielle croît comme une masse d'air ordinaire ; vers
l'horizon, le terme d'extinction la plafonne à `1/(1 − e^(−τ))`, parce que la
lumière diffusée loin sur un long trajet est elle-même atténuée au retour.
Avec l'épaisseur optique zénithale par défaut `τ = 0,15` (`opticalDepth`,
bande V ; plage documentée de 0,15 pour un ciel clair et sec à 0,5 pour un
ciel brumeux), une lueur uniforme ne dépasse jamais de plus de 2,1 mag sa
valeur au zénith. La même extinction rend un dôme lointain plus clair
quelques degrés au-dessus de l'horizon plutôt que sur l'horizon même, comme le
montrent les photographies tout-ciel de villes lointaines.

**Règles.** À 90°, la valeur est
l'estimation ponctuelle (même lecture bilinéaire, même conversion, même
calibration régionale). Une hauteur inférieure à 2° est calculée comme 2°.
Au-delà de `maximumDistanceKm` (150 km) le long de la ligne de visée, la
valeur à cette distance est utilisée ; hors de la fenêtre, la cellule de bord
de la fenêtre.

**Validation.** `packages/portal/scripts/validate-sky-direction.mjs` le fait
tourner sur des points de référence (`--sites`, coordonnées arrondies à 0,1°,
aucun nom) et écrit un tableau et un diagramme polaire par point. Sur le
raster 2′ de 2025, avec les paramètres par défaut : le zénith égale
l'estimation ponctuelle en chaque point ; depuis six points ruraux ou de
montagne situés à 36–58 km d'une grande ville isolée, l'azimut le plus clair
à 10° tombe à moins de 15° du relèvement du centre-ville cinq fois sur six
(0°, 8°, 10°, 10°, 10° et 16°), et ces cinq sur six tiennent pour toute
hauteur de couche de 3 à 8 km et toute épaisseur optique de 0,15 à 0,5 ; deux
points témoins loin de toute lumière restent à 0,01 mag de leur zénith.
Face à la photométrie tout-ciel du National Park Service (`--nps`, 445 sites
éclairés), la luminance artificielle moyenne sur l'hémisphère est corrélée à
r = 0,90 en logarithme avec la mesure, rapport médian 0,86 ; le rapport
moyenne/zénith du modèle (médiane 2,9 à τ = 0,25, 3,5 à τ = 0,15, la valeur par défaut) est plus bas que celui mesuré (4,0) :
l'estimation rend probablement le bas du ciel un peu trop sombre par rapport
au zénith.

**Ce qu'il ne sait pas.** Tout ce que liste « Ce que l'estimation ne modélise
pas » ci-dessus, et en plus : le relief sur la ligne de visée (une crête entre
une ville et l'observateur ne cache rien ici), une seule hauteur de couche et
une seule épaisseur optique pour tous les lieux et toutes les nuits, aucun
éclaircissement naturel vers l'horizon (luminescence atmosphérique, lumière
zodiacale, extinction du ciel naturel), aucun nuage éclairé au-dessus d'une
ville. Il dit d'où vient la lueur artificielle et à peu près combien elle pèse
par rapport au zénith ; il ne remplace pas une mesure tout-ciel du lieu.

### Sur la carte d'horizon

La carte d'horizon du planificateur peut dessiner cette
estimation comme un calque : ouvrez « Calques » à côté de « Positions |
Trajet » et activez « Pollution lumineuse par direction ». Le calque est un
voile chaud et translucide sur toute la carte, dans les deux projections,
dessiné sous le masque d'horizon, le trajet et les cibles, et présenté comme
une **estimation** ; la description lue de la carte dit où il est le plus
fort. L'échelle est absolue, en mag/arcsec² (l'unité du Bortle) : un ciel à
21,6 ou plus sombre n'est pas teinté du tout, puis la teinte se réchauffe et
se renforce jusqu'à 18,0 et plus clair, ce qui fait monter un dôme depuis
l'horizon qui s'efface avec la hauteur. Il ne sert qu'à l'affichage : le
classement des cibles ne le lit pas. Le calque est désactivé par défaut ; le
plan retient l'interrupteur (`view.horizon.layers`), jamais les valeurs
dessinées.

Où il est calculé : un client qui détient le raster 6′ du pack hors ligne le
calcule sur l'appareil, donc sans réseau ; sinon il interroge le service,
`GET /v1/sky-quality/direction`, qui le calcule à partir du raster 2′ installé
(coordonnées arrondies à 0,01°). Le web interroge toujours le service. La
grille est gardée par lieu et par somme de contrôle du raster ; c'est une
donnée dérivée, jamais synchronisée et jamais écrite dans un plan. Sans
raster, et hors ligne sans rien de gardé, l'interrupteur est désactivé et dit
pourquoi.

## Tuile de fixture

`packages/astro-contracts/fixtures/sky-quality-tile.json` est une découpe
4° × 4° du raster préparé (11O–7O, 37N–41N : une zone métropolitaine côtière
adossée à l'Atlantique ouvert, donc la tuile couvre toute la plage encodée), au
même encodage, avec ses propres limites et sa provenance. Les tests
d'échantillonnage la lisent au lieu du raster complet, donc ils n'ont besoin ni
d'accès réseau ni d'un compte EOG. Régénérez-la
avec les mêmes `--fixture-tile-bounds` après une reconstruction du raster.
