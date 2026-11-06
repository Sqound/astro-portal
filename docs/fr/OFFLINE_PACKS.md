# Packs hors ligne

Une application cliente peut fonctionner entièrement hors ligne : un appareil
télécharge une fois un **pack hors ligne** — l'index compact du catalogue, un
raster de pollution lumineuse facultatif, et un fond de ciel photographique
facultatif — puis le planificateur tourne sur cette copie locale, sans aucun
réseau.

Un portail privé open source sert le manifeste et les fichiers contenus dans
ses données statiques, par les routes décrites ci-dessous. Voir
[Ajouter des packs à un portail privé](#ajouter-des-packs-à-un-portail-privé).

Tout ce document est lu depuis l'implémentation : la route du manifeste
(`packages/portal-app/src/routes/api/v1/offline-pack/route.js`,
`packages/portal-app/src/lib/offline-pack.server.js`), les constructeurs de
composants (`packages/portal/src/offline-pack/manifest.js`, `target-index.js`,
`sky-quality.js`, `sky-backdrop.js`, `target-texts.js`), les routes de fichiers
de qualité du ciel
(`packages/portal-app/src/routes/api/v1/offline-pack/sky-quality/[file]/route.js`),
les routes et le miroir de tuiles du ciel (`packages/portal/src/sky-tiles/`) et
le contrat JSON Schema
(`packages/astro-contracts/schemas/api/offline-pack.schema.json`). La référence
formelle requête/réponse pour chaque route citée ici — y compris les codes de
refus que ce document ne répète pas — est
[`packages/astro-contracts/schemas/api/v1.md`](../../packages/astro-contracts/schemas/api/v1.md#offline-pack-manifest).

## Le manifeste

`GET /v1/offline-pack` répond un unique document JSON décrivant ce que
**cette** instance de portail peut actuellement servir pour un pack hors
ligne — composants, révisions, tailles et gabarits d'URL — en un aller-retour.
Rien ici n'est personnel à un appareil ou un utilisateur : un invité est servi
exactement comme un compte authentifié.

```json
{
  "v": 1,
  "catalogue": {
    "revision": "…",
    "targets": 14386,
    "locales": ["en", "fr", "ja"]
  },
  "components": [/* target-index, sky-quality, sky-backdrop */]
}
```

- `v` — la version propre de la notation du manifeste (`1` actuellement),
  indépendante du `v` de la notation de l'index de cibles.
- `catalogue.revision` — identique à la `revision` propre de
  `GET /v1/target-index` : un identifiant opaque du catalogue chargé. Un
  lecteur qui parcourt tout l'index page par page la compare entre les pages ;
  un import survenant en cours de parcours la change, si bien que des pages de
  deux révisions différentes ne doivent jamais être recousues ensemble.
- `catalogue.targets` / `catalogue.locales` — le nombre total de lignes du
  catalogue et les langues prises en charge par l'instance : les langues
  livrées du registre des langues (`packages/astro-contracts/src/locales.ts`),
  sauf si la configuration de l'instance les restreint. Le pack contient un
  index du catalogue par langue listée ici (voir
  [Un index par langue](#un-index-par-langue)).
- `components` — un tableau d'unités indépendantes et autonomes. **Un
  composant que le portail ne peut pas servir actuellement (aucun raster de
  pack de pollution lumineuse préparé, miroir de tuiles HiPS désactivé) est
  simplement absent du tableau, jamais présent avec un indicateur
  « indisponible ».** `component.kind` est ouvert : un lecteur se répartit sur
  `id`/`kind` qu'il reconnaît et ignore silencieusement celui qu'il ne
  reconnaît pas, ce qui permet à un nouveau composant de sortir sans nouvelle
  version du client. Un portail antérieur à cette route répond `404` — toute
  la négociation dont un client a besoin.

### Mise en cache

`GET /v1/offline-pack` répond avec un `ETag` fort — le condensé SHA-256 du
manifeste sérialisé, encodé en base64url et tronqué à 27 caractères,
excluant délibérément tout horodatage de génération pour que le document
reste stable quand rien de ce qu'il décrit n'a réellement changé. Renvoyez-le
en `If-None-Match` pour obtenir un `304` sans corps. `Cache-Control: public,
max-age=60`.

Construire le composant `target-index` parcourt chaque page du catalogue
pour la mesurer. Le portail garde chaque composant en mémoire et dans
`<runtime>/offline-pack/manifest-cache.json`, sous ce dont ce composant est
calculé et rien d'autre : l'index du catalogue sous l'empreinte du
catalogue (taille et date de modification de ses fichiers sources, tampon
des documents de données statiques, ligne d'état de la base du catalogue —
lus sans charger le catalogue), le composant de qualité du ciel sous
l'identité et les sommes de contrôle de ses fichiers raster. Le composant
`sky-backdrop` est décrit de nouveau à chaque requête à partir des petits
fichiers d'index du miroir : les tuiles que le miroir récupère pour un
client n'invalident jamais l'index du catalogue. Un processus qui redémarre
sur les mêmes données répond à son premier manifeste sans lire une seule page
du catalogue. Ce fichier est un cache : le supprimer ne coûte qu'un calcul.

Un composant à recalculer (le catalogue a changé) l'est une seule fois, en
arrière-plan, par tranches qui laissent la boucle d'événements libre ; les
requêtes simultanées partagent ce calcul. Une requête l'attend au plus `ASTRO_PORTAL_OFFLINE_PACK_WAIT_MS`
(2000 par défaut), puis reçoit le dernier manifeste connu du portail — son
fond de ciel toujours à jour, seul le composant en cours de calcul tel
qu'il était — avec `Cache-Control: no-cache` et
`X-Offline-Pack-Freshness: stale` (`fresh` sinon). Seul un portail qui n'a
jamais calculé de manifeste répond `503` avec `Retry-After` (la durée du
dernier calcul, de 5 à 120 s) et `offline_pack_preparing`, dans l'enveloppe
d'erreur et en tête du corps. Pour rendre cette réponse rare, un service
demande une fois son manifeste à lui-même une fois prêt, en arrière-plan
(redemandé après chaque `Retry-After`, chaque essai dans le journal, jamais en
développement ; `ASTRO_PORTAL_OFFLINE_PACK_WARMUP=off` le désactive) : le
premier client après un redémarrage le trouve conservé ou déjà en cours de
calcul. Cette demande ne fait pas partie du chauffage d'avant « prêt » : le
premier calcul attend l'import de tous les textes stockés (quelque 350 Mo,
des minutes sur les données de production) et une révision qui l'attendrait
serait abandonnée par la sonde de disponibilité de la plateforme. Un client qui
demande entre-temps reçoit le `503` ci-dessus, jamais un manifeste calculé sur
des textes à moitié importés. Un client lit ce
`503` comme une attente — « le service prépare ses données hors ligne, nouvel
essai dans N s » — et le seul `404` comme « ce service ne propose pas de
données hors ligne ».

## Composants

### `target-index` (`kind: "index-pages"`) — toujours présent

L'index compact du catalogue, parcouru page par page dans l'ordre des
désignations — la notation columnaire propre à `GET /v1/target-index`
(`packages/astro-contracts/schemas/api/target-index.schema.json`), jamais
traduit ligne par ligne.

| Champ                   | Signification                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `revision`              | Identique à `catalogue.revision` et à la `revision` propre d'une page.                  |
| `pageSize`              | `1000` (`targetIndexMaximumPageSize`).                                                  |
| `pages`                 | `ceil(catalogue.targets / pageSize)`.                                                   |
| `estimatedBytes`        | La taille réelle sérialisée de chaque page, sommée — mesurée, jamais typée à la main.   |
| `estimatedEncodedBytes` | Les mêmes pages, gzippées — toujours plus petit, une page columnaire se compresse bien. |
| `urlTemplate`           | Espaces réservés `{locale}`/`{offset}` ; voir plus bas.                                 |
| `sizesByLocale`         | Optionnel : `{ <langue>: { estimatedBytes, estimatedEncodedBytes } }`.                  |
| `knowledge`             | Optionnel : les pages publiées des cibles qui en ont ; voir plus bas.                   |

Le gabarit d'URL de la route en direct est
`/v1/target-index?locale={locale}&sort=designation&limit=1000&offset={offset}`
— un client substitue `{locale}` et `{offset}` (toujours un multiple de
`pageSize`) et parcourt `offset` de `0` jusqu'à `pages * pageSize`, en
fusionnant les lignes de chaque page qui partage la même `revision`.
L'enveloppe propre à une page (`fields`, `rows`, `types`, `constellations`,
`attribution`) est exactement la forme de réponse propre à
`GET /v1/target-index` — voir ce schéma pour la liste des colonnes.

`estimatedBytes` et `estimatedEncodedBytes` mesurent l'index d'une seule
langue : la langue par défaut de l'instance sur un portail en direct.
`sizesByLocale`, la mesure propre à chaque langue, est omis par un portail en
direct plutôt que de parcourir le catalogue une fois par langue à chaque
changement.

**`knowledge`** (optionnel, absent quand aucune cible n'a de page publiée — les
longs textes du catalogue) accompagne l'index, pour que la fiche de ces
cibles garde ses sections et ses sources hors ligne :
`{ urlTemplate, count, estimatedBytes, estimatedEncodedBytes }`. Un fichier JSON
par langue à `urlTemplate` (`{locale}` ; portail en direct
`/v1/offline-pack/target-knowledge/{locale}`), `{ v, locale, count, targets:
{ <targetId>: knowledge } }`, chaque `knowledge` étant la réponse de
`GET /v1/targets/{targetId}` pour cette cible dans cette langue. Les tailles
sont celles du fichier de la langue par défaut. Un client qui ne connaît pas
le champ l'ignore. Les pages sont peu
nombreuses (niveau A : quelques centaines de cibles au plus) : elles sont donc
incluses quelles que soient les options du pack.

Le fichier de base porte le chapeau de chaque cible (et les pages qu'un
portail envoie encore entières) ; les pages complètes de tous les niveaux
viennent avec le composant facultatif
[`target-texts`](#target-texts-kind-text-shards--facultatif).

#### Un index par langue

L'index porte les mots du catalogue dans une langue — les libellés de type et
de constellation de `types`/`constellations`, les noms localisés —, si bien
qu'un pack contient un index par langue de `catalogue.locales`, et qu'un
client en télécharge un : la langue de son interface (l'étiquette du
registre, comme `zh-Hans` ou `pt-BR`, jamais le code de langue nu). Un
client dont la langue n'a pas d'index dans le pack — un pack plus ancien, ou
un service qui ne fabrique pas encore cette langue — télécharge l'index
**anglais** à la place (la même règle que le texte de connaissance d'une
cible, `packages/portal/src/locale-content.js`). Il ne range jamais un index
anglais sous le nom d'une autre langue.

### `target-texts` (`kind: "text-shards"`) — facultatif

« Textes complets du catalogue »: les pages complètes
des cibles, avec leurs sources et le texte pour les enfants, pour un appareil
qui veut les lire sans réseau. Les textes d'une langue pèsent environ quarante
mégaoctets (`docs/STATIC_DATA.md`, niveaux B et C) : les données de base ne les
incluent donc jamais. Un client les demande séparément, dans sa propre langue.
Un portail qui ne liste pas le composant n'offre pas ce téléchargement.

| Champ         | Sens                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `required`    | Toujours `false`.                                                                                                            |
| `revision`    | Un condensé des révisions des lots de toutes les langues.                                                                    |
| `urlTemplate` | Emplacements `{locale}`/`{shard}` : portail en direct `/v1/offline-pack/target-texts/{locale}/{shard}.json`.                 |
| `locales`     | `{ <locale>: [{ shard, bytes, sha256, revision, count }] }`, l'index des lots du service (`target-texts-index.schema.json`). |

**Ce que liste un portail**. Le composant est construit à partir
des lots réellement présents dans le dossier `target-library/texts/` du paquet
de données statiques (`docs/STATIC_DATA.md`), par
`packages/portal/src/offline-pack/target-texts.js` et
`packages/portal-app/src/lib/target-texts-pack.server.js` :

- les langues sont les **locales livrées du registre des locales**
  (`astro-contracts/locales`), dans son ordre, jamais une liste écrite dans le
  code ; une langue que l'index contient et que le registre ne livre pas n'est
  pas listée, et une langue que le registre livre sans que l'index ait de lot
  pour elle ne l'est pas non plus ;
- un lot est listé avec les `bytes`, `sha256`, `revision` et `count` de
  l'`index.json` du dossier, **si son fichier est là avec la taille que dit
  l'index** ; un fichier absent ou tronqué (une copie en cours) est écarté, et
  le composant avec lui quand plus aucun lot d'aucune langue ne reste. Pas de
  dossier, pas d'index, un index qui n'en est pas un : le composant est
  simplement absent du manifeste, jamais une erreur (la règle de tout composant
  facultatif) ;
- `revision` est un condensé des révisions et des condensés des lots listés
  (16 chiffres hexadécimaux) : elle change dès qu'un lot listé change ;
- ce qui est gardé entre deux requêtes est l'identité de l'index et la date de
  modification du dossier de chaque langue (quelques `stat`, aucune lecture de
  l'index ni d'un lot), revue toutes les 30 s quoi qu'elles disent.

`GET /v1/offline-pack/target-texts/{locale}/{shard}.json` sert un lot listé
comme les autres fichiers du pack : accès invité, `ETag: "sha256-<hex>"` (le
condensé que dit le manifeste et que vérifie un client), `304` sur
`If-None-Match`, une plage d'octets honorée (`206`/`416`), `Cache-Control:
no-transform` (`packFileResponse`). Du chemin, seuls une locale livrée et trois
chiffres sont pris, et le fichier est celui que l'index nomme pour ce couple ;
tout le reste, un lot que l'index ne liste pas ou dont le fichier n'est pas là
avec la bonne taille, est le `404` v1 `offline_pack_target_texts_not_found`.

Par l'hôte de téléchargement (`ASTRO_PORTAL_DOWNLOAD_ORIGIN`), les lots — environ
quarante mégaoctets par langue — sont le plus lourd des téléchargements : le
manifeste donne donc `urlTemplate` en adresse absolue sur cet hôte, avec la
`revision` du composant dans la requête (`…/target-texts/{locale}/{shard}.json?rev=…`) :
un texte qui change est une nouvelle révision, donc une nouvelle adresse, et un
lot en cache n'est jamais périmé.

Un client télécharge les lots de sa propre langue seulement (une langue que le
composant ne liste pas est « non proposée », jamais remplacée par une autre).
Chaque lot est `target-texts-shard.schema.json` — `{ v, locale, shard,
revision, entries }`, les `entries` étant `{ id, revision, tier, lede, page?,
children? }` — et il est vérifié contre son `sha256` et ses `bytes`. Un lot dont
la `revision` est déjà détenue n'a pas besoin d'être retéléchargé. `story` et
`storyParagraphs` ne sont pas stockés dans un lot : ils se déduisent des
sections à la lecture (`docs/STATIC_DATA.md`).

### `sky-quality` (`kind: "file-set"`) — présent seulement si un raster de pack existe

La dérivation téléchargeable, grossière (6′), du raster de pollution
lumineuse installé et utilisé par l'estimation Bortle/SQM du planificateur —
voir [SKY_QUALITY_RASTER.md](SKY_QUALITY_RASTER.md) pour la préparation du
composite source. Absent quand il n'existe ni raster source installé, ni
raster de pack déjà dérivé sur disque.

| Champ            | Signification                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `revision`       | `sha256:<hex>` des octets propres du raster — recalculé contre le fichier réel, jamais une liste figée. |
| `estimatedBytes` | La taille réelle en octets du raster (3 600 × 1 800 = 6 480 000 o à 6′).                                |
| `files`          | Deux entrées, `manifest.json` et `raster.bin` (voir plus bas).                                          |
| `attribution`    | Le `manifest.json.attribution` propre du raster de pack, ou `null`.                                     |
| `license`        | Le `manifest.json.license` propre du raster de pack, ou `null`.                                         |
| `year`           | Le `manifest.json.year` propre du raster de pack, ou `null`.                                            |

Les deux fichiers sont servis par
`GET /v1/offline-pack/sky-quality/manifest.json` et `.../raster.bin`
(`packages/portal-app/src/routes/api/v1/offline-pack/sky-quality/[file]/route.js`, une liste blanche
stricte de exactement ces deux noms) :

- `manifest.json` — `ETag: "sha256-<hex>"` (les octets propres du fichier),
  `304` sur un `If-None-Match` correspondant.
- `raster.bin` — `ETag: "sha256-<hex>"`, tiré du champ `checksum` propre du
  manifeste du pack (repli sur un hachage des octets à la volée seulement si
  ce champ est absent). Servi en identité par défaut ; quand le client envoie
  `Accept-Encoding: gzip`, un `raster.bin.gz` précalculé à côté est servi à la
  place avec `Content-Encoding: gzip` et le **même** `ETag` (le condensé est
  toujours celui des octets non compressés, si bien qu'un client peut
  vérifier l'intégrité après décodage quel que soit l'encodage reçu) ;
  `Vary: Accept-Encoding` est toujours présent.

### `sky-backdrop` (`kind: "hips-tiles"`) — présent sauf si le miroir de tuiles est désactivé

Le fond de ciel photographique du ciel entier, miroité depuis un relevé HiPS
(DSS2 colour par défaut) en paliers de qualité cumulatifs — voir
[SKY_TILES_MIRROR.md](SKY_TILES_MIRROR.md) pour le miroir lui-même.
`ASTRO_PORTAL_SKY_TILE_MIRROR=off` retire entièrement ce composant (le levier
pour une instance qui n'a pas encore tranché la question de la redistribution
du relevé — voir
[Licences et attributions](#licences-et-attributions)).

| Champ                  | Signification                                                                                                                                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `survey`               | `{ id, hipsId, format, tileWidth, maxOrder, frame, attribution, license, licenseUrl, imageryCopyright, upstreamRoot, upstreamRoots }`.                                                                                                                                             |
| `meanTileBytes`        | Conservé pour un lecteur antérieur à `meanTileBytesByOrder` : la moyenne pondérée par le nombre de tuiles sur les seuls ordres du palier le plus bas (0..3).                                                                                                                       |
| `meanTileBytesByOrder` | Octets/tuile moyens par ordre HEALPix (la taille d'une tuile croît avec l'ordre) ; observé depuis les récupérations réelles du miroir une fois qu'il y en a assez, les constantes documentées (`dssColourMeanTileBytesByOrder`, `packages/portal/src/sky-tiles/surveys.js`) sinon. |
| `archiveChunkDelta`    | `4` — une archive à l'ordre `N ≥ archiveChunkDelta` agrège chaque tuile sous une cellule ancêtre `archiveChunkDelta` ordres plus haut.                                                                                                                                             |
| `archiveUrlTemplate`   | Espaces réservés `{survey}`/`{order}`/`{chunkOrder}`/`{chunkPix}` — l'unité qu'un appareil télécharge réellement.                                                                                                                                                                  |
| `tileUrlTemplate`      | Espaces réservés `{survey}`/`{order}`/`{dir}`/`{pix}`/`{format}` — une tuile miroitée isolée, utilisée en dehors des paliers téléchargés (déplacement sur la carte en direct).                                                                                                     |
| `tiers`                | Quatre niveaux cumulatifs, voir plus bas.                                                                                                                                                                                                                                          |
| `topUp`                | `{ maxOrderWide, maxOrderFocus, estimatedBytes }` — le complément fin autour des plans, des favoris et du catalogue étendu (ordres 7–8), estimé, non dérivé d'une formule.                                                                                                         |
| `lowOrderArchive`      | `{ order, chunkOrder, chunkPix, tiles }` — l'adresse propre de l'archive fixe des ordres 0..`archiveChunkDelta - 1` (voir plus bas).                                                                                                                                               |
| `prepareUrlTemplate`   | Paramètre `{tier}` — où un client demande au portail de construire lui-même les archives manquantes d'un palier, et lit son avancement (voir plus bas). Absent d'un pack statique.                                                                                                 |

#### Paliers (cumulatifs, jamais additifs)

| Palier      | `maxOrder` | Archives | Tuiles |
| ----------- | ---------: | -------: | -----: |
| `essential` |          3 |        1 |  1 020 |
| `standard`  |          4 |       13 |  4 092 |
| `comfort`   |          5 |       61 | 16 380 |
| `quality`   |          6 |      253 | 65 532 |

(`archiveCumulativeCount`, `packages/portal/src/sky-tiles/surveys.js` —
décomptes exacts, pas des estimations.)

`tiles` est le décompte cumulatif HEALPix exact (Σ 12·4^k pour k =
0..maxOrder) ; `estimatedBytes` correspond à ce nombre de tuiles à
`meanTileBytesByOrder`, plus le vrai surcoût d'archive tar que paie
réellement le nombre d'archives impliquées (`skyBackdropTiers`,
`packages/portal/src/sky-tiles/surveys.js`) — **sauf** si `state` vaut
`"ready"` (chaque archive dont le palier a besoin existe déjà dans le cache
disque du miroir), auquel cas `estimatedBytes` est remplacé par la taille
combinée _exacte_ de ces fichiers réels et `exactBytes: true` est ajouté.
`state` est demandé au miroir à chaque construction du manifeste
(`mirror.tierState`, `packages/portal/src/sky-tiles/mirror.js`) — jamais
déclaré à l'avance de ce qui est réellement sur disque, et y répondre ne
touche jamais le réseau, seulement l'index d'archives local du miroir.

Chaque palier indique aussi `archives: { ready, total }` (additif) :
combien des archives dont il est composé le miroir possède déjà, et combien
il en faut — comptées depuis ce même index, donc exactes à chaque requête, et
`state` vaut `ready` exactement quand `ready` égale `total`. Un miroir vide ne
construit une archive que lorsqu'un client la demande, environ une minute
chacune : un client qui veut un palier entier demande donc au portail de le
préparer (`POST` sur `prepareUrlTemplate` avec l'`id` du palier) et lit la
même route pour afficher « 12 parties prêtes sur 61 » ; voir
[SKY_TILES_MIRROR.md](SKY_TILES_MIRROR.md#préparer-un-palier-en-tâche-de-fond)
et [la référence de l'API](../../packages/astro-contracts/schemas/api/v1.md#sky-backdrop-preparation).
Le manifeste lui-même est mis en cache une minute : l'avancement se lit sur
cette route, pas dans le manifeste.

Un palier que le portail ne peut pas fournir — pas encore construit, et trop
gros pour la limite de taille du miroir, la règle même du `409`
`sky_backdrop_tier_exceeds_mirror_limit` (voir
[SKY_TILES_MIRROR.md](SKY_TILES_MIRROR.md#préparer-un-palier-en-tâche-de-fond))
— le dit d'avance par `unavailable: true` (additif, toujours `true`, jamais sur
un palier `ready`) : un client ne le propose donc pas pour le découvrir à la
requête.

#### Adressage des unités

Un appareil télécharge des **archives**, jamais des tuiles individuelles : un
`.tar` par unité, extrait localement. Les ordres `0` à `archiveChunkDelta - 1`
(`0..3` par défaut) sont assez petits — 1 020 tuiles, le palier `essential`
en entier — pour tenir dans une unique archive fixe plutôt qu'une par ordre ;
`lowOrderArchive` nomme son adresse exacte `(order, chunkOrder, chunkPix)`
afin qu'un lecteur n'ait pas à la traiter comme un cas particulier en dehors
des espaces réservés généraux d'`archiveUrlTemplate` (un lecteur antérieur à
ce champ retombe sur la convention documentée : `order = chunkOrder =
archiveChunkDelta - 1`, `chunkPix = 0`). À partir de l'ordre
`archiveChunkDelta`, une archive agrège chaque tuile de cet ordre sous une
cellule ancêtre `archiveChunkDelta` ordres plus haut (`4^4 = 256` tuiles par
archive) — voir `tierArchiveAddresses` dans
`packages/portal/src/sky-tiles/geometry.js`.

`GET /v1/sky-tiles/{survey}/Norder{n}/Dir{d}/Npix{p}.{jpg|png}` (une tuile),
`.../Norder{n}/Chunk{c}/{pix}.tar` (une archive) et `.../{survey}/properties`
(le fichier properties HiPS du relevé) sont les trois routes vers lesquelles
résout cet adressage sur un portail en direct — voir
[SKY_TILES_MIRROR.md](SKY_TILES_MIRROR.md#routes). Chaque réponse binaire y
porte un `ETag: "sha256-<hex>"` fort ; une tuile ou une archive est servie
avec `Cache-Control: public, max-age=31536000, immutable` (adressée par son
propre chemin, elle n'a donc jamais besoin d'être revalidée), `properties`
tous les 30 jours à la place.

### `solve-catalogue` (`kind: "file-set"`) — facultatif

Un catalogue d’étoiles profond : les étoiles de HYG v4.1 jusqu’à la magnitude
8,5, tout le ciel, dans un seul fichier binaire (`stars.bin`, environ 0,75 Mo).
`required: false` ; `revision` et le `checksum` du fichier sont des empreintes
des octets ; `attribution` et `license` créditent le catalogue (David Nash,
astronexus.com, CC BY-SA 4.0). Un portail le liste, et sert
`GET /v1/offline-pack/solve-catalogue/stars.bin` (ETag = le SHA-256 des
octets, `Range` honoré), quand `<données statiques>/solve-catalogue/stars.bin`
est installé. HYG v4.1 est sous CC BY-SA 4.0 : le fichier converti est une
adaptation sous la même licence.

### `camera-catalogue` (`kind: "file-set"`) — facultatif, à la demande

Le catalogue d’étoiles de la résolution d’une caméra de télescope (caméra de
guidage derrière une lunette de 120 à 240 mm, CAM-3) : Tycho-2 (VizieR I/259)
et son premier supplément jusqu’à V 11,5, tout le ciel, environ 1,5 million
d’étoiles dans un fichier binaire par zones (`stars.bin`, `PSTZ`, environ
12 Mo ; bandes de déclinaison de 2° coupées en cases de largeur voisine, pour
que le téléphone lise le cône autour de la position de la monture et jamais le
fichier entier). `required: false`, jamais dans le socle : la personne le
demande dans Réglages › Données hors ligne. `source` porte la provenance
(catalogue, adresse et date du téléchargement, SHA-256 de chaque fichier
source). Licence : CC BY-NC 3.0 IGO, autorisation commerciale demandée à l’ESA
le 04/11/2026. Génération et envoi : `docs/STATIC_DATA.md`.

### `read-aloud` (`kind: "audio-units"`) — facultatif, à la demande

« Lecture à voix haute » : les paragraphes des fiches, les introductions et la
soirée guidée, dits une fois par une voix neuronale à la génération
(« Voix de synthèse neuronale HD »), un `.m4a` (HE-AAC 32 kbit/s mono) par
paragraphe, une « unité ». `required: false`, jamais dans le socle, absent tant
que rien n’est déposé. `locales` donne, par langue : la voix (`voice`,
`voiceVersion`), sa `source`, son `attribution` et sa `license`, les totaux
`{ fiches, units, bytes }` des trois niveaux emboîtés (`essential` ⊂
`extended` ⊂ `complete` : Essentiel ⊂ Étendu ⊂ Complet) et l’adresse et le
condensé du **manifeste de langue**, qui liste les fiches de chaque niveau et
leurs unités `{ id, bytes, sha256, cues }` (`cues` : le début de chaque phrase,
en ms) ; il pèse des centaines de kilo-octets par langue, donc il n’est pas
répété dans `GET /v1/offline-pack` : l’appareil le lit quand la personne demande
un niveau. Une unité est `urlTemplate` avec `{locale}`, `{voice}` (la
`voiceVersion`) et `{unit}` (son identifiant). L’identifiant d’une unité est un
condensé du texte, de la langue, de la voix et de la version : un appareil qui
calcule les mêmes identifiants retrouve ses unités sans table, ne télécharge que
celles qui lui manquent et reprend unité par unité.

Servi par `GET /v1/offline-pack/read-aloud/{locale}/{voice}/manifest.json` et
`GET /v1/offline-pack/read-aloud/{locale}/{voice}/u/{id}.m4a` (`{voice}` est la
`voiceVersion`) : accès invité ; `ETag` = SHA-256 des octets, `Range` honoré,
`no-transform`, et une unité est `immutable` (son adresse porte le condensé de
son contenu). L’identifiant est en liste blanche (`[0-9a-f]{32}`) et le
manifeste de langue doit le lister : tout le reste est `404`. Contrat
(arborescence, identifiants, manifeste, ordre de dépôt) :
[STATIC_DATA.md § The spoken reading](../STATIC_DATA.md#the-spoken-reading-read-aloud).

## Téléchargements reprenables

Les routes de fichiers de ce portail — `sky-quality/{manifest.json,raster.bin}`
et chaque tuile, archive et fichier `properties` de `sky-tiles` — honorent une
plage d'octets : `206` avec `Content-Range` et `Accept-Ranges: bytes`, ou
`416` avec `Content-Range: bytes */<taille>` pour une plage qui commence après
la fin, de sorte qu'un client peut reprendre un téléchargement interrompu avec
`Range: bytes=<terminé>-` et vérifier le condensé de ce qu'il reçoit au fil du
flux. Une plage désigne toujours les octets **non compressés** que décrit le
manifeste, et un `206` n'est jamais encodé ; seule une réponse au fichier
entier peut être en gzip (le `.gz` précalculé du raster). Chaque réponse de
fichier porte `Cache-Control: no-transform`, ce qui empêche la compression de
Next — et tout mandataire — de réencoder des octets dont le manifeste donne
déjà la taille et le condensé. Les pages de l'index compact
(`GET /v1/target-index`) restent compressibles et sans plage : elles sont
petites et téléchargées en entier.

Un serveur de fichiers statiques qui ignore `Range` reste donc correct,
seulement moins efficace lors d'une reprise.

## Licences et attributions

Chaque composant porte une licence de données différente — n'en supposez
jamais une valable pour un autre :

- **`target-index`** — ce que dit l'`attribution` propre du catalogue chargé
  (`library.source`/`library.license`/`library.url`, transmise sans
  changement depuis l'enveloppe propre de `GET /v1/target-index`). Pour la
  graine par défaut du paquet de données statiques, voir les sources
  répertoriées pour la bibliothèque de cibles elle-même ; n'incluez que des
  données de catalogue que votre propre installation a le droit de
  redistribuer.
- **`sky-quality`** — dérivé de VIIRS Nighttime Lights (Earth Observation
  Group, Payne Institute for Public Policy, Colorado School of Mines),
  **Creative Commons Attribution 4.0 International**. La licence propre
  d'EOG exige une mention d'attribution précise sur chaque produit dérivé —
  voir [SKY_QUALITY_RASTER.md § Attribution](SKY_QUALITY_RASTER.md#attribution)
  pour la formulation exacte, celle que porte le champ `attribution` propre
  du composant. La CC BY 4.0 autorise la redistribution avec attribution : ce
  composant peut sans problème figurer dans un pack distribué publiquement,
  tant que cette attribution l'accompagne.
- **`sky-backdrop`** — le tuilage HiPS lui-même est en **ODbL-1.0** ;
  l'imagerie DSS dont sont extraites les tuiles reste sous son propre
  copyright (Caltech, AAO, SERC/PPARC, AURA) et n'est **pas** du domaine
  public. Voir [SKY_TILES_MIRROR.md § Licences](SKY_TILES_MIRROR.md#licences) :
  miroiter des tuiles pour un usage personnel ou en petit groupe est une
  chose, redistribuer une copie empaquetée de l'imagerie au public en est une
  autre, à laquelle ce document ne répond pas à la place d'un opérateur.
  **N'incluez pas ce composant dans un pack que vous distribuez au-delà de
  votre propre usage sans votre propre accord avec le STScI/CDS couvrant
  cette redistribution.** Une instance qui ne sert jamais que les appareils
  de l'opérateur lui-même est un cas matériellement différent de la
  publication d'un pack téléchargeable pour des inconnus.

## Ajouter des packs à un portail privé

Pointez `ASTRO_PORTAL_STATIC_DATA_DIR` vers votre paquet de données statiques
([STATIC_DATA.md](STATIC_DATA.md)). Sa valeur par défaut est
`<runtime>/../static-data`, soit `/data/static-data` dans l'image
auto-hébergée. Montez ou copiez vos données sous licence dans ce dossier ;
aucun service distant n'est nécessaire.

- `target-library/catalogue.json` : un catalogue exporté valide fournit les
  pages `target-index`. Chaque langue et page annoncée est servie par
  `GET /api/v1/target-index`.
- `sky-quality/pack/manifest.json` et `raster.bin` : fournissent le composant
  raster grossier. Une source `sky-quality/{manifest.json,raster.bin}` peut
  aussi être installée ; le portail en dérive le raster du pack à la demande.
  Sans l'un ni l'autre raster, le composant est absent.
- Le fond de ciel utilise le miroir de tuiles séparé et son cache existant
  (`ASTRO_PORTAL_SKY_TILE_MIRROR_DIR`, [SKY_TILES_MIRROR.md](SKY_TILES_MIRROR.md)).
  `ASTRO_PORTAL_SKY_TILE_MIRROR=off` retire `sky-backdrop` du manifeste.
  Sinon, les archives manquantes sont construites à la demande ; une
  démonstration refuse le `POST` de préparation comme toute autre écriture.

Lisez `GET /api/v1/offline-pack` pour voir ce que cette instance propose
réellement. Les chemins du manifeste utilisent le raccourci `/v1/…` de la
documentation API : résolvez-les sous `/api/v1/…`, en conservant les paramètres
et en remplaçant chaque variable. Cela comprend toutes les pages d'index et
les fichiers manifeste et raster de qualité du ciel. Les mêmes lectures
restent disponibles avec `ASTRO_PORTAL_DEMO=1`.

Conservez les [licences et attributions](#licences-et-attribution) de chaque
composant ; installer des données n'accorde aucun droit de redistribution.
