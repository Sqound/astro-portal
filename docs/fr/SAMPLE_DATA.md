# Jeu d’exemple

Un Astro Portal peut être rempli avec un vrai jeu de démonstration : quelques
nuits d’observation faites avec un petit télescope, avec leur journal de terrain,
leur débriefing, leurs analyses, leurs captures, leur matériel, leurs plans et
leurs cadrages, pour que la galerie, le journal et le débriefing montrent quelque
chose. Le lieu des prises de vue n’est
volontairement pas celui des prises de vue (voir
[Ce que l’anonymisation laisse](#ce-que-lanonymisation-laisse)).

- **Licence** : [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/deed.fr)
  (CC BY 4.0), pour les enregistrements comme pour les images. Le code du dépôt est
  sous AGPL-3.0 ; une licence de logiciel ne convient pas à des images et à des
  journaux.
- **Attribution** : « PlanAstro » (le produit, jamais le nom d’une
  personne).
- Outils : `scripts/sample-data/export.mjs`, `verify.mjs` et `install.mjs`
  (scripts npm `sample:export`, `sample:verify`, `sample:install`). ESM, sans
  dépendance autre que celles du dépôt.

Le jeu ne contient que **ce que le portail déclare et sert lui-même** : des
enregistrements de base de données et des images traitées (JPEG ou PNG). Il ne
contient aucun fichier FITS ni aucun journal brut d’un logiciel d’acquisition.

## Avec l’installeur en une commande

`sh deploy/install.sh` propose cette étape par défaut après la première connexion
du propriétaire ; `--no-sample` la saute, et `--yes` affiche la commande à lancer
plus tard. Tant que `sample/` et le paquet ne sont pas publiés, une ligne indique
leur absence et l’étape réussit. Depuis le dépôt, une fois le compte créé :

```bash
docker compose --env-file "$HOME/astro-portal-data/portal.env" exec -T portal node deploy/install-sample.mjs
```

L’auxiliaire lance `node scripts/sample-data/install.mjs --yes` dans le conteneur,
avec son URL de base, `/data/images` et `/data/runtime/captures`. Il ne demande
pas npm dans l’image distroless. Les règles existantes restent appliquées :
propriétaire actif, espace vide, tout ou rien, taille et SHA-256 vérifiés.
Remplacez le dossier par défaut par celui que vous avez choisi.

## Les deux artefacts

L’outil produit deux choses, qui vivent à des endroits différents :

1. **Les enregistrements** : de petits fichiers JSON, versionnés dans le dépôt de
   code sous `sample/`, relus à la main avant chaque commit. Aucune image dedans.
2. **Le pack d’images** : `astro-portal-sample-images-v<N>.tar.gz` (ustar + gzip),
   avec un `manifest.json` à côté, sous `build/sample-data/` (ignoré par git).
   C’est le site qui le publie, pas le dépôt.

Les enregistrements désignent les images par leur chemin relatif dans le pack.

```text
sample/                                 (dans le dépôt)
  manifest.json                         format, licence, comptages, SHA-256 de chaque fichier
  LICENSE                               CC BY 4.0
  README.md                             ce que c’est, comment l’installer, que le lieu est imprécis
  records/
    equipment.json  known_locations.json  planner_contexts.json
    framings.json  plans.json  plan_items.json  plan_framings.json
    observation_sessions.json  session_events.json  session_supplements.json
    session_analyses.json  captures.json  capture_targets.json  capture_equipment.json
    target_media.json
    images.json                         quelle capture est quel fichier du pack

build/sample-data/                      (hors git ; publié par le site)
  astro-portal-sample-images-v1.tar.gz  les images : astro-portal-sample/session-NN/image-NNNN.jpg|png
  manifest.json                         { format, version, url, sizeBytes, sha256, license, attribution, files }
```

Les enregistrements ne portent **aucune organisation, aucun utilisateur, aucune
appartenance** : le jeu n’a ni compte ni espace à lui. Leurs colonnes `tenant_id`
et `created_by_user_id` contiennent deux identifiants fixes de substitution que
`install` remplace par l’espace et le propriétaire du portail dans lequel il
installe.

`target_media` ne contient que des enregistrements (jamais de fichiers), et
seulement pour les licences que l’export a été autorisé à garder (aucune par
défaut) : les images du catalogue viennent de relevés qui ne sont pas sous
CC BY.

## Installer

```bash
npm run sample:install -- --database <fichier sqlite | url postgres> --images-dir <dossier des images du portail>
```

Ce que la commande fait, dans cet ordre :

1. Vérifie les enregistrements de `sample/` (mêmes règles que `verify`) ; des
   enregistrements abîmés arrêtent tout.
2. Regarde la cible **sans rien écrire** : trouve l’espace du propriétaire du
   portail, vérifie que le portail ne contient encore aucune donnée.
3. Sans `--pack` : lit le manifeste du pack d’images (par défaut
   `https://www.planastro.space/samples/astro-portal-sample/latest.json`),
   **affiche la version, la taille et la somme SHA-256 et vous demande
   confirmation** (`--yes` supprime la question ; sans terminal et sans `--yes`,
   elle refuse).
4. Télécharge l’archive et **vérifie sa taille et sa somme SHA-256 avant
   d’extraire quoi que ce soit**.
5. Extrait avec le lecteur tar strict de l’outil (refuse tout chemin qui sort du
   dossier, les liens, les périphériques, et tout fichier que les enregistrements
   ne listent pas ou dont les octets diffèrent de leur enregistrement), dans
   `--images-dir`.
6. Inscrit les enregistrements dans **une seule transaction**, dans l’espace du
   propriétaire, et copie chaque image dans le stockage des captures du cœur
   (`--captures-dir` ; par défaut celui du portail, `ASTRO_PORTAL_CAPTURES_DIR`).

Tout ou rien : un échec à n’importe quelle étape ne laisse ni enregistrement, ni
image, ni dossier temporaire. `--records-only` inscrit les enregistrements sans
les images (tests et développement) et le dit.

### Le portail doit d’abord être amorcé

Un portail privé est l’espace d’une seule personne, créé à la première connexion.
Le jeu va **dans cet espace** : le portail doit donc être amorcé (il a son
propriétaire) avant `install` :

- L’installeur détecte le propriétaire tout seul ; il n’y a aucune option pour
  désigner un espace.
- **Il ne crée jamais de compte.** Un compte d’exemple fermerait l’amorçage d’un
  portail qui n’est pas encore amorcé. Sur un portail sans propriétaire actif
  (pas encore de base, pas encore de propriétaire, ou propriétaire désactivé),
  `install` refuse **avant de télécharger ou d’écrire quoi que ce soit** et le
  dit : _This portal is not set up yet … Set the portal up first (create the
  owner's account: open the portal and sign in for the first time), then run this
  command again. Nothing was installed._ (le message est en anglais : créez le
  compte du propriétaire en ouvrant le portail et en vous connectant une première
  fois, puis relancez la commande).
- Un portail qui contient plusieurs espaces est refusé (le jeu est fait pour un
  portail privé d’une seule personne).
- Un portail qui contient déjà des données (sessions, matériel, captures,
  plans, …) est refusé : le jeu ne va que dans un espace vide.
- Les enregistrements sont ceux du propriétaire : les plans et les cadrages sont
  marqués comme créés par lui. Rien d’autre ne change dans son compte.

### Options

| Option                 | Sens                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `--database <cible>`   | Le fichier SQLite ou l’URL `postgres://` du portail (jamais affichée).                                                      |
| `--images-dir <dir>`   | Où le pack est extrait (le dossier d’images du portail, `ASTRO_PORTAL_IMAGES_DIR`). Obligatoire sauf avec `--records-only`. |
| `--pack <archive>`     | Une archive locale au lieu du site. Le `manifest.json` à côté, s’il y en a un, doit correspondre.                           |
| `--manifest-url <url>` | Un autre manifeste que celui par défaut. `https` seulement (`http` simple seulement pour cette machine).                    |
| `--yes`                | Supprime la confirmation du téléchargement.                                                                                 |
| `--records-only`       | Les enregistrements sans les images.                                                                                        |
| `--captures-dir <dir>` | Stockage des captures du cœur (par défaut celui du portail).                                                                |
| `--records-dir <dir>`  | Enregistrements à installer (par défaut `sample/`).                                                                         |

Code de retour 0 quand c’est installé, 1 quand c’est refusé ou échoué (rien
d’écrit), 2 pour une erreur d’usage. La version du pack que le manifeste propose
doit être celle que les enregistrements demandent (`packVersion`).

## Visibilité, vérifications, publications

- **La visibilité voyage.** Une capture garde sa `visibility` (`private` ou
  `public`) : publique dans le portail source, elle l’est une fois installée.
  Ses deux vérifications ne voyagent pas : le propriétaire d’un serveur privé
  en est l’administrateur.
- **Plus de publications.** Les publications des versions précédentes ont
  quitté le portail et l’outil ; une capture publique est la seule chose
  qu’une galerie montre.

## Prérequis du vrai jeu : les images sont les captures de sessions

Le pack d’images ne contient que des images qui sont **des captures d’une
session** — ce que le portail déclare et sert pour une session. Les images qui ne
sont que des fichiers de l’ancienne galerie, ou des médias du catalogue, n’ont
aucune ligne `captures` et ne font pas partie du jeu. Pour produire le vrai jeu,
les sessions de l’instrument doivent d’abord exister dans un portail, avec leurs
captures : réimportez-les avec Astro Sync dans un portail privé, puis exportez
depuis ce portail.

## Produire un jeu : `export`

```bash
node scripts/sample-data/export.mjs --database <fichier sqlite | url postgres> \
  (--sessions <id,id…> | --equipment "<nom>" [--from <date>] [--to <date>]) \
  --captures-dir <dir> [--images-dir <dir>] \
  --forbid "<un mot>" --forbid "<un autre>" --forbid-near <lat>,<lon>,<km>
```

La source est ouverte **en lecture seule**. Options :

| Option                                   | Sens                                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--sessions <id,…>`                      | Sessions explicites. Exclut les filtres ci-dessous.                                                                                              |
| `--equipment "<nom>"`, `--from`, `--to`  | Sessions qui ont utilisé cet instrument, entre ces dates (`AAAA-MM-JJ`). Les filtres se combinent.                                               |
| `--tenant <id d’espace>`                 | Limite à un espace (la sélection ne doit pas en couvrir plusieurs).                                                                              |
| `--captures-dir`, `--images-dir`         | Dossiers où l’on cherche les octets des captures ; équivalents et répétables. Un fichier est la capture quand son SHA-256 est celui de la ligne. |
| `--forbid <mot>`                         | Un mot qui ne doit apparaître **nulle part** (répétable ; sans casse ni accents ; jamais écrit nulle part). Une occurrence arrête l’export.      |
| `--forbid-near <lat>,<lon>,<km>`         | Refuse toute coordonnée à moins de cette distance du point (jamais stocké).                                                                      |
| `--allow-urls`                           | Lève la règle contre les URL dans les textes libres (celle-là seulement).                                                                        |
| `--allow-media-licence <regex>`          | Garde les enregistrements `target_media` dont la licence correspond (répétable ; aucune par défaut).                                             |
| `--with-session-documents`               | Garde les documents de métriques et d’événements des sessions, en texte (exclus par défaut).                                                     |
| `--records-out`, `--pack-out`            | Par défaut `sample/` et `build/sample-data/`.                                                                                                    |
| `--pack-version <n>`, `--pack-url <url>` | Version du pack (1 par défaut) et adresse écrite dans son manifeste (le site la renseigne).                                                      |
| `--date <AAAA-MM-JJ>`, `--replace`       | Date écrite dans les manifestes ; écrase un jeu existant.                                                                                        |

L’export affiche les lignes par table, le nombre d’images et **les comptes de ce
qu’il a changé ou écarté** (jamais les valeurs), puis lance `verify` sur sa propre
sortie. Le pack doit rester sous 200 Mo.

## Contrôler un jeu : `verify`

```bash
node scripts/sample-data/verify.mjs [<dossier des enregistrements>] [--pack <archive>] \
  [--forbid <mot>]… [--forbid-near <lat>,<lon>,<km>]
```

`verify` est indépendant de la manière dont le jeu a été fait : il rejoue toutes
les règles sur les enregistrements et, avec `--pack`, sur l’archive et les
images. Il affiche un rapport lisible (où et quelle règle, jamais la valeur) et
rend 0 quand il ne trouve rien, 1 sinon, 2 pour une erreur d’usage. Lancez-le
avec les mots et le point du vrai site avant chaque commit de `sample/`.

## Les règles d’anonymisation

Une liste blanche, pas une liste noire : une table ou une colonne qui n’est pas
écrite dans `scripts/sample-data/lib/constants.mjs` ne peut pas voyager.

- **Un seul lieu.** Tout lieu (lieux connus, contexte du planificateur,
  coordonnées d’une session ou d’un plan) devient « Alpes-Maritimes (France) »,
  43,9 N 7,1 E, altitude 500 m, sans fuseau horaire (lieu sans fuseau : la nuit
  est calculée depuis la longitude). Les profils d’horizon sont omis. Les nuits
  des plans sont recalculées pour ce lieu.
- **Ni compte, ni espace, ni appareil.** Utilisateurs, organisations,
  appartenances, appareils, jetons, événements d’audit, versions de plan : jamais
  exportés.
- **Images.** Là encore une liste blanche : un JPEG ne garde que les segments
  nécessaires à son affichage (en-têtes, tables, balayages), un PNG que ses blocs
  critiques et ceux qui changent l’aspect des pixels. EXIF, XMP, IPTC,
  commentaires, images annexes, blocs de texte, date de modification, octets en
  fin de fichier et tout bloc que l’outil ne connaît pas sont retirés. Les
  **pixels sont recopiés octet pour octet** (aucune recompression). Seules les
  captures JPEG et PNG voyagent ; les autres sont écartées avec ce qui en dépend,
  et comptées.
- **Noms et identifiants.** Les fichiers sont renommés selon un motif stable
  (`session-01/image-0001.jpg`), les identifiants sont renumérotés de façon
  déterministe, les slugs régénérés, tout identifiant que le jeu ne porte pas
  devient un substitut stable. La même sélection donne les mêmes fichiers, octet
  pour octet, depuis SQLite et depuis PostgreSQL. Aucune date de fichier n’est
  conservée.
- **Textes libres** (notes, titres, descriptions, charges utiles) : conservés,
  mais un mot interdit (`--forbid`), une coordonnée, une altitude et un azimut, un
  chemin, une adresse e-mail, une adresse réseau ou une URL **arrête l’export**,
  en nommant la table et la colonne. Rien n’est retouché en silence.

## Ce que l’anonymisation laisse

L’outil ne peut pas retirer ce qui rend le jeu utile, et il ne sait juger ni la
prose ni les images. En toute honnêteté :

- **Les heures UTC et les pointés (RA/Dec) restent.** C’est ce que les
  analyseurs et le débriefing lisent. Ils ne donnent pas un site : avec eux
  seuls, le site ne se place qu’à **quelques centaines de kilomètres, jusqu’à
  environ mille** (la saison et la durée de la nuit contraignent la latitude,
  l’heure UTC du crépuscule la longitude, avec l’incertitude de l’heure à
  laquelle l’observateur a commencé). C’est un ordre de grandeur, pas une mesure.
- **L’étiquette dit le département.** « Alpes-Maritimes (France) » est public
  par décision : une zone d’environ 100 km de large. Les données ne la
  resserrent pas ; c’est l’étiquette elle-même qui est divulguée.
- **Les pixels ne sont pas regardés.** Un paysage au bord d’une image, une
  légende ou une date incrustée, un filigrane : rien de cela n’est détecté.
  **Regardez chaque image** avant de publier.
- **La prose n’est propre que dans la mesure des mots que vous avez donnés.**
  `--forbid` attrape les noms que vous listez (la commune, la rue, un
  surnom) ; une description d’un lieu qui n’en utilise aucun (« la terrasse
  derrière l’église ») n’est pas attrapée. Relisez les notes.
- **Les valeurs mesurées sur le ciel restent** (statistiques de guidage et de
  seeing, températures, remarques sur la météo). Elles n’en disent guère plus
  qu’une prévision météo pour une région.
- **Le même instrument** : l’attribution « PlanAstro » et le nom de
  l’instrument sont publics par choix.

## Pour les mainteneurs : publier le pack

`install` lit, par défaut, `https://www.planastro.space/samples/astro-portal-sample/latest.json`
(constante `DEFAULT_MANIFEST_URL` dans `scripts/sample-data/lib/constants.mjs`,
surchargeable avec `--manifest-url`). Le site doit servir à cette adresse le
`manifest.json` produit à côté de l’archive sous `build/sample-data/`, **avec son
`url` renseigné** :

```json
{
  "format": "astro-portal-sample-images",
  "version": 1,
  "url": "https://www.planastro.space/samples/astro-portal-sample/astro-portal-sample-images-v1.tar.gz",
  "sizeBytes": 123456789,
  "sha256": "<64 chiffres hexadécimaux, tels que produits>",
  "license": { "id": "CC-BY-4.0", "name": "…", "url": "…" },
  "attribution": "PlanAstro",
  "files": [ … ]
}
```

- `version` doit être égale au `packVersion` des enregistrements du dépôt
  (`sample/manifest.json`) ; un nouveau pack veut dire une nouvelle version, et de
  nouveaux enregistrements.
- `url` est une adresse `https` absolue (ou relative à celle du manifeste) ; les
  redirections sont suivies. `sizeBytes` et `sha256` sont ceux que `export` a
  affichés, et l’installeur compare les deux à ce qu’il télécharge.
- Déposez l’archive à cette adresse, à côté de `latest.json`, sous
  `/samples/astro-portal-sample/`. L’archive peut aussi être hébergée
  ailleurs (n’importe quelle adresse `https`, par exemple une pièce jointe de
  release) : mettez cette adresse dans `url`, en gardant `latest.json` là où
  l’installeur le lit.
- `export --pack-url <url>` écrit l’adresse dans le manifeste à l’export ; sinon
  renseignez `url` à la main. Rien d’autre ne doit être modifié dans le manifeste.
- Publiez l’archive **avant** de livrer les enregistrements qui demandent sa
  version, et vérifiez avec `install --manifest-url` sur un portail amorcé.
