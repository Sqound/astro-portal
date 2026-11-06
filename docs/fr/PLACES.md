# Lieux suggérés

Autour d’un de vos lieux, le planificateur peut suggérer des **points de vue,
campings, parcs et aires de pique-nique** nommés où observer, chacun avec une
estimation de l’obscurité de son ciel. En ajouter un à vos lieux en fait un
lieu à vous, comme les autres, avec un lien vers le lieu d’origine pour que
ses détails (site internet, horaires, accès) restent à portée de main.

La version anglaise de cette page est [../PLACES.md](../PLACES.md).

## Où les trouver

- **Sur le téléphone** : « Planifier » → « Lieux » (« Mes lieux » et « Lieux
  suggérés »), et « Trouver un lieu idéal » dans la feuille qui choisit le lieu d’un
  plan.
- **Sur le web** : la vue « Lieux » du planificateur (la cinquième vue, à côté
  de « Plans », « Cadrages » et « Catalogue »), et « Trouver un lieu idéal » dans la
  feuille qui s’ouvre depuis le champ « Lieu » de l’étape 1 (une feuille en bas
  sous 600 px, un dialogue sur le côté au-delà). « Itinéraire » et « Ouvrir le
  site » s’ouvrent dans un nouvel onglet : le web n’a pas d’application de
  cartes, et donne la page d’itinéraire d’OpenStreetMap.

## Ce qui est suggéré

| Type                | Ce que c’est dans OpenStreetMap                                                           |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Point de vue        | `tourism=viewpoint`                                                                       |
| Camping             | `tourism=camp_site`                                                                       |
| Parc                | `leisure=park` dans l’extrait local ; parcs nationaux/réserves en mode Overpass explicite |
| Aire de pique-nique | `tourism=picnic_site`                                                                     |

- Seulement les lieux qui ont un **nom** ; un lieu dessiné comme une surface
  est placé en son centre.
- À 10, 30, 60 ou 100 km du centre de la recherche ; 50 lieux au plus, les
  plus sombres d’abord (au centième de magnitude, la valeur écrite sur les
  cartes), et à ciel égal les plus proches du centre de la recherche : là où
  le raster lit la même valeur partout, on garde les lieux les plus proches,
  pas les premiers par ordre alphabétique. Le service ne connaît ce centre
  qu’arrondi à 5 km, comme toujours.
- **L’obscurité** est l’estimation de notre propre raster de qualité du ciel
  (celui de toutes les valeurs Bortle et mag/arcsec² du planificateur, voir
  [SKY_QUALITY_RASTER.md](SKY_QUALITY_RASTER.md)), calculée par le service en
  chaque lieu. C’est une estimation, jamais une mesure.
- **La distance** est la distance à vol d’oiseau, mesurée par votre appareil
  depuis votre propre lieu de référence ; le service ne la calcule jamais. Le
  temps de trajet et l’itinéraire sont décrits
  [plus bas](#temps-de-trajet-trajet-et-le-meilleur-lieu-cette-nuit).
- **Rien n’est promis sur l’accès.** Une suggestion est un lieu nommé, pas une
  autorisation : l’accès, les horaires et la sécurité de nuit ne sont pas
  vérifiés, et les écrans le disent.

## Temps de trajet, « Trajet » et le meilleur lieu cette nuit

Tout cela est calculé sur votre appareil et n’appelle aucun service
d’itinéraire : il n’y a ni service d’itinéraire ni clé.

- **Le temps de trajet** est une **estimation**, et chaque écran le dit. C’est
  la distance à vol d’oiseau × 1,3 (la route est plus longue que la ligne
  droite), à 50 km/h, arrondie à 5 minutes : 18 km donne « ≈ 30 min », 100 km
  « ≈ 2 h 35 », moins de cinq minutes « moins de 5 min ». Il figure sur chaque
  suggestion (« Point de vue · 18 km · ≈ 30 min ») et sur une ligne de la fiche
  (« Trajet · ≈ 30 min en voiture · estimation »). Il ne sait rien de la
  circulation, des routes ni de la météo : l’itinéraire exact est celui de
  l’application de cartes.
- **« Trajet »** (sur chaque suggestion ; « Itinéraire » dans la fiche, même
  action) ouvre l’application de cartes au lieu : Plans sur iOS, l’intention
  `geo:` sur Android, la page d’itinéraire d’OpenStreetMap dans un nouvel onglet
  sur le web. Il ne dit rien de la durée.
- **« Meilleur cette nuit »**, troisième choix de « Trier par », classe les
  suggestions selon trois faits, montrés sur chaque ligne, jamais comme une
  note : les **nuages** de cette nuit (la couverture nuageuse moyenne sur la
  nuit astronomique du lieu autour duquel vous cherchez, 50 points : 50 × (100 −
  nuages) / 100), le **ciel** (le SQM estimé sur l’échelle de 18 à 22 de la
  fiche, 30 points) et le **trajet** (20 × (1 − minutes / 156), 156 minutes
  étant l’estimation du plus grand rayon, 100 km ; 20 points). Une ligne dit
  « Nuages 12 % en moyenne cette nuit · Bortle 2 · ≈ 30 min en voiture ». À
  égalité, le lieu le plus proche passe devant. Les prévisions ne sont
  demandées qu’au choix du tri, cinq à la fois, par la même lecture de la météo
  que « Cette nuit », et gardées pour la session. Un lieu dont la prévision ne
  peut pas être lue passe après les classés (« Prévision indisponible ») sans
  en cacher aucun ; si aucune ne peut l’être, la liste garde l’ordre « Ciel le
  plus sombre » et dit « Prévisions indisponibles. ». Hors ligne, le tri est
  désactivé (« Hors ligne. ») et les suggestions gardées d’une recherche
  précédente gardent leurs temps de trajet.

## D’où ils viennent, confidentialité et licence

La source par défaut est un **extrait mondial OpenStreetMap local**, construit
à partir d’un Planet daté. Les recherches et les références connues
ne consultent pas Overpass. Une base absente répond 503 `places_unavailable`,
raison `source`, sans repli implicite. Le mode `ASTRO_PORTAL_PLACES=overpass`
reste disponible explicitement (30 s par tentative, un réessai du miroir par défaut).

Le constructeur garde les quatre catégories nommées, aux centroïdes des géométries,
avec trous et passage de la ligne de changement de date. Bortle ≤ 7 est estimé
par le même module/raster que le service ; les valeurs inconnues sont comptées
et exclues. Le constructeur refuse un raster **non propagé** (son manifeste n’a pas
de `propagation`) : sans la lueur des villes il lit zéro lumière en montagne, et
toute une région sortirait au bas de l’échelle, tous les lieux pareils (Bortle 1,
22,00). Il déduplique d’abord les mêmes identifiants OSM, puis filtre le ciel,
les noms, et fusionne à ≤ 100 m : point de vue > camping > pique-nique > parc,
puis identifiant OSM dans l’ordre binaire. Les seuils sont configurables. Le nom
suit la langue exacte, la langue générique, puis `name` ; `zh-Hans`/`zh-Hant`
reviennent à `name:zh`, `pt-BR` à `name:pt`.

Le centre est arrondi à 0,05° avant la requête, sans journalisation ni stockage de
la recherche côté service. Une distance sphérique interne vérifie le rayon ;
aucune distance depuis votre position n’est renvoyée. Les tris et trajets restent
sur votre appareil. Les caches web (`localStorage`) et mobile restent sur cet
appareil au plus 30 jours, survivent à un redémarrage, et respectent langue,
catégories, rayon et centre arrondi. Hors ligne, la date de lecture s’affiche ;
sans résultat gardé, le besoin d’une connexion est expliqué. Sans prévision fraîche,
« Meilleur cette nuit » reste dégradé comme auparavant.

Chaque écran suggéré affiche **© OpenStreetMap contributors (ODbL)**, lien vers
[la licence officielle](https://www.openstreetmap.org/copyright). L’objet API reste
identique. Les vraies données ne sont ni commitées ni embarquées dans les clients.
La base filtrée est une base dérivée **ODbL 1.0** : le service offre sa copie entière,
gratuitement et sans compte, à **`GET /api/v1/places/extract`** ; l’en-tête `Link`
des réponses suggérées/connues annonce cette offre. Ce téléchargement ne contient
que les tables publiques de l’extrait et ses métadonnées, jamais la base des
observateurs.

Les [sections 4.2–4.6 de l’ODbL](https://opendatacommons.org/licenses/odbl/1-0/)
imposent attribution, partage à l’identique et offre de la base ou de toutes les
altérations, contenus ajoutés compris. Le script public seul ne suffit pas.
Les estimations de ciel enrichissent la base sans embarquer les cellules du raster :
la notice EOG exacte, année, checksum, le fait que le raster est propagé (la
lueur des villes comprise) et l’adaptation restent dans les métadonnées,
avec [la licence EOG CC BY 4.0](https://eogdata.mines.edu/files/EOG_products_CC_License.pdf).
Les droits sur la base suivent ODbL ; les notices des contenus ajoutés restent
applicables. Aucun World Atlas non commercial, aucun raster privé redistribué.
Ajouter un lieu ne publie jamais votre lieu personnel ou vos plans.

## Le ciel que vous avez mesuré

L’obscurité du ciel d’un lieu est sinon une **estimation**, tirée de données
satellite. Astro Sync peut la mesurer sur vos propres poses, sur votre
ordinateur :

- ouvrez l’écran **Analyse**, choisissez le dossier d’une nuit et appuyez sur
  « Mesurer le fond de ciel », ou lancez `astro-sync sky --folder <nuit>`
  (voir le [dépôt d’Astro Sync](https://github.com/sqound/astro-sync)) ;
- seules les poses **résolues** comptent : une pose doit porter une solution
  astrométrique dans son en-tête (un WCS `TAN`, écrit par un logiciel de
  résolution). Une pose non résolue le dit, « pose non résolue », et ne
  donne rien ; Astro Sync ne résout jamais une pose lui-même ;
- une pose compte quand le ciel est assez sombre pour se comparer au zénith
  que décrit l’estimation : le Soleil à plus de 18° sous l’horizon, la Lune
  couchée, la cible à plus de 40° de hauteur, un filtre large bande (aucun,
  luminance, clair, UV/IR, vert ou V) ;
- le fond est lu dans les pixels, étoiles masquées, et converti en
  mag/arcsec² avec un point zéro mesuré sur la même pose, à partir des
  étoiles d’une liste de référence (Tycho-2, ESA, via le CDS VizieR I/259,
  environ 25 Mo ; Astro Sync la télécharge une fois, quand vous l’acceptez sous
  un texte qui la nomme, et la garde sur votre ordinateur) qui s’y trouvent ; l’offset du capteur vient de l’en-tête, ou d’un dark ou d’un
  bias du même dossier — jamais deviné ;
- la valeur de la nuit est la médiane des poses retenues.

« Envoyer la valeur de la nuit » envoie ensuite **ce seul nombre** — avec le
nombre de poses dont il est la médiane, la version de la méthode et l’heure
médiane — vers votre espace, gratuitement. Les images ne quittent jamais
votre ordinateur. Le service le range sous votre lieu à moins de 500 m des
poses (ou le lieu du plan de la session) et sous la nuit ; une valeur plus
récente pour le même lieu et la même nuit la remplace. Si aucun de vos lieux
n’est à moins de 500 m, rien n’est gardé : ajoutez le lieu, puis envoyez de
nouveau. Les écrans du planificateur n’affichent pas encore la valeur
mesurée.

## Réglages

| Réglage                   | Valeur                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `ASTRO_PORTAL_PLACES`     | Défaut ou `osm-extract` : local ; `overpass` : distant explicite ; `off` : 503, raison `disabled`. |
| `ASTRO_PORTAL_PLACES_DB`  | Chemin absolu hors application de `places-osm.sqlite`.                                             |
| `ASTRO_PORTAL_PLACES_URL` | L’instance Overpass à interroger (par défaut `https://overpass-api.de/api/interpreter`).           |

Un portail auto-hébergé lit l’extrait configuré, choisit explicitement
Overpass, ou désactive les suggestions (voir
[SELF_HOSTING.md](SELF_HOSTING.md)).

## Pour les développeurs

`GET /v1/places/suggested` et `GET /v1/places/known` sont décrites dans
[`packages/astro-contracts/schemas/api/v1.md`](../../packages/astro-contracts/schemas/api/v1.md)
(« Suggested places »), avec leurs schémas `places-suggested.schema.json` et
`place-known.schema.json`. Le code est dans `packages/portal/src/places/` ;
le lien est normalisé par `normalizeKnownPlaceLink` dans
`packages/portal/src/planner/state.js`.

`POST` et `GET /v1/place-sky-measures` (le fond de ciel mesuré) sont décrites
dans le même fichier (« Measured sky background »), avec leur schéma
`place-sky-measure.schema.json` ; le stockage est
`packages/portal/src/persistence/place-sky-measure-repository.js` (table
`place_sky_measures`), la mesure `analysis::sky`, `analysis::photometry` et
`analysis::sky_night` d’`astro-sync-core`.
