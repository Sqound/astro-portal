# Administration du catalogue

## Accès

Quand un serveur privé se connecte (`ASTRO_PORTAL_AUTH_MODE=password` ou
`email-code`, docs/fr/PRIVATE_NOTEBOOK_AUTH.md), `/admin`,
`/api/admin/catalog`, `/api/admin/target-library` et les endpoints privés de
matériel exigent la session du propriétaire. L’administration est alors
accessible depuis le menu de compte, y compris via le tunnel TLS.

Lorsque l’authentification est désactivée, l’ancien contrôle utilise l’adresse
de la connexion TCP, injectée par `server.mjs` dans un en-tête interne qui
écrase toute valeur fournie par le client.

Sont autorisés :

- `127.0.0.1` et `::1` ;
- les IP exactes de `ASTRO_PORTAL_ADMIN_ALLOWED_IPS` ;
- les réseaux IPv4 CIDR déclarés dans cette même variable.

Exemple :

```bash
ASTRO_PORTAL_ADMIN_ALLOWED_IPS=192.168.1.42,10.20.0.0/16 npm start
```

Lorsque l’authentification est désactivée, une requête portant les en-têtes
Cloudflare est toujours refusée, même si `cloudflared` se connecte au serveur
par localhost.

Ne lancez pas l’application avec `next start` directement : utilisez
`npm start`, qui passe par le serveur de contrôle d’accès.

## Ce que contient l’administration

L’administration du portail (`/{locale}/admin`) contient ce que le propriétaire
d’un serveur administre, et rien d’autre :

| Onglet                  | Quoi                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Catalogue               | les cibles ([Catalogue de cibles](#catalogue-de-cibles))                                                      |
| Initialisation          | les données d’initialisation ([Données d’initialisation](#données-dinitialisation))                           |
| Matériel par défaut     | le matériel avec lequel un nouvel espace commence                                                             |
| Traductions, Références | les mots de l’instance et ses bibliothèques de référence                                                      |
| Journaux                | les journaux de l’instance                                                                                    |
| Galerie de fichiers     | la galerie de fichiers de l’opérateur, seulement avec `ASTRO_PORTAL_GALLERY_SOURCE=files` — pas une relecture |
| (sans onglet)           | les sauvegardes, par leur API                                                                                 |

Elle s’ouvre sur « Catalogue ». Rien de commercial ne s’administre ici : un
serveur privé ne vend rien et n’a pas d’équipe — son propriétaire décide seul
de ce qui est public (le « rendre privé » de « Mon espace »). Le service
hébergé administre son côté commercial (la relecture de sa galerie publique,
les retours, la bêta, les abonnements qu’il offre, ses offres) dans une
administration de la plateforme à part, privée, hors de ce dépôt. La barre est
la même sur tout serveur : aucun paquet n’y ajoute de section, et l’API de
l’administration sous `/api/admin/*` est la même partout.

**Pas d’accès de dernier recours ici.** Ouvrir les fichiers d’un espace à la
demande d’une autorité n’est un geste de cette administration sur aucun
serveur. Sur un serveur privé, il n’y a pas d’espace d’autrui à ouvrir : le
propriétaire lit ses propres fichiers. L’accès de dernier recours du service
hébergé vit dans son administration de la plateforme (l’autorité, sa demande
et sa référence obligatoires, une ligne de `admin_access_log` écrite avant que
l’emplacement des fichiers soit donné, jamais leur contenu), et sa ligne de
commande est gardée à côté, pour le jour où cette administration ne répond
pas ; ni l’un ni l’autre ne font partie de ce dépôt.

## Catalogue de cibles

La section d’administration **Catalogue** gère le catalogue local de ciel
profond, et non les fiches de prises de vue de la galerie publique. À sa
première utilisation, le portail importe chaque cible OpenNGC/Barnard
disponible dans la table SQLite privée `target_catalogue_entries`. La fiche
OpenNGC d’origine reste attachée à chaque ligne en lecture seule ; le portail
ne consulte jamais le catalogue sur le réseau pendant son utilisation.

Le formulaire de cible expose l’identifiant stable, les désignations et alias,
les noms communs, le type, la constellation, les coordonnées J2000, les
dimensions, la magnitude, la brillance de surface et les références de
catalogue. Ses trois panneaux média conservent séparément les métadonnées du
fallback DSS, de la photographie premium sélectionnée et de la référence
visuelle optionnelle. Les fichiers image eux-mêmes restent dans les dossiers
privés d’exécution : le formulaire édite leur nom de fichier local et leurs
métadonnées d’attribution, jamais les pixels.

Le formulaire affiche également deux indicateurs non modifiables de visibilité
par hémisphère. Ils sont dérivés de la déclinaison avec une culmination minimale
de 30° depuis des latitudes de référence de 30° Nord et Sud. Les deux
indicateurs peuvent donc être actifs ; enregistrer une nouvelle déclinaison les
recalcule automatiquement.

Le JSON éditorial complémentaire peut contenir un profil `catalogueResearch`.
Son texte source anglais, ses traductions localisées et ses liens de source
alimentent le panneau « À propos de cette cible » du planificateur. Le
générateur de recherche conserve ce profil lors des synchronisations ultérieures
du catalogue source : l’administrateur peut donc approfondir une fiche sans
perdre ce travail.

La sélection éditoriale est volontairement un point de départ, pas un filtre
lié à un lieu d’observation. Son contenu par défaut est
`packages/astro-core/sky-data/target-selection.json` (voir
[STATIC_DATA.md](STATIC_DATA.md)) :

- **Essentielles** : les cibles spectaculaires avec un petit instrument et
  observables chaque année depuis une latitude moyenne.
- **Étendues** : les cibles qui valent d’être proposées au-delà des
  Essentielles. Les deux listes sont disjointes : une cible est dans l’une au
  plus.

Chaque cible d’une sélection porte ses modes, deux cases de sa fiche,
« Visuel » et « Photo » : les suggestions d’un profil en visuel proposent les
cibles cochées « Visuel » (ou aucune des deux), celles d’un profil en photo les
cibles cochées « Photo » (ou aucune des deux) ; un catalogue coché dans les
filtres de suggestion est proposé en entier, quel que soit le mode. Les
appartenances et les modes sont éditables pour chaque objet et enregistrés dans
la base (`target_collection_memberships` : `essential`, `extended`,
`mode-visual`, `mode-photo`). Une nouvelle version du fichier par défaut les
remplace une fois sur une instance existante (voir STATIC_DATA.md). Enregistrer une
cible crée aussi une surcharge éditoriale de ses champs catalogue et média. Un
import ultérieur actualise la fiche source attachée sans remplacer ces choix
manuels. Ce premier écran ne téléverse pas d’image : importez ou placez d’abord
l’asset dans le bon dossier média privé, puis saisissez son nom de fichier
valide, sa source, son crédit et sa licence dans la fiche cible.

## Données d’initialisation

La section **Initialisation** liste chaque jeu de données de domaine ou de
référentiel éditable livré avec une instance : taxonomie, descriptions de
catalogues, noms communs, liens Caldwell, cibles du planificateur, préréglages
matériel invité et fiches de présentation des planètes. Elle édite la copie de
l’instance en base. Choisissez **Exporter le paquet d’initialisation** pour
écrire le paquet JSON privé complet, y compris le catalogue de cibles et ses
métadonnées média. Voir [Paquet de données d’initialisation](STATIC_DATA.md)
pour le schéma, le cycle de vie et la frontière de copie.

## Créer une capture : workflow de préparation à la publication

La fiche catalogue décrit la cible astronomique, les rendus sélectionnés et le
contexte éditorial/de traitement. L’inventaire privé est l’unique source du
matériel affiché dans le panneau public. Préparez donc le matériel avant de
créer ou modifier la capture.

1. Ouvrir **Mon espace** → **Matériel** (`/{locale}/manage/equipment`).
2. Créer ou compléter chaque élément réellement utilisé avant d’éditer la
   capture. Donnez-lui un nom affiché stable et renseignez les caractéristiques
   connues (par exemple ouverture et focale d’un instrument). Créez une fiche
   distincte pour une monture, un contrôleur, une lunette guide ou une caméra
   de guidage lorsqu’ils doivent apparaître publiquement.
3. Ouvrir **Captures** à l’adresse `/{locale}/admin/captures` (depuis le plan
   v6, la section n’a plus d’onglet ; les captures de chaque espace
   sont dans « Mon espace »), choisir **Nouvelle capture**. Donnez-lui un identifiant
   stable, en minuscules et avec des tirets ; choisissez les valeurs contrôlées
   de catégorie/type/constellation ; renseignez le titre dans chaque langue
   active du portail.
4. Dans **Images de cette capture**, examinez d’abord les candidats détectés
   automatiquement, puis sélectionnez uniquement les fichiers de cette cible.
   Le rapprochement automatique aide lorsqu’une convention de nommage est
   cohérente ; la sélection manuelle reste la référence lorsqu’un dossier
   contient aussi des essais ou d’autres rendus.
5. Choisissez l’**image présentée dans la galerie** (pastille bleue) et
   l’**image de référence** (pastille orange). La première est utilisée sur la
   carte de galerie. La seconde sert de repli si aucune image présentée n’est
   désignée explicitement. Vérifiez l’aperçu rapide : il reprend en miniature
   le carrousel et le panneau d’information public.
6. Complétez les sections cible, acquisition, traitement, intégrations et
   éditorial. Les métadonnées par image servent aux propriétés propres à un
   rendu ; les métadonnées de la fiche servent aux faits communs à tous les
   rendus. Décrivez le traitement dans sa section dédiée, pas dans la
   description éditoriale astronomique.
7. Enregistrez une première fois la fiche. Son identifiant catalogue est alors
   créé et les associations de matériel deviennent disponibles.
8. Dans **Matériel de cette capture**, faites deux sélections explicites :
   **Matériel principal** pour l’instrument imageur, la caméra principale, la
   monture, les filtres, le contrôleur et les accessoires optiques ; et
   **Guidage** pour la lunette guide et la caméra de guidage. Enregistrez
   l’association. Un même élément ne peut avoir qu’un rôle pour une capture :
   déplacez-le d’un groupe à l’autre plutôt que de le sélectionner deux fois.
9. Rouvrez la fiche publique et vérifiez le rendu choisi, les données
   d’acquisition, le traitement et les lignes de matériel avant de la partager.

L’enregistrement écrit les métadonnées de façon atomique et met le catalogue
public à jour immédiatement. L’éditeur ne modifie jamais les fichiers image.
Les blocs avancés sont du JSON : le message de validation précise le premier
champ invalide. L’édition JSON complète est réservée aux métadonnées atypiques
de cible ou de média ; n’y ajoutez pas de bloc `equipment`.

## Matériel

Chaque personne tient son propre matériel dans
**Mon espace** → **Matériel** (`/{locale}/manage/equipment`), l’administrateur
compris : l’administration n’a plus d’onglet **Matériel**. Créez-y les fiches
privées des télescopes, lunettes guides, caméras, oculaires,
lentilles/optiques, filtres, montures et contrôleurs. Donnez un nom affiché clair ainsi que les caractéristiques
nécessaires au planificateur — par exemple l’ouverture et la focale d’un
télescope. Ces données sont enregistrées dans SQLite privée, jamais dans une
release publique ni dans le JSON du catalogue.

Dans **Captures**, sélectionnez ensuite le matériel utilisé pour la cible du
catalogue dans les groupes **Matériel principal** et **Guidage**, puis
enregistrez l’association. Cela ne modifie ni les médias ni les métadonnées
JSON. Ces associations sont la source des lignes de matériel publiques, du
journal de sessions et, une fois authentifié, des listes de matériel du
planificateur. Seuls le nom affiché et un résumé technique public sont projetés
vers le catalogue : les notes privées, identifiants d’inventaire et réglages du
planificateur ne sont jamais exposés. L’archivage d’une fiche est non
destructif : elle disparaît des choix futurs mais la trace d’audit et les
associations aux captures passées restent conservées.

## Matériel par défaut

L’onglet **Matériel par défaut** de l’administration
(`/{locale}/admin/default-equipment`) tient la liste proposée à tous les
espaces dans le groupe « Matériel par défaut » des sélecteurs du
planificateur, pour chaque catégorie, avec la même liste et la même fiche :
ajouter, modifier, ordonner, archiver, réactiver. Ses lignes appartiennent à
l’organisation de plateforme (identifiant `platform`), qui n’est l’espace de
personne : la suppression d’un espace ne les emporte jamais et un export ne
les contient jamais. La liste a été amorcée depuis les profils de matériel
courants du cœur open source, chacun avec l’identifiant de son profil, pour
qu’un plan qui en nomme un le retrouve. Un espace peut la masquer
(« Masquer le matériel par défaut ») pour ne voir que son propre matériel.

Le journal de sessions conserve le nom concis du matériel. Son contrôle
d’information utilise la même fiche privée pour montrer les caractéristiques
utiles. Il n’existe pas de repli vers un texte libre du catalogue : complétez
la fiche privée et associez-la si une ligne publique manque.

## Journaux

La section **Journaux** (`/{locale}/admin/logs`) liste les lignes du journal
applicatif, les plus récentes d’abord (250 affichées) : les avertissements et
erreurs du service (source « Service », rangée `server`), les incidents que les
navigateurs remontent anonymement (`POST /api/logs`, source « Web », rangée
`client`) et les journaux d’erreur envoyés par les applications dont la
personne n’a pas désactivé l’option (source « Mobile », rangée `mobile` ;
`api/v1.md`, « Application error logs »). La liste se filtre par niveau et par
source. Une ligne venue d’une application ne nomme ni espace ni appareil : elle
est anonyme et, rattachée à aucun espace, elle expire avec l’âge.

`GET /api/admin/logs?level=&source=client|server|mobile&limit=` renvoie
`{ logs }` (500 au plus) au seul administrateur (403 sinon).

Chaque ligne est gardée 30 jours, quelle que soit sa source : le service
supprime les plus anciennes toutes les heures (et celles des téléphones à
chaque nouveau lot aussi).

## Appareils et leurs versions

L’application mobile et Astro Sync disent quelle version fait chaque requête
(`X-PlanAstro-Client`, `api/v1.md`, « Client identity ») : le service garde la
version et le système que chaque appareil a nommés en dernier, avec l’heure où
il a été vu, et « Mes appareils » (`GET /v1/devices`) les donne en `appVersion`
et `osVersion` — `null` pour un appareil qui n’a jamais envoyé l’en-tête. Rien
d’autre de l’appareil n’en est lu.

## Écriture et sauvegardes

Le serveur écrit uniquement dans `ASTRO_PORTAL_METADATA_DIR`. Il génère d’abord
un fichier temporaire dans le même dossier, puis le renomme : un arrêt au milieu
de l’écriture ne laisse donc pas un JSON partiellement remplacé.

Cette atomicité ne remplace pas une sauvegarde. Versionnez votre dossier de
métadonnées dans un dépôt privé ou sauvegardez-le avant une campagne importante.
Les images ne sont jamais modifiées par l’éditeur.

Si le dossier contient un document `{ "targets": [...] }`, seule l’entrée
concernée est remplacée. Une nouvelle fiche est écrite dans `<id>.json`.

## Version dans le pied de page

Le pied de page de chaque page se termine par la version du logiciel et, en
petit, le commit à partir duquel il a été construit (« v1.0.1 · 5f295f159 »).
Une image le reçoit par `ASTRO_PORTAL_BUILD_ID` (`deploy/install.sh` passe le
commit du checkout à l’image qu’il construit) ; une release faite par
`scripts/deploy-release.mjs` le porte dans son fichier `.astro-portal-commit` ;
un checkout lancé par `node server.mjs` le demande à git une fois, au
démarrage. Quand aucun n’est connu, le pied de page montre la version seule.

## Sauvegarde et restauration du runtime

`scripts/backup-runtime.mjs` et `scripts/restore-runtime.mjs`
(`npm run backup:runtime` / `npm run restore:runtime`) forment la procédure
scriptée pour les deux moteurs de persistance.

**Sauvegarde.** SQLite est capturé par l’API de sauvegarde propre de
`node:sqlite` — jamais une copie de fichier d’une base vivante. PostgreSQL est
extrait par `pg_dump` exécuté **dans** le conteneur de développement
(`docker exec astro-dev-postgres …`) ; aucun outil client PostgreSQL n’est
supposé installé sur l’hôte. Dans les deux cas, le moteur est choisi d’après
`ASTRO_PORTAL_DATABASE_PATH`/`ASTRO_PORTAL_DATABASE_URL` (ou le drapeau
`--database-path`/`--database-url` correspondant), et la commande écrit un
répertoire horodaté sous `backups/` (remplaçable par `--out`) contenant
l’artefact de base de données, `backup-info.json` (moteur, version de schéma,
version de l’application, nombre de lignes par table) et
`media-manifest.json` (chaque fichier de l’arbre média, avec son chemin
relatif, sa taille en octets et son SHA-256 — jamais copié sauf avec
`--with-media`). Le dossier média par défaut est `ASTRO_PORTAL_IMAGES_DIR`,
remplaçable par `--media-dir`. Le nom du conteneur se lit dans
`ASTRO_PORTAL_POSTGRES_CONTAINER` (par défaut `astro-dev-postgres`).

```bash
npm run backup:runtime -- --with-media
ASTRO_PORTAL_DATABASE_URL=… npm run backup:runtime -- --media-dir /chemin/vers/images
```

**Restauration.** `scripts/restore-runtime.mjs --backup backups/<id>` ne
restaure **que** dans une cible explicite et vide : `--target-path <dossier>`
pour SQLite (refusé si le dossier existe et n’est pas vide) ou
`--target-database-url <url>` pour PostgreSQL (refusé si la base contient déjà
une table), restaurée par `pg_restore` exécuté dans le même conteneur. Elle ne
touche jamais un dossier ou une base vivante. Après la restauration, le script
recalcule le nombre de lignes par table et, avec `--with-media --media-dir
<dossier>`, le SHA-256 de chaque fichier restauré ; il se termine avec un code
non nul au moindre écart avec `backup-info.json`/`media-manifest.json`.

```bash
npm run restore:runtime -- --backup backups/2026-09-27T07-42-13-912Z-806913 \
  --target-path /chemin/vers/un/dossier/vide
```

Aucun des deux scripts ne lit ni n’écrit jamais une base ou un dossier vivant
comme cible de restauration.
