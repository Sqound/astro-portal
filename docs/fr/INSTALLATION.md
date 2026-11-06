# Installation et configuration

Pour faire tourner Astro Portal sur votre propre serveur — la connexion, un
service qui démarre avec la machine, les sauvegardes et les mises à jour —
suivez [SELF_HOSTING.md](SELF_HOSTING.md).

Pour l’installation Docker en une commande, lancez `sh deploy/install.sh` dans
le dépôt cloné : [Installer en une commande](SELF_HOSTING.md#installer-en-une-commande).
Sous Windows, utilisez WSL. La suite décrit une installation directe avec Node.js.

## Prérequis

- Node.js 24.21.0 (la version de `.nvmrc`) ;
- un dossier d’images lisible par le compte du service ;
- un dossier de métadonnées JSON, inscriptible uniquement si l’éditeur est
  utilisé ;
- facultativement Astrometry.net, ses index et le catalogue HYG pour les
  annotations.

## Installation

```bash
git clone https://github.com/sqound/astro-portal.git
cd astro-portal
npm ci
npm run check
```

`npm run dev` lance Next.js en développement sur le port 8787. En production,
il faut construire puis démarrer le serveur Node intégré :

```bash
npm run build
HOST=0.0.0.0 PORT=8787 npm start
```

Ce serveur intégré remplace l’en-tête interne contenant l’adresse cliente. Cette
étape est indispensable au contrôle d’accès de `/admin`; ne lancez pas
directement `next start` si vous activez l’administration.

## Organisation recommandée

```text
/srv/astro-portal/
  app/                  dépôt Git
  images/               PNG, JPEG, WebP, SVG et TIFF
    presentation/
    progression/<cible>/
  catalog/              un ou plusieurs fichiers JSON
    stellarium-previews/
  runtime/              résultats WCS et index locaux
```

Les images peuvent se trouver ailleurs, y compris sur un volume externe. Les
dossiers `images`, `catalog` et `runtime` ne doivent pas être placés dans Git.

## Variables d’environnement

| Variable                                         | Défaut                                      | Rôle                                                                                            |
| ------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `HOST`                                           | `0.0.0.0`                                   | Adresse d’écoute                                                                                |
| `PORT`                                           | `8787`                                      | Port HTTP                                                                                       |
| `ASTRO_PORTAL_IMAGES_DIR`                        | `examples/images`                           | Originaux et aperçus                                                                            |
| `ASTRO_PORTAL_METADATA_DIR`                      | `examples/catalog`                          | Fiches JSON                                                                                     |
| `ASTRO_PORTAL_RUNTIME_DIR`                       | `.astro-portal`                             | Données générées                                                                                |
| `ASTRO_PORTAL_STELLARIUM_DIR`                    | `<catalog>/stellarium-previews`             | Cartes du ciel                                                                                  |
| `ASTRO_PORTAL_REDACT_LOCATIONS`                  | `false`                                     | Retire lieux et GPS de l’API publique                                                           |
| `ASTRO_PORTAL_WEATHER_FALLBACK`                  | `met-norway`                                | Secours météo ; `disabled` le désactive                                                         |
| `ASTRO_PORTAL_MET_NORWAY_ENDPOINT`               | Locationforecast 2.0 `complete`             | Service de secours MET Norway                                                                   |
| `ASTRO_PORTAL_MET_NORWAY_USER_AGENT`             | Identifiant du dépôt public Astro Portal    | Identification exigée par MET Norway                                                            |
| `ASTRO_PORTAL_SKY_QUALITY_ENDPOINT`              | WMS LightPollutionMap                       | Service WMS de luminance du ciel                                                                |
| `ASTRO_PORTAL_SKY_QUALITY_LAYER`                 | `PostGIS:SB_2025_raw`                       | Couche de luminance modélisée                                                                   |
| `ASTRO_PORTAL_SKY_QUALITY_SAMPLE_RADIUS_DEGREES` | `0.005`                                     | Rayon autour du lieu arrondi                                                                    |
| `ASTRO_PORTAL_SKY_TILE_MIRROR`                   | activé                                      | `off` retire le composant sky-backdrop du pack hors ligne (miroir de tuiles HiPS)               |
| `ASTRO_PORTAL_SKY_TILE_MIRROR_DIR`               | `<runtime>/sky-tiles`                       | Cache disque du miroir HiPS (tuiles, archives, `properties`)                                    |
| `ASTRO_PORTAL_SKY_CUTOUT_DIR`                    | `<runtime>/sky-cutouts`                     | Cache disque des découpes du ciel complètes (`GET /v1/sky-cutout`)                              |
| `ASTRO_PORTAL_SKY_TILE_MIRROR_MAX_BYTES`         | `4294967296` (4 Gio)                        | Plafond du cache du miroir HiPS ; éviction LRU au-delà                                          |
| `ASTRO_PORTAL_SKY_TILE_MIRROR_CONCURRENCY`       | `4`                                         | Connexions simultanées vers le CDS, partagées par tuiles et archives, toutes racines confondues |
| `ASTRO_PORTAL_TARGET_FIELD_IMAGES`               | activé                                      | `off` coupe les images de champ de la vue à l’oculaire (`/api/v1/targets/{id}/field-image`)     |
| `ASTRO_PORTAL_TARGET_FIELD_IMAGE_DIR`            | `<runtime>/target-field-images`             | Images de champ découpées dans DSS2 (hips2fits, sinon tuiles HiPS, miroir ESAC d’abord)         |
| `ASTRO_PORTAL_UPSTREAM_USER_AGENT`               | Identifiant du dépôt public Astro Portal    | Identification du miroir de tuiles HiPS envers le CDS                                           |
| `ASTRO_PORTAL_UPSTREAM_CONNECT_TIMEOUT_MS`       | `5000`                                      | Délai de connexion par tentative avant de basculer vers la racine miroir suivante               |
| `ASTRO_PORTAL_UPSTREAM_TIMEOUT_MS`               | `20000`                                     | Délai global par tentative (connexion et corps) ; voir SKY_TILES_MIRROR.md                      |
| `ASTRO_PORTAL_ADMIN_ALLOWED_IPS`                 | vide                                        | IP/CIDR autorisés en plus de localhost                                                          |
| `ASTRO_PORTAL_ASTROMETRY_INDEX_DIR`              | `<runtime>/astrometry/indexes`              | Index Astrometry.net                                                                            |
| `ASTRO_PORTAL_HYG_CATALOG`                       | `<runtime>/astrometry/catalogs/hyg_v41.csv` | Catalogue d’étoiles                                                                             |
| `ASTRO_PORTAL_SOLVE_FIELD`                       | `solve-field`                               | Commande de résolution                                                                          |
| `ASTRO_PORTAL_WCSINFO`                           | `wcsinfo`                                   | Commande de lecture WCS                                                                         |
| `ASTRO_PORTAL_PLOT_CONSTELLATIONS`               | `plot-constellations`                       | Catalogue d’objets                                                                              |
| `ASTRO_PORTAL_SCALE_LOW/HIGH`                    | `0.8` / `4.5`                               | Champ recherché en degrés                                                                       |
| `ASTRO_PORTAL_SOLVE_CPU_LIMIT`                   | `90`                                        | Limite par résolution en secondes                                                               |
| `ASTRO_PORTAL_AUTH_MODE`                         | `disabled`                                  | `password` ou `email-code` seulement lorsque prêt                                               |
| `ASTRO_PORTAL_DATABASE_PATH`                     | aucun                                       | Base SQLite privée (obligatoire pour la connexion)                                              |
| `ASTRO_PORTAL_SQLITE_LEASE`                      | activé                                      | `off` laisse un second processus ouvrir la base SQLite (voir DEPLOYMENT.md)                     |
| `ASTRO_PORTAL_BOOTSTRAP_SECRET`                  | aucun                                       | Secret du premier compte, privé                                                                 |
| `ASTRO_PORTAL_SIGN_IN_KEY`                       | aucun                                       | Clé base64 privée de 32 octets de la connexion (codes, verrous, codes de secours)               |
| `ASTRO_PORTAL_COOKIE_SECURE`                     | défaut production                           | Cookies de session Secure ; `false` (serveur privé du réseau local seulement) autorise le http  |
| `ASTRO_PORTAL_CAPTURES_DIR`                      | `<runtime>/captures`                        | Octets originaux des captures (téléversements), privés, par locataire, hors base                |
| `ASTRO_PORTAL_STORAGE_QUOTA_BYTES`               | `0` (aucune allocation)                     | Total d’octets qu’un locataire peut stocker ; `0` refuse tout téléversement                     |
| `ASTRO_PORTAL_STORAGE_MAX_FILE_BYTES`            | `0` (aucune allocation)                     | Taille maximale d’un fichier de capture ; `0` refuse tout téléversement                         |

Copiez `.env.example` vers `.env.local` pour le développement. Pour un service
système, préférez un fichier d’environnement lisible uniquement par son compte.

Lisez [PRIVATE_NOTEBOOK_AUTH.md](PRIVATE_NOTEBOOK_AUTH.md) avant d’activer la
connexion : elle liste les réglages de chaque mode (code par e-mail avec
`smtp`, ou mot de passe).

## Captures (`POST /v1/uploads`, `GET /v1/captures`)

Les octets originaux d’une capture sont stockés inchangés, hors base de
données, sous `ASTRO_PORTAL_CAPTURES_DIR` (par défaut `<runtime>/captures`),
selon une disposition par locataire et adressée par contenu —
`<captures>/<tenantId>/<sha256[0:2]>/<sha256[2:4]>/<sha256>` — jamais nommée
d’après le nom de fichier d’origine. Rien sous ce dossier n’est servi par
aucune route : une capture reste toujours privée à son locataire, sans URL
publique.

`ASTRO_PORTAL_STORAGE_QUOTA_BYTES` et `ASTRO_PORTAL_STORAGE_MAX_FILE_BYTES`
valent toutes deux `0` (aucune allocation, tout téléversement refusé avec
`409`) tant qu’elles ne sont pas définies. C’est le réglage par lequel un
auto-hébergeur s’octroie du stockage sur son propre disque.

## Formats d’images

Le scanner parcourt récursivement le dossier d’images. Les aperçus pris en
charge sont PNG, JPEG, WebP, AVIF et SVG. Les TIFF portant le même nom de base
et placés dans le même dossier sont associés comme téléchargement pleine
résolution. Aucun de ces fichiers n’est transformé par le portail.

Pour garder une photothèque lisible, placez les rendus finaux de chaque cible
dans un dossier portant son identifiant de catalogue, par exemple
`images/veil-nebula/`. Conservez l’aperçu et son TIFF de téléchargement dans ce
même dossier. Les associations existantes avec `assetBaseNames` restent valides
après ce déplacement tant que les noms de base sont uniques ; utilisez
`assetPaths` lorsque deux cibles doivent employer le même nom de base.

Conservez également les variantes sous cette même cible : `presentation/` pour
les rendus avec courbe de présentation, `intermediaire/` pour les intégrations
plus courtes ou partielles et `progression/` pour les étapes cumulées. Chaque
cible reste ainsi autonome, tandis que le scanner récursif retrouve toutes les
variantes.
