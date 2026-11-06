# Modèle de données

Le dossier configuré par `ASTRO_PORTAL_METADATA_DIR` contient des fichiers JSON.
Un fichier peut décrire une seule cible ou contenir `{ "targets": [...] }`.
L’éditeur conserve cette organisation lorsqu’il modifie une fiche existante.

## Association des images

Le scanner regroupe les extensions partageant le même nom de base. Une fiche
revendique ensuite les fichiers avec :

- `assetBaseNames` : liste de noms sans extension ;
- `assetPaths` : chemins relatifs sans extension, utiles en cas de noms
  identiques dans plusieurs dossiers ;
- `matchPatterns` : expressions régulières appliquées aux chemins relatifs.

Une association explicite est préférable. Les images non revendiquées ne sont
pas publiées.

## Champs de cible

| Champ                  | Type    | Description                                    |
| ---------------------- | ------- | ---------------------------------------------- |
| `id`                   | chaîne  | Identifiant URL en minuscules et tirets        |
| `title`                | chaîne  | Titre de la fiche                              |
| `category`             | chaîne  | Ciel profond, Solaire, Planétaire…             |
| `objects`              | chaînes | Identifiants Messier, NGC, IC, noms communs    |
| `tags`                 | chaînes | Filtres proposés dans la galerie               |
| `featuredBaseName`     | chaîne  | Image de la carte de galerie                   |
| `referenceBaseName`    | chaîne  | Référence initiale de la fiche                 |
| `hiddenBaseNames`      | chaînes | Fichiers scannés à ne jamais afficher          |
| `skyTarget`            | objet   | `type` et `constellation`                      |
| `acquisition`          | objet   | Couples libellé/valeur affichés                |
| `processing`           | objet   | `profile`, `pipeline`, `tools`, etc.           |
| `description`          | chaînes | Paragraphes de contexte                        |
| `technicalDescription` | chaînes | Paragraphes techniques                         |
| `integrations`         | objets  | Lignes du tableau par filtre                   |
| `assetMetadata`        | objets  | Surcharges par image                           |
| `progressions`         | objets  | Description des paliers                        |
| `moonObservationDates` | dates   | Dates servant au calcul lunaire                |
| `stellarium`           | objet   | Cible, champ et note du lien Web               |
| `skyMap`               | objet   | Fichier de carte du ciel                       |
| `plateSolveHints`      | objet   | Indices optionnels de résolution               |
| `skyQuality`           | objet   | Estimation Bortle/SQM précalculée, facultative |

## Métadonnées par image

Chaque entrée `assetMetadata` identifie `baseName` et peut surcharger les champs
inférés :

```json
{
  "baseName": "2026-01-15_M42_20x120s_presentation",
  "assetLabel": "Rendu naturel — courbe de présentation",
  "variant": "Rendu naturel — courbe de présentation",
  "renderFamily": "Rendu naturel",
  "colorCurve": "de présentation",
  "kind": "presentation",
  "date": "2026-01-15",
  "integration": "20 × 120 s",
  "totalSeconds": 2400,
  "acquisition": { "Filtre": "Dual-band" },
  "sky": {
    "ra": 83.822,
    "dec": -5.391,
    "fieldWidth": 2.4,
    "fieldHeight": 1.5,
    "scale": 3.2,
    "orientation": 0
  }
}
```

Les coordonnées `ra` et `dec` sont en degrés. Les champs sont en degrés,
l’échelle en secondes d’arc par pixel et l’orientation en degrés.

## Qualité du ciel précalculée

`skyQuality` est une métadonnée structurée et non localisée. Elle peut être
placée sur une cible ou dans une entrée `assetMetadata` :

```json
{
  "bortleClass": 4,
  "sqm": 20.72,
  "source": "lightpollutionmap",
  "method": "viirs-modeled-zenith-sky-brightness",
  "estimated": true,
  "calculatedAt": "2026-01-01T00:00:00.000Z"
}
```

Une installation privée peut garder une surcharge sans coordonnées,
`sky-quality.json`, à côté du catalogue : des estimations SQM et Bortle
modélisées, indexées par cible et nom de base, avec leur provenance. Les fiches
du catalogue lisent cette surcharge localement sans appeler de fournisseur.
L’outil qui la construit à partir d’une couche WMS ne fait pas partie de ce
dépôt. Séparément, le planificateur peut demander une estimation du lieu via
`/api/planner-sky-quality` : le serveur y répond depuis le raster de qualité du
ciel installé (docs/SKY_QUALITY_RASTER.md), n’envoie rien à un fournisseur
extérieur, arrondit le lieu à trois décimales pour son cache et ne renvoie
aucune coordonnée. Les entrées sans coordonnées
fiables sont omises, sans estimation inventée. Dans les deux cas, il
s’agit d’un guide modélisé, pas d’une mesure SQM effectuée sur place.

## Intégration

```json
{
  "filter": "Dual-band",
  "frames": 20,
  "seconds": 120,
  "totalSeconds": 2400
}
```

`totalSeconds` permet de représenter un total corrigé si toutes les poses n’ont
pas exactement la même durée. Sinon il peut être égal à `frames × seconds`.

## Progression

Une étape se trouve généralement sous `images/progression/<cible>/` et reçoit
une entrée dans `progressions` :

```json
{
  "baseName": "M42_progression_10x120s_natural",
  "progressionLabel": "Palier 2",
  "progressionPeriod": "15 janvier 2026, 21:00 → 21:20",
  "progressionFilter": "Dual-band",
  "renderFamily": "Rendu naturel",
  "colorCurve": "brute",
  "integration": "10 × 120 s",
  "totalSeconds": 1200,
  "date": "2026-01-15"
}
```

Le fichier complet [examples/catalog/m42-demo.json](../../examples/catalog/m42-demo.json)
sert de référence exécutable.

## Bibliothèque locale de ciel profond

La bibliothèque OpenNGC/Barnard du planificateur est distincte du catalogue
public des prises de vue décrit plus haut. Son JSON d’exécution privé et ses
trois manifestes d’images initialisent une table SQLite partagée appelée
`target_catalogue_entries` ; une fois la première synchronisation effectuée,
le portail lit cette table structurée. Chaque ligne contient l’identifiant
source stable, la désignation, les alias, noms communs, type, constellation,
RA/Dec J2000, taille apparente, magnitude, brillance de surface, références de
catalogue et le JSON source original.

Chaque cible conserve aussi deux indicateurs calculés indépendamment :
`visible_from_northern_hemisphere` et
`visible_from_southern_hemisphere`. Ils décrivent une couverture pratique et
large, non pas l’horizon d’un lieu précis. Un indicateur est activé quand la
cible culmine à au moins 30° depuis une latitude de référence de 30° Nord ou
Sud. Les déclinaisons de −30° à +30° sont donc visibles depuis les deux
hémisphères ; au-delà, seule la valeur correspondant à l’hémisphère concerné
reste activée. Les indicateurs sont recalculés si la déclinaison est modifiée.

Le filtre saisonnier facultatif du catalogue est une aide à la découverte
construite à partir de l’ascension droite, non une promesse de visibilité pour
un lieu précis. Il sélectionne les cibles qui culminent généralement en début
de nuit pendant la saison astronomique locale choisie. Son association
saison/ascension droite est inversée pour l’hémisphère Sud ; le planificateur
reste le calcul de référence pour une date et un lieu exacts.

`target_media` conserve les trois variantes média indépendamment, avec une
ligne par variante `dss`, `premium` et `visual`. Chaque ligne garde le nom
local du fichier et, si nécessaire, source, crédit, licence et URL de source ;
les octets image restent dans les dossiers privés d’exécution.
`target_collections` et `target_collection_memberships` portent les deux
sélections éditoriales, disjointes (`essential`, `extended` : une cible est dans
l’une au plus), et les modes dans lesquels une cible d’une sélection est
proposée (`mode-visual`, `mode-photo` ; une cible d’une sélection dans aucun
des deux est lue comme les deux). Les lignes compactes lisent les modes dans les
appartenances (`selection_modes`, leurs bits) ; ils n’ont pas de colonne à eux.
Les colonnes historiques `dss_image_json`, `premium_image_json`,
`visual_image_json`, `is_best` et `is_extended` restent un miroir de
compatibilité. `target_catalogue_relation_state` note, outre la normalisation,
la version des sélections par défaut qu’une instance a prise
(`target-selection-<version>`). `editorial_json` est réservé à un contenu éditorial localisé
additionnel. `overrides_json` conserve les changements administrateur des
valeurs catalogue et média lorsqu’une synchronisation ultérieure actualise la
fiche source stockée.

Le profil facultatif `editorial_json.catalogueResearch` est la couche éditoriale
documentée des cibles sélectionnées. L’anglais est sa langue source ; les
paragraphes français et japonais traduisent les mêmes faits structurés et les
mêmes affirmations étayées par les sources, sans recherche documentaire
indépendante par langue. Il contient les paragraphes localisés, les noms
communs, le contexte historique des catalogues, les mesures angulaires, une
estimation de distance explicitement signalée lorsqu’elle peut être dérivée
d’une vitesse radiale publiée, ainsi que des liens de référence. Il n’invente
jamais une date de découverte individuelle ou une distance physique si la
source sélectionnée ne les établit pas. Un profil modifié localement est
conservé lors d’une nouvelle synchronisation OpenNGC.

Pour les 500 cibles étendues, `editorial_json.observingGuide` peut surcharger
une aide d’observation calculée : une plage de focale indicative et une
ouverture visuelle minimale de 50 à 400 mm sous ciel sombre. Tant qu’aucune
surcharge n’est enregistrée, le portail les dérive de la taille apparente, de
la magnitude intégrée, de la brillance de surface et de la classe d’objet. La
focale reste volontairement un repère large dépendant du capteur ; le
planificateur calcule toujours le champ réel et l’adéquation visuelle avec le
matériel choisi.

### Planificateur et rapprochement des prises de vue

Au moment de la planification, `/api/planner-targets` classe chaque entrée de
ciel profond stockée localement selon la latitude de l’observateur, le seuil de
hauteur, le type d’objet, la magnitude, la taille apparente, la sélection
éditoriale et les médias disponibles. L’API n’envoie au navigateur qu’une
projection localisée et bornée des meilleures candidates (720 au maximum), sur
laquelle sont calculées la visibilité à l’heure près et la programmation. Cette
borne maintient l’interactivité du planificateur ; elle ne limite pas la
bibliothèque prise en compte par le serveur. Le catalogue complet reste
consultable par son endpoint de recherche.

Ce même classement est offert aux applications appairées sur l’endpoint public
du catalogue, sous la forme `GET /v1/targets?sort=planner`, avec les paramètres
facultatifs `latitude` et `minimumAltitude`. Sans `sort`, cet endpoint est
inchangé et trie toujours par désignation, ce qu’attend un index de catalogue ;
avec lui, l’unique page bornée devient la page qui mérite d’être planifiée
plutôt que les premières désignations de l’alphabet. La latitude ne sert qu’au
score : les clients l’envoient donc grossièrement — arrondie au degré — au
lieu de placer une position précise dans une chaîne de requête.

Les compteurs du résultat de l’endpoint de catalogue — `counts.best` /
`counts.extended` (la liste déroulante de sélection éditoriale),
`catalogueOptions[].count` et `typeOptions[].count` — sont des **facettes** :
chacun est calculé sur les cibles qui correspondent à tous les _autres_
filtres actifs, en ignorant le filtre propre à ce compteur. Choisir
`selection=best` laisse donc `counts.extended` inchangé, et choisir un
`catalogue` laisse chaque `typeOptions[].count` inchangé — sans quoi les
compteurs d’une liste déroulante à sélection unique appliqueraient
silencieusement deux fois le même filtre, comme c’était le cas auparavant :
`selection=best` faisait alors s’effondrer `counts.total` / `.best` /
`.extended` sur le même nombre, déjà restreint à « best ». `countsUnfiltered`
et le champ `total` de chaque option sont les compagnons additifs et non
filtrés (le `n` d’un affichage « `x`/`n` » dès qu’un filtre est actif) : les
mêmes compteurs sans aucun filtre, constants pour une révision de catalogue
donnée. Les clients lisent ces facettes pour leurs compteurs de listes
déroulantes et de résumé ; un client antérieur à leur introduction retombe sur
le nombre unique que portait déjà le champ correspondant.

`GET /v1/target-index` expose le même catalogue, avec les mêmes filtres, les
mêmes tris et les mêmes refus, dans une notation colonnaire compacte : les noms
de colonnes une seule fois dans `fields`, chaque cible sous forme de tableau
positionnel dans `rows`, les types d’objet et les constellations en
dictionnaires `[clé, libellé]` que les lignes référencent par indice. Une cible
présentée en entier pèse environ 7 ko — fiche de connaissance, guide
d’observation, crédits d’image — contre 270 octets pour une ligne compacte : la
limite de page passe donc à 1000 au lieu des 96 de la vue complète, et une
seule requête contient tout le vivier de planification au lieu d’un fragment de
48 cibles. `include=extended` ajoute en outre, après la page, toutes les cibles
éditoriales « étendues » du même ensemble classé — la forme même du vivier du
planificateur web. La réponse porte un `ETag` fort et honore `If-None-Match`, et
`revision` identifie l’import de catalogue dont proviennent les lignes, ce qui
permet à un lecteur parcourant tout l’index page par page de détecter un import
survenu en cours de route. Un portail antérieur à cette route répond `404` et le
client se rabat sur `GET /v1/targets`.

Les prises de vue rapprochent leur fiche locale par identifiant stable,
désignation, alias, noms communs, titre affiché ou source Stellarium imbriquée.
Une prise de vue qui correspond ainsi à une cible utilise les mêmes textes
éditoriaux localisés, faits, sources et métadonnées d’image que le catalogue et
le planificateur. Les prises de vue solaires ou d’éclipse sans équivalent dans
le ciel profond restent valides comme fiches propres aux captures.

### Cibles préférées privées

`user_target_favorite_modes` contient un `user_id`, un `target_id` partagé, un
`favorite_mode` (`photo` ou `visual`) et sa date de création. Cette table ne
fait partie ni des exports d’initialisation ni du catalogue partagé ; elle est
volontairement rattachée à la personne plutôt qu’au tenant de l’observatoire.
Un utilisateur authentifié ne peut donc consulter ou modifier que ses propres
préférées photo et visuel, même lorsque plusieurs utilisateurs appartiennent
au même tenant.

## Documents d’initialisation versionnables

`static_data_documents` est la table générique des documents d’initialisation
éditables aux formes diverses. Chaque ligne garde le contenu source, le contenu
actif de l’instance, la version de schéma et la révision source.
`static_data_exports` archive le manifeste d’un paquet généré. Cela couvre la
taxonomie, les textes localisés de référence des catalogues, les valeurs par
défaut du planificateur et les autres données de domaine qui doivent voyager
vers une nouvelle instance, sans mélanger code applicatif et état privé de
l’utilisateur.

Voir [Paquet de données d’initialisation](STATIC_DATA.md) pour la structure du
paquet et son cycle export/import.

## Inventaire privé du matériel

Le JSON du catalogue public des prises de vue reste canonique pour les cibles,
les médias et leurs métadonnées éditoriales. Une migration SQLite privée crée à côté un inventaire
de matériel durable, isolé par `tenant_id`. Elle ne déplace, ne copie et ne
réécrit ni les images/FITS/TIFF ni le JSON du catalogue.

Chaque fiche matériel possède un UUID, `tenant_id`, un type (`telescope`,
`guide-scope`, `camera`, `eyepiece`, `lens`, `filter`, `mount` ou
`controller`), un nom affiché, éventuellement fabricant/modèle/notes, ainsi
que des documents extensibles `specifications_json` et `planner_json`. Le
formulaire d’administration expose les valeurs utiles selon le type : ouverture
et focale d’un télescope, dimensions de capteur d’une caméra, multiplicateur
d’une optique et bande passante d’un filtre.

`capture_equipment` associe une ou plusieurs fiches privées à l’identifiant
d’une cible du catalogue et à un rôle : `main` ou `guiding`. C’est une
surcouche, et non une clé étrangère vers le JSON. Le catalogue public dérive
exclusivement ses lignes de matériel de ces associations : le matériel
principal fournit les lignes télescope, caméra, monture, filtre, contrôle et
optique ; le guidage fournit sa ligne dédiée. La projection publique ne contient
que les noms affichés sélectionnés et un résumé technique limité. Elle n’expose
jamais les notes privées, identifiants d’inventaire ni réglages du
planificateur. Le planificateur authentifié lit le même inventaire. Lorsque
l’authentification privée est active, le mode invité n’expose volontairement
que des champs personnalisés et jamais l’inventaire privé.

Le schéma s’en tient aux UUID/textes/UTC/JSON et relations ordinaires : son API
de dépôt pourra donc migrer vers PostgreSQL sans changer les fichiers du
catalogue.

## Captures : visibilité et les deux vérifications

Une capture (`captures`) est **privée** par défaut (`visibility`) : visible
dans son espace et dans la galerie privée de l’espace. Son propriétaire peut
la rendre **publique** (`public`) : elle apparaît alors aussi dans la galerie
publique, sauf si elle en a été retirée ou si l’administration l’a refusée. Chaque
capture porte deux vérifications :

| Colonne                                                                   | Sens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto_check`, `auto_check_reason`, `auto_check_at`                        | La vérification automatique : `NULL` tant qu’elle n’a pas tourné, puis `sky` (le ciel ou un paysage), `undetermined` (une personne — raison `person_detected` —, un dark, un flat, une pose nuageuse, ni un ciel ni un paysage…) ou `other` (image peinte : vérification non passée) ; une raison technique et l’heure. Le propriétaire ne lit la raison qu’en ses propres mots (`automaticReason`).                                                                                   |
| `admin_check`, `admin_check_at`, `admin_check_reason`, `admin_check_note` | L’indicateur de l’administration : `NULL` tant que l’administration n’a pas regardé, puis `approved` ou `refused`, avec l’heure, une raison (`not_sky`, `offensive`, `identifiable`, `other`) et une note libre.                                                                                                                                                                                                                                                                       |
| `review_requested_at`                                                     | Quand le propriétaire a demandé la vérification d’une capture `undetermined`.                                                                                                                                                                                                                                                                                                                                                                                                          |
| `protection_notice_at`, `protection_lifted_at`                            | L’avis donné sur une capture privée qui n’a pas passé la vérification (`other`), et quand sa protection privée a été levée : le propriétaire a accepté la vérification, ou le délai de l’avis est passé (`ASTRO_PORTAL_CHECK_NOTICE_DAYS`, 14 jours). Le service ne supprime jamais une capture de lui-même.                                                                                                                                                                           |
| `removed_from_gallery_at`                                                 | Quand des signalements ont retiré de la galerie publique une capture publique pas encore vérifiée ; effacé quand l’administration la valide.                                                                                                                                                                                                                                                                                                                                           |
| `made_public_at`                                                          | Quand la capture est devenue publique pour la dernière fois (« Publique depuis le … ») : écrit quand elle passe de privée à publique (le « Publique » du propriétaire, le « Valider » de l’administration sur une vérification demandée), effacé quand elle redevient privée, laissé tel quel par une écriture qui la garde publique. `NULL` pour une capture privée, et pour une capture déjà publique à l’ajout de la colonne (migration 91) : la date est inconnue, jamais devinée. |

Ce que le propriétaire voit et peut faire à partir de ces colonnes (l’état de
la capture, si « Publique » est permis et sinon pourquoi, la ligne de
l’administration, la date de levée de la protection) est une seule règle pure, écrite
en JavaScript (`packages/portal/src/captures/capture-state.js`).
L’administration l’emporte sur le contrôle
automatique : une capture dont le contrôle n’a pas été
passé peut devenir publique une fois que l’administration l’approuve, un refus de
l’administration reste final, et la règle n’a qu’un interrupteur : sur un
serveur sans équipe (un serveur privé), aucun contrôle ne tourne et toute
capture est enregistrée `sky` : le drapeau de l’administration reste `NULL`,
rien n’est demandé, refusé ni montré d’un contrôle, et le propriétaire rend une
capture publique quand il le veut.

La vérification automatique tourne après chaque envoi, une fois par capture,
sur le serveur (`packages/portal/src/captures/capture-processing.js` ; les
captures restées sans résultat sont reprises au démarrage, chaque heure et
quand leur propriétaire les liste). La règle en vigueur (`sky-check-3`,
`packages/portal/src/sky-check/rule.js`) a quatre résultats : le ciel ou un
paysage (`sky`, publiable aussitôt), une personne (enregistrée `undetermined`
avec la raison `person_detected`) et ni un ciel ni un paysage
(`undetermined`) — les deux attendent l’administration —, et l’image peinte
(`other`). Les personnes sont trouvées par un petit détecteur d’objets qui
tourne sur le serveur lui-même (YOLOX-nano, Apache-2.0, sur la version
WebAssembly d’ONNX Runtime). Un résultat `other` est enregistré et compté pour
l’administrateur, aucun avis n’est donné, et son propriétaire le lit comme
`undetermined` (`packages/portal/src/captures/sky-check-verdict.js`). Après un
changement de règle, `POST /api/admin/captures/recheck` rejoue la vérification
sur chaque image — sur un déploiement de test seulement
(`ASTRO_PORTAL_ENVIRONMENT` vaut `staging`, `development` ou `test`, et
l’adresse publique n’est pas celle d’une production), ou avec
`ASTRO_PORTAL_ALLOW_SKY_CHECK_RECHECK=1`. Un hôte de production est un hôte
nommé `…-prod…` ou `…production…`, ou listé dans
`ASTRO_PORTAL_PRODUCTION_HOSTS` (des noms d’hôte séparés par des virgules ou
des espaces ; `*.example.org` désigne tous les sous-domaines d’un domaine). Un
serveur dont la copie de test partage ses réglages avec la production y liste
ses hôtes de production.

**Fichiers dérivés.** À côté de chaque original, sous le dossier de son
espace, `<captures>/<espace>/derived/<sha256>/` contient les fichiers que le
service en dérive, jamais comptés dans le stockage de l’espace :
`thumbnail.webp` (orientée, 768 px au plus, sans métadonnées ; un FITS dont
les pixels sont lus en a une aussi) et `shared.jpg`, la **copie partagée** —
le seul fichier que servent la galerie publique et une galerie privée : JPEG,
8 bits, sRGB, sans EXIF, XMP ni IPTC, 4096 px au plus sur son grand côté. La
copie partagée est écrite au premier besoin (la capture rendue publique, ou
montrée pour la première fois dans une galerie privée) ; seule une image
matricielle qui n’est pas un fichier brut d’appareil peut en avoir une.
L’original n’est jamais modifié. Supprimer une capture, ou son espace,
supprime ses fichiers dérivés.

**Les tags propres du propriétaire.** `capture_tags` garde les tags que le
propriétaire donne à une capture dans « Mon espace » → « Captures » :
`capture_id`, `tenant_id` et `tag`, texte libre gardé tel que saisi (seuls
les espaces qui l’entourent sont retirés), 40 caractères au plus, unique par
capture ; 20 tags au plus par capture. Ils ne sont montrés que dans la galerie
privée, à côté des tags génériques tirés du type d’objet de la cible ; la
galerie publique ne lit jamais cette table. Supprimer une capture, ou son
espace, supprime ses tags.

Les anciennes publications (un titre, une visibilité et une liste de
captures) sont retirées : leurs deux tables sont supprimées, rien n’a été
converti.

## La galerie privée d’un espace

Chaque espace (`organizations`) a une galerie privée :

- `portal_token` : son adresse, aléatoire (18 octets aléatoires en
  base64url), créée à sa première lecture, unique, jamais choisie par le
  propriétaire ; une nouvelle la remplace à la demande, et l’ancienne cesse
  aussitôt de fonctionner.
- `portal_mode` : qui peut la voir — `none` (partagée avec personne, par
  défaut) ou `link` (toute personne qui a l’adresse). Un serveur qui ouvre
  des espaces peut enregistrer une troisième valeur, la sienne (la colonne
  accepte `invited`) ; un serveur privé, qui n’a qu’un compte, n’en écrit
  jamais.
- `public_name` (60 caractères au plus) signe les captures publiques de
  l’espace ; `portal_name` (80 au plus) est le titre de la galerie. Tous deux
  facultatifs, gardés tels que saisis. `public_name_refused_at` et
  `portal_name_refused_at` : quand l’administration a refusé ce nom (il est alors
  vidé) ; effacés quand le propriétaire en enregistre un autre.
- `hide_default_equipment` : si le matériel tenu par l’administration est
  masqué pour l’espace. `equipment.scope` distingue ce matériel (`default`)
  de celui de l’espace (`private`).

`portal_access` est la liste d’accès du troisième mode d’un serveur qui ouvre
des espaces : une ligne par espace et par adresse normalisée. La table reste
dans le schéma, vide et inutilisée, sur un serveur privé (pas de migration
destructive) ; ses lignes sont écrites par le service hébergé seul.

## Messages des galeries privées, et tables d’une équipe

- `portal_mail_budget` : les messages des galeries privées, comptés dans un
  budget à eux (une heure, un type et `space_key`, une empreinte de l’espace
  pour sa limite par heure ; aucune adresse ; purgés après un jour).

Un service doté d’une équipe qui lit les captures (le service hébergé) garde
dans des tables à lui les signalements de ses visiteurs, les avertissements et
les blocages de ses personnes, son dictionnaire de mots interdits dans les noms
et le journal des regards portés sur les captures privées. Un serveur privé ne
les lit pas : son propriétaire est la seule personne à voir une capture et
décide seul de ce qui est public.
