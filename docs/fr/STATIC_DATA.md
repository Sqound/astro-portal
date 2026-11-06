# Paquet de données d’initialisation

## But

Le code de l’application est public et immuable à chaque release. Les données
de domaine et référentiels vivent dans un paquet d’initialisation privé et
versionnable. Une instance importe ce paquet dans SQLite, sert et édite les
tables obtenues, puis exporte explicitement son état courant vers des JSON. Le
paquet exporté peut initialiser une seconde instance sans copier son fichier
SQLite.

Le dossier par défaut est voisin, mais distinct, de l’état d’exécution privé :

```text
<racine-privée>/static-data/
├── manifest.json
├── sky-quality/
│   ├── manifest.json
│   └── raster.bin
├── documents/
│   ├── reference-taxonomy.json
│   ├── target-catalogue-descriptions.json
│   ├── target-common-names.json
│   ├── caldwell-crossreferences.json
│   ├── planner-curated-targets.json
│   ├── planner-equipment-presets.json
│   └── planner-planets.json
└── target-library/
    └── catalogue.json
```

Définissez `ASTRO_PORTAL_STATIC_DATA_DIR` pour utiliser un autre emplacement.
Versionnez ce dossier dans un dépôt Git **privé** ou un autre système de
sauvegarde. Il ne fait pas partie du dépôt public de l’application.

## Tables de l’instance

`static_data_documents` enregistre chaque document d’initialisation hors média.
Elle conserve à la fois le contenu source importé et le contenu de l’instance,
ce qui permet de détecter une modification locale avant export.
`static_data_exports` archive les manifestes de paquet.

La bibliothèque de cibles possède une ligne structurée par objet dans
`target_catalogue_entries`. Les métadonnées image sont normalisées dans
`target_media`, avec une ligne par variante `dss`, `premium` ou `visual`. Les
sélections sont de vraies collections dans `target_collections` et
`target_collection_memberships` : **Essentielles** (`essential`) et
**Étendues** (`extended`) sont deux listes disjointes — une cible est dans l’une
au plus, les Étendues complètent les Essentielles — et deux autres collections,
`mode-visual` et `mode-photo`, portent les modes dans lesquels une cible d’une
sélection est proposée (TARGET-SELECTIONS-TAGS-01). Les colonnes JSON
historiques restent un miroir de compatibilité durant la migration (`is_best`,
`is_extended` ; les modes n’ont pas de colonne), mais les lectures et écritures
hydratent les tables relationnelles média et collections. La graine porte
`modes` (`["visual", "photo"]`, ou une partie, dans cet ordre) à côté de
`isBest` et `isExtended`.

La graine de cibles contient aussi les deux indicateurs calculés de couverture
par hémisphère pour chaque objet. Ils sont dérivés de la déclinaison avec la
règle commune de culmination à 30° et sont recalculés par l’instance si les
coordonnées changent.

### Les sélections par défaut : `target-selection.json`

Le contenu par défaut des deux sélections est un fichier de données,
`packages/astro-core/sky-data/target-selection.json` (la liste validée
le 03/11/2026) : une entrée par cible,
`{ id, designation, tier, modes }`, `tier` valant `essential` ou `extended` et
`modes` une partie de `visual`, `photo`.
`scripts/generate-target-selection-table.mjs` en tire
`packages/astro-core/src/target-selection-table.ts` (à relancer après une
modification ; `--check` dit si la table est celle du fichier), que la curation
(`packages/portal-app/src/lib/target-library-curation.js`) lit : une cible est
trouvée par son identifiant, sinon par sa désignation ; aucun score ne complète
une sélection. Les effectifs sont ceux du fichier (212 Essentielles et 234
Étendues dans sa première version) ; les titres ne portent pas de chiffre.

Une cible entre dans les **Essentielles** (collection `essential`, `isBest`) si
elle est spectaculaire avec un petit instrument **et** observable chaque année
depuis un site de latitude moyenne ; les **Étendues** (`extended`,
`isExtended`) portent les cibles qui valent d’être proposées au-delà. Les deux
listes sont disjointes. Chaque objet Messier sauf M102 (qui répétait M101) et
chaque objet Caldwell est dans l’une d’elles. Une cible est étiquetée `visual`
quand elle est à portée d’un télescope de 200 mm sous un bon ciel, `photo`
quand c’est un sujet pour un appareil (pas trop petite pour une courte focale,
un objet plutôt qu’une étoile double ou un astérisme) ; une cible d’une
sélection sans mode est lue comme les deux. Les planètes sont en visuel
seulement : **Mars, Jupiter, Saturne et Vénus** dans les Essentielles,
**Mercure, Uranus et Neptune** dans les Étendues ; la **Lune** est une
Essentielle dans les deux modes. Les corps du Système solaire n’ont pas de
coordonnées fixes, ce dont une sélection n’a pas besoin. **Le Soleil n’y entre
jamais** : l’observer demande un filtre dédié et certifié, et une sélection que
voit tout nouvel utilisateur ne doit pas suggérer de pointer un instrument vers
lui. Pluton reste dehors. Une cible que les sélections quittent reste dans le
catalogue (« Toutes »).

Comment les modes sont lus : le bassin des suggestions est l’union des deux
sélections, réduite aux cibles du mode du profil (visuel : `visual` ou les
deux ; photo : `photo` ou les deux) ; un catalogue coché dans les filtres de
suggestion est ce catalogue en entier, quels que soient les modes.
`target-library-query` et `target-index` prennent un `mode` qui garde, de la
`selection` demandée, les cibles de ce mode et compte chaque liste dans ce mode ;
`target-index` porte une colonne `modes` (1 visuel, 2 photo, 3 les deux, 0
hors sélection).

Une instance garde ses propres appartenances, modifiées dans l’Administration.
Une fois par version du fichier (`version`, notée dans
`target_catalogue_relation_state` sous `target-selection-<version>`), une
instance qui contient déjà le catalogue prend les sélections et les modes du
fichier pour chaque cible partagée, modification antérieure comprise ; une base
sans cible note seulement la version, et son premier import garde les
indicateurs de la source (ceux d’une graine) et cure les cibles qui n’en ont
pas.

### Corrections des fiches sources : `target-corrections.json`

`packages/astro-core/sky-data/target-corrections.json` liste les champs d’une
fiche source qui sont faux dans les sources et ce qu’ils deviennent (un type,
une magnitude, un nom commun, une position) : IC 1318 (la région de γ Cygni,
typée comme l’étoile), NGC 2244, IC 2118, NGC 3190, NGC 2372, NGC 6885,
NGC 7235 (typées « Ciel profond »), le nom « Flame Nebula » passé d’IC 434 à
NGC 2024, les magnitudes de NGC 253 (7,6) et de NGC 4945 (9,3), et M102, qui
avait la position et l’alias de M101 : elle prend la position de NGC 5866
(15 h 06 min 29 s, +55° 45′ 48″) et reste une entrée à part, hors des
sélections. Elles s’appliquent à chaque fiche source que le catalogue importe
(`scripts/import-opengc-target-library.mjs` et chaque graine), via la même table
générée ; une modification d’un champ par l’administrateur l’emporte toujours.

### Descriptions des catalogues

La description de chaque catalogue dans la feuille « Catalogue »
(`catalogueOptions[].description`) se replie **par catalogue et par langue**,
jamais par document : le document enregistré `target-catalogue-descriptions`
dans la langue du lecteur, puis le texte du code dans cette langue
(`packages/astro-core/src/target-catalogues.ts`, et `locale-names-more.ts` pour
zh-Hans, zh-Hant et ru), puis l’anglais du document, puis l’anglais du code. Un
catalogue sans aucun texte a une description vide et pas de sous-titre ; il n’y
a plus de phrase générique. Un document enregistré avant l’arrivée d’un
catalogue ne masque donc jamais les textes du code pour lui.

Les cibles des sélections peuvent aussi contenir, dans leur JSON éditorial, des
profils `catalogueResearch` liés à des sources. L’anglais est la langue source
de chaque profil ; le français et le japonais traduisent les mêmes faits et
références structurés. Écrivez-les dans le JSON éditorial du paquet, que
`npm run export:static-data` exporte ; l’outil qui prépare une base
documentaire prudente à partir du catalogue local ne fait pas partie de ce
dépôt.

Une cible peut porter à la place une **page publiée** (niveau A) :
un long texte dans chaque langue livrée, découpé en sections avec intertitres,
avec ses sources et une note sur leurs licences. Les pages sont écrites hors du
paquet (un fichier Markdown par cible et par langue, un tableau de faits, un
registre des cibles terminées) et chargées dans le paquet par un chargeur, qui
remplace le texte des seules cibles terminées et laisse toutes les autres
telles quelles. Il refuse une cible à qui il manque une page dans une langue
livrée ou dont un texte énonce un nombre absent du tableau de faits, et peut
être relancé à mesure que d'autres cibles sont terminées. Les pages de tous les
niveaux vont dans les lots de `target-library/texts/` (un dossier par langue,
`<locale>/<shard>.json`, et `index.json`), avec le texte pour les enfants quand
une langue en a un, et le service les sert depuis sa table `target_texts`.
Pour une cible du niveau A dont les entrées sont écrites dans toutes les
langues, le chargeur **retire la page publiée de la graine**
(`target-library/catalogue.json` et, pour les corps du Système solaire,
`documents/solar-system-targets.json` avec sa ligne de `manifest.json`) ; une
cible refusée, ou que l'exécution n'a pas prise, garde la page que la graine
sert encore. Une instance qui détient déjà le catalogue la voit partir à sa
prochaine synchronisation et lit la page dans les lots. Envoyez les lots
d'abord, puis `index.json`, puis le `catalogue.json` allégé. Les pages des
niveaux A et B voyagent dans le pack hors ligne (`docs/OFFLINE_PACKS.md`,
`knowledge` du composant `target-index`), et tous les niveaux dans son composant
facultatif `target-texts`.

Ni les octets image ni les images elles-mêmes ne sont stockés dans SQLite ou
dans le paquet. Le paquet conserve le nom de fichier, la source, le crédit et
la licence. Copiez les dossiers privés d’images référencés avec lui lorsque
vous initialisez une nouvelle installation.

## Cycle de vie

1. Une nouvelle instance lit le paquet à son premier besoin d’un jeu de
   données et l’importe dans ses tables. Sans paquet, les valeurs par défaut du
   code et la source OpenNGC historique du runtime constituent le premier seed.
2. L’administration modifie les tables de l’instance. Les cibles sont prises
   en compte immédiatement ; les préréglages du planificateur, la taxonomie et
   les textes de référence sont fournis au planificateur ou au catalogue à la
   prochaine requête de page.
3. Dans **Administration → Initialisation**, choisissez **Exporter le paquet
   d’initialisation** après une modification importante. Cette action écrit les
   documents, le seed complet des cibles et `manifest.json`, atomiquement par
   fichier.
4. Commitez ou sauvegardez le paquet privé, puis copiez-le avec les dossiers
   média référencés vers une autre installation. Ne copiez jamais mots de
   passe, sessions, plans, inventaire matériel ou la base SQLite source.

L’export non interactif équivalent est :

```bash
ASTRO_PORTAL_DATABASE_PATH=/prive/portal.sqlite \
ASTRO_PORTAL_RUNTIME_DIR=/prive/runtime \
ASTRO_PORTAL_STATIC_DATA_DIR=/prive/static-data \
npm run export:static-data
```

## Ce qui y appartient

`sky-quality/` fait exception à la règle « données de domaine éditables »
ci-dessous : il est généré, non édité, et c'est le seul binaire ici. Il
contient le raster VIIRS de pollution lumineuse auto-hébergé dont est
échantillonnée l'estimation Bortle/SQM du planificateur, construit hors ligne
par `packages/portal/scripts/prepare-sky-quality-raster.mjs`. Voir
[SKY_QUALITY_RASTER.md](SKY_QUALITY_RASTER.md) pour l'obtention du composite
source, la préparation du raster, et ce que l'estimation modélise ou non. Une
installation sans ce raster répond l'état d'indisponibilité déjà prévu par les
points d'entrée de qualité du ciel ; rien d'autre n'est dégradé.

`sky-quality/pack/` est une dérivation séparée et facultative du même raster,
à une résolution plus grossière de 6′ (3 600 × 1 800 = 6 480 000 octets),
dimensionnée pour un pack hors ligne plutôt que pour une requête
d'échantillonnage en direct. C'est ce que le composant `sky-quality`
de `GET /v1/offline-pack` vérifie avant de s'annoncer, et ce que servent les
routes `GET /v1/offline-pack/sky-quality/{manifest.json,raster.bin}` ; une
installation sans cette dérivation omet simplement ce composant, exactement
comme l'absence de `sky-quality/` lui-même omet l'estimation en direct. Voir
[OFFLINE_PACKS.md](OFFLINE_PACKS.md) pour le format du manifeste du pack hors
ligne.

Le paquet contient les données astronomiques éditables : taxonomie et libellés
localisés, descriptions de catalogues, noms communs localisés, références
Caldwell, sélection par défaut de cibles du planificateur, préréglages matériel
invité, fiches de présentation des planètes et bibliothèque de cibles complète.
Les formules, règles de protocole, contrôles de sécurité, code de service des
images et traductions d’interface restent dans le code ou leur configuration
dédiée : leur modification exige une revue et une release.
