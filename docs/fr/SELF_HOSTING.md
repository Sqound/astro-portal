# Héberger Astro Portal soi-même

Astro Portal (`apps/portal-oss`) est votre galerie d’astrophotographie
(originaux servis sans recompression), le
journal et le débriefing de vos sessions, le planificateur de nuit et sa carte
du ciel, et le serveur auquel l’application mobile PlanAstro
et Astro Sync se connectent comme **serveur privé**. Un serveur privé
est celui d’une seule personne : son propriétaire se connecte, les visiteurs
voient ce qu’il publie.

La version anglaise de cette page est [../SELF_HOSTING.md](../SELF_HOSTING.md).

## Installer en une commande

Sous Linux ou macOS, installez Docker et son plugin Compose, puis :

```bash
git clone https://github.com/sqound/astro-portal.git
cd astro-portal
sh deploy/install.sh
```

L’installeur demande seulement le port (8787, le `PORT` de l’image), le dossier
de données (`$HOME/astro-portal-data`) et l’adresse sur laquelle le port est
publié (`0.0.0.0`, toutes les interfaces ; `127.0.0.1` derrière un tunnel ou un
proxy inverse sur la même machine, voir « Proxy inverse ou tunnel »). Il construit `astro-portal:local`, lance
le portail avec PostgreSQL 17, attend `/api/v1/service`, puis affiche l’adresse,
`/auth/bootstrap` et le secret d’amorçage une seule fois. Ouvrez cette page,
créez le compte du propriétaire, puis appuyez sur Entrée dans le terminal quand
le compte existe. Le jeu d’exemple s’installe par défaut dans cet espace vide.
Si ses enregistrements ou son paquet d’images ne sont pas encore publiés, une
ligne le dit et l’installation réussit, avec la commande à relancer plus tard.

`--port <port>`, `--data-dir <dossier>` et `--bind-address <adresse>`
fournissent les réponses ; l’adresse n’est écrite dans `portal.env` que si elle
n’est pas `0.0.0.0`. `--yes`
utilise les valeurs par défaut sans question ni attente de la création du compte,
et affiche la commande du jeu d’exemple à lancer après la connexion.
`--no-sample` saute cette étape. OpenSSL est nécessaire sur l’hôte pour générer
les secrets ; ni Node ni npm ne sont nécessaires pour cette installation.
Sous Windows, lancez le même script dans WSL avec l’intégration WSL de Docker.

Le dossier doit être hors du dépôt (apostrophes simples et sauts de ligne dans
son chemin sont refusés). Il contient :

```text
astro-portal-data/
  portal.env       # mode 600 : secrets générés, port, UID/GID de l’hôte
  portal/          # monté sur /data : images, captures, fichiers d’exécution
  postgres/        # base PostgreSQL
```

Compose lance le portail avec l’UID/GID de la personne qui installe : `portal/`
est accessible en écriture sous Linux et macOS sans root ni dossier ouvert à
tous. Le cache d’images Next.js est aussi monté sur `portal/next-cache/`.
Conservez ces identifiants en réutilisant le dossier. L’image PostgreSQL
initialise son propre sous-dossier. L’installeur n’écrase jamais un `portal.env`
existant : réglages et secrets sont réutilisés, le secret n’est plus affiché.

Vous pouvez aussi copier `deploy/self-hosting.env.example` dans le dossier choisi,
remplacer ses valeurs, renseigner l’UID/GID avec `id -u` / `id -g`, créer `portal/next-cache/`
et `postgres/`, puis appliquer `chmod 600` au fichier d’environnement. Depuis le dépôt :

```bash
docker compose --env-file "$HOME/astro-portal-data/portal.env" up -d --build
```

Pour mettre à jour, faites `git pull`, puis relancez la même commande Compose.
Pour voir les journaux ou arrêter votre installation :

```bash
docker compose --env-file "$HOME/astro-portal-data/portal.env" logs --tail 100 portal
docker compose --env-file "$HOME/astro-portal-data/portal.env" down
```

Les données restent dans le dossier choisi. PostgreSQL est accessible seulement
dans Compose ; son port n’est pas publié sur l’hôte. Le service ne fait **aucune
sauvegarde PostgreSQL automatique**. Pour utiliser les outils de sauvegarde,
installez Node.js 24.21.0 (la version de `.nvmrc`) et lancez `npm ci` dans le dépôt.
Donnez à `backup:runtime` une `ASTRO_PORTAL_DATABASE_URL` accessible (par exemple
avec une surcharge Compose privée publiant PostgreSQL seulement sur la boucle
locale), et l’identifiant du conteneur dans `ASTRO_PORTAL_POSTGRES_CONTAINER` :

```bash
ASTRO_PORTAL_POSTGRES_CONTAINER=$(docker compose --env-file "$HOME/astro-portal-data/portal.env" ps -q postgres) \
  npm run backup:runtime -- --out /path/to/private-backups
```

Gardez l’URL de la base dans un environnement privé, hors de l’historique du shell.
Pour restaurer PostgreSQL, renseignez la même variable du conteneur et utilisez
`npm run restore:runtime -- --backup /path/to/private-backups --target-database-url <empty-database-url>` ;
la base cible doit être vide. La variante SQLite par `docker run` reste décrite
sous [Docker](#docker).

## Prérequis

- Node.js 24.21.0 (la version de `.nvmrc` ; SQLite passe par `node:sqlite`).
- Environ 2 Go de disque pour l’installation et sa compilation, plus vos
  images et vos captures.
- macOS, Linux ou tout système où tourne Node.js. PostgreSQL est facultatif.

## Installation

```bash
git clone <adresse du dépôt astro-portal> astro-portal
cd astro-portal
npm ci
npm run build
npm start
```

Le portail répond sur `http://localhost:8787` (`PORT`, `HOST` pour changer).
Sans réglage, il tourne **sans connexion** (`ASTRO_PORTAL_AUTH_MODE` non
renseigné : galerie publique et planificateur seulement). Configurez-le comme
ci-dessous avant de l’ouvrir à quiconque.

## Réglages

Placez les réglages dans un fichier d’environnement lisible par le seul
utilisateur du service (`chmod 600`), hors du dépôt et des versions déployées :
jamais dans Git, un dossier de version ni l’historique du terminal.
`node --env-file=<fichier>` le lit (les exemples launchd et systemd ci-dessous
le font). Le service refuse de démarrer tant qu’un réglage nécessaire manque ou
est faux, et nomme le réglage, jamais sa valeur.

| Réglage                                                                             | Valeur                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                          | `production` pour un vrai serveur.                                                                                                                                                                                                                                                                               |
| `HOST`, `PORT`                                                                      | Où le serveur écoute (défaut `0.0.0.0:8787`). `127.0.0.1` quand seul un proxy inverse ou un tunnel l’atteint.                                                                                                                                                                                                    |
| `ASTRO_PORTAL_DATABASE_PATH`                                                        | La base SQLite (un fichier sous votre racine privée), créée et migrée au démarrage.                                                                                                                                                                                                                              |
| `ASTRO_PORTAL_DATABASE_URL`                                                         | À la place de SQLite : une URL PostgreSQL.                                                                                                                                                                                                                                                                       |
| `ASTRO_PORTAL_RUNTIME_DIR`                                                          | Le dossier privé d’exécution : captures, résolutions astrométriques, caches, boîte factice, sauvegardes par défaut. Défaut `.astro-portal/` dans le dépôt — placez-le ailleurs pour un vrai serveur.                                                                                                             |
| `ASTRO_PORTAL_GALLERY_SOURCE`                                                       | Ce que montre la page d’accueil : `captures` (défaut), les captures publiques des espaces ; `files`, la galerie de fichiers des deux dossiers ci-dessous, avec son éditeur dans l’administration.                                                                                                                |
| `ASTRO_PORTAL_IMAGES_DIR`, `ASTRO_PORTAL_METADATA_DIR`                              | Les dossiers des images de la galerie et de son catalogue JSON (défaut : le catalogue de démonstration d’`examples/`).                                                                                                                                                                                           |
| `ASTRO_PORTAL_CAPTURES_DIR`                                                         | Où sont rangées les captures envoyées par les applications (défaut `<runtime>/captures`).                                                                                                                                                                                                                        |
| `ASTRO_PORTAL_AUTH_MODE`                                                            | `password` ou `email-code` (voir plus bas) ; `disabled` (défaut) n’a pas d’API privée.                                                                                                                                                                                                                           |
| `ASTRO_PORTAL_SIGN_IN_KEY`                                                          | Exigée par les deux modes : `openssl rand -base64 32`. La changer invalide les codes de secours.                                                                                                                                                                                                                 |
| `ASTRO_PORTAL_BOOTSTRAP_SECRET`                                                     | Un long secret aléatoire, saisi une fois sur `/auth/bootstrap` pour créer le compte du propriétaire ; inutile ensuite.                                                                                                                                                                                           |
| `ASTRO_PORTAL_PUBLIC_URL`                                                           | `email-code` : l’adresse du portail telle que vous l’ouvrez (`https://…`, ou `http://…` sur le réseau local), reprise dans le lien du message.                                                                                                                                                                   |
| `ASTRO_PORTAL_MAIL_SENDER`, `ASTRO_PORTAL_SMTP_URL`, `…_MAIL_FROM`                  | `email-code` : `smtp` et son adresse (`smtps://utilisateur:mot-de-passe@hôte:465` ou `smtp://…:587`, STARTTLS exigé), ou `file` pour un essai (la boîte factice, avec `ASTRO_PORTAL_MAIL_FILE_ALLOWED=1` en production). `ASTRO_PORTAL_SMTP_ALLOW_INSECURE=1` seulement pour un relais du réseau local sans TLS. |
| `ASTRO_PORTAL_COOKIE_SECURE`                                                        | Non renseigné : les cookies de la session web sont `Secure` en production (https ou `localhost` seulement). `false` : cookies simples, la session web tient en `http://` — **un serveur du réseau local, jamais exposé à Internet**.                                                                             |
| `ASTRO_PORTAL_CLIENT_IP_HEADER`, `ASTRO_PORTAL_TRUSTED_PROXIES`                     | Derrière un proxy inverse ou un tunnel qui seul atteint le serveur : où les limites lisent l’adresse d’un visiteur (par exemple `cf-connecting-ip`, ou `x-forwarded-for` avec le nombre de proxys). Jamais sur un serveur que d’autres atteignent directement.                                                   |
| `ASTRO_PORTAL_ADMIN_ALLOWED_IPS`                                                    | Les adresses ou réseaux IPv4 autorisés à utiliser l’administration en plus de `localhost` (par exemple `192.168.1.0/24`).                                                                                                                                                                                        |
| `ASTRO_PORTAL_STORAGE_MAX_FILE_BYTES`, `ASTRO_PORTAL_STORAGE_QUOTA_BYTES`           | Plafonds facultatifs, en octets, d’un fichier et de l’ensemble des captures envoyées par les applications. Non renseignés : aucun plafond (votre disque est la limite).                                                                                                                                          |
| `ASTRO_PORTAL_BACKUP_DIR`, `…_BACKUP_MAX_AGE_DAYS`, `…_KEEP_LATEST`, `…_KEEP_DAILY` | Les sauvegardes SQLite du service (au démarrage avant une migration, toutes les heures quand un âge maximal est fixé). Défaut `<runtime>/backups`.                                                                                                                                                               |
| `ASTRO_PORTAL_SKY_CHECK`                                                            | `auto` (par défaut) ou `off` : la vérification automatique de chaque capture après son envoi (le ciel ou un paysage, une personne, ni l’un ni l’autre), faite par le serveur lui-même, les personnes étant trouvées par un petit détecteur livré avec le portail. `off` : toute capture est `undetermined`.      |
| `ASTRO_PORTAL_CHECK_NOTICE_DAYS`                                                    | Le délai de l’avis sur une capture privée qui n’a pas passé la vérification, en jours (14 par défaut) ; avec la règle actuelle aucun avis n’est donné.                                                                                                                                                           |
| `ASTRO_PORTAL_SQLITE_LEASE`                                                         | `off` désactive le bail qui écarte un second processus de la base SQLite (utile seulement sur un système de fichiers réseau qui ne sait pas le tenir).                                                                                                                                                           |
| `ASTRO_PORTAL_PLACES`, `ASTRO_PORTAL_PLACES_URL`                                    | Lieux suggérés ([PLACES.md](PLACES.md)) : le serveur interroge lui-même OpenStreetMap par l’instance Overpass de l’adresse (par défaut `https://overpass-api.de/api/interpreter`) ; `off` les désactive.                                                                                                         |
| `ASTRO_PORTAL_CONFIG`, `ASTRO_PORTAL_PRODUCT_NAME`, `…_DEFAULT_LOCALE`              | Facultatifs : un `portal.config.json` (langues, adresse publique, traductions), le nom affiché, la langue par défaut.                                                                                                                                                                                            |

La référence complète de la connexion est [PRIVATE_NOTEBOOK_AUTH.md](PRIVATE_NOTEBOOK_AUTH.md).

**Où vivent les captures.** Les fichiers des captures restent sur votre
disque, dans le dossier des captures (`ASTRO_PORTAL_CAPTURES_DIR`) : chaque
original tel qu’il a été envoyé, nommé par son SHA-256, sa miniature et sa
copie partagée à côté sous `derived/`, les envois en cours sous `uploads/` ;
sauvegardez-le avec le dossier d’exécution. `ASTRO_PORTAL_CAPTURE_STORE`
nomme le stockage du service : un serveur privé en a un, `disk` (par
défaut), et toute autre valeur arrête le service au démarrage en disant
pourquoi. Le propriétaire télécharge un original depuis « Mon espace ›
Captures » (la route des fichiers du propriétaire avec `?download=1`), un
TIFF compris, où qu’il soit connecté ; une galerie ne sert jamais que la
copie partagée.

### Se connecter

- **`password`** : vous vous connectez avec votre adresse et un mot de passe
  (14 caractères ou plus) ; le téléphone et Astro Sync s’associent avec le
  code que montre la page Compte. Rien d’autre à configurer.
- **`email-code`** : vous vous connectez avec votre adresse et un code à six
  chiffres reçu par e-mail ; le téléphone et Astro Sync se connectent de la
  même façon. Il faut un serveur de messagerie (`smtp`).

La page web de connexion dépend du mode : `/auth/sign-in` avec `email-code`,
`/auth/login` avec `password`. La page de l’autre mode répond 404.

La première fois, ouvrez `/auth/bootstrap`, saisissez le secret d’amorçage et
votre adresse (avec `password`, aussi le mot de passe que vous choisissez) : le
compte créé est celui du propriétaire, le seul du serveur. Avec `email-code`, la
page envoie aussi un code à six chiffres à cette adresse et vous le demande
avant de créer le compte : elle vérifie que le serveur sait envoyer des
e-mails, donc la messagerie (`smtp`, ou `file` pour un essai) doit déjà
fonctionner à l’installation. Conservez les dix codes de secours affichés.

Astro Sync, sur un ordinateur, se connecte à un serveur `password` avec le code
de la page Compte (« Associer un nouvel appareil »), dans sa fenêtre ou en ligne
de commande avec `astro-sync pair` ; avec `email-code`, il se connecte par
`astro-sync sign-in`, comme le téléphone.

**Un serveur privé a un seul compte**, celui de l’administrateur. On ne lui en
donne jamais un second : une autre adresse e-mail qui demande un code
reçoit « Ce portail appartient à quelqu’un d’autre. » (dans la page web,
dans l’application et dans Astro Sync, en dix langues) et ne reçoit rien. Pour
montrer vos captures à quelqu’un, donnez-lui l’adresse de votre galerie privée
dans le mode « Accessible à tous par son adresse » : le visiteur n’a besoin
d’aucun compte.

Un serveur privé offre son profil open source (`GET /api/v1/capabilities`) :
plusieurs plans, aucun plafond de plans, de captures, de stockage ni
d’historique, des cadrages enregistrés et modifiés, mosaïques comprises. Le
serveur ne bride jamais ce qu’il sert. `GET /api/v1/entitlements` répond les
mêmes capacités sans aucun achat (`"purchases": []`) : les applications le
lisent de la même façon sur tout serveur.

`pointing.solve` reste à `false` dans ce profil, et ce n’est pas une
restriction : la visée de l’application du téléphone (l’écran de plate solving
qui pointe le télescope) est un droit de l’application elle-même, qu’un serveur
n’accorde jamais. Le serveur ne l’ouvre ni ne la ferme ; l’application décide
d’après ses propres droits.

Les plans multi-nuits sont disponibles sans aucune restriction sur un serveur
privé : créés, modifiés et archivés sur le web, leurs nuits rattachées, les
intégrations envoyées par Astro Sync et l’image du plan reçues. Le serveur ne
les bride jamais.

## Lancement

```bash
NODE_ENV=production node --env-file=/chemin/vers/astro-portal.env apps/portal-oss/server.mjs
```

Au démarrage, le service vérifie ses réglages de connexion, prend le bail
SQLite, refuse une base migrée par une version plus récente, sauvegarde avant
toute migration, migre, puis sert. Sur `SIGTERM`, il cesse d’accepter, laisse
finir les requêtes en cours (5 s au plus) et s’arrête.

### macOS avec launchd

1. Créez une racine de déploiement (par exemple dans votre dossier
   personnel) avec un dossier `logs/` et le fichier d’environnement
   `astro-portal.env` (`chmod 600`).
2. Déployez-y une première version (voir « Mettre à jour par versions »
   ci-dessous), ou faites pointer le plist vers un dépôt cloné.
3. Copiez [deploy/macos/org.astro-portal.plist.example](../../deploy/macos/org.astro-portal.plist.example)
   vers `~/Library/LaunchAgents/org.astro-portal.plist`, remplacez chaque
   valeur `REPLACE_ME` (`which node` pour le chemin de Node), puis :

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/org.astro-portal.plist
launchctl kickstart -k gui/$(id -u)/org.astro-portal   # redémarrer
```

Un agent launchd tourne tant que sa personne a une session ouverte ; le Mac
ne doit pas se mettre en veille pendant que le portail sert (Réglages
Système → Énergie).

### Linux avec systemd

Adaptez [deploy/systemd/astro-portal.service.example](../../deploy/systemd/astro-portal.service.example),
copiez-le vers `/etc/systemd/system/astro-portal.service`, puis :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now astro-portal
```

### Docker

[apps/portal-oss/Dockerfile](../../apps/portal-oss/Dockerfile) construit une
image distroless depuis la racine du dépôt ; tout ce que le service écrit va
dans le volume `/data` :

```bash
docker build -f apps/portal-oss/Dockerfile -t astro-portal .
docker run -d -p 8787:8787 -v astro-portal-data:/data \
  --env-file /chemin/vers/astro-portal.env astro-portal
```

### Proxy inverse ou tunnel

Pour ouvrir le portail au-delà de votre réseau, placez-le derrière un proxy
inverse qui termine le https (Caddy, nginx…) ou un tunnel de votre choix,
lancez-le avec `HOST=127.0.0.1`, et renseignez `ASTRO_PORTAL_CLIENT_IP_HEADER`
(et `ASTRO_PORTAL_TRUSTED_PROXIES`) avec l’en-tête qu’écrit votre proxy.
Renseignez `ASTRO_PORTAL_PUBLIC_URL` avec l’adresse https. L’administration
reste refusée à travers un tunnel qui ajoute ses propres en-têtes : utilisez-la
depuis le réseau local.

Avec le compose de l’installeur, les trois mêmes réglages vont dans
`portal.env` : `ASTRO_PORTAL_BIND_ADDRESS=127.0.0.1` (le port n’est alors
publié que sur cette machine, et seul le tunnel ou le proxy atteint le portail),
`ASTRO_PORTAL_CLIENT_IP_HEADER` (`cf-connecting-ip` derrière un tunnel
Cloudflare) et `ASTRO_PORTAL_PUBLIC_URL`. Chaque réglage de `portal.env`
parvient au conteneur du portail ; après l’avoir modifié, relancez la commande
`up -d`. Sans le premier, le port reste ouvert à tout le réseau et l’en-tête
client ne doit pas être posé : chaque visiteur venu par le tunnel compte alors
pour une seule origine, pour les limites de connexion comme pour les
signalements de la galerie publique.

### Le tunnel en conteneur

Un tunnel Cloudflare nommé peut tourner à côté du compose, avec l’image
officielle `cloudflare/cloudflared`, ses identifiants gardés hors du dépôt et
montés en lecture seule. Dans un dossier hors du dépôt (par exemple
`$HOME/astro-portal-tunnel/`), gardez le fichier d’identifiants du tunnel
(`<id du tunnel>.json`) et un `config.yml` :

```yaml
tunnel: <id du tunnel>
credentials-file: /etc/cloudflared/<id du tunnel>.json
ingress:
  - hostname: portal.example.test
    service: http://portal:8787
  - service: http_status:404
```

et, à côté, un `compose.tunnel.yaml` :

```yaml
services:
  tunnel:
    image: cloudflare/cloudflared:<une version de votre choix>
    restart: unless-stopped
    user: "<uid>:<gid>"
    command: tunnel --no-autoupdate --config /etc/cloudflared/config.yml run
    volumes:
      - "${HOME}/astro-portal-tunnel:/etc/cloudflared:ro"
    depends_on:
      - portal
```

L’image tourne sous un utilisateur sans privilèges qui lui est propre, et celui-ci
ne peut pas lire un fichier d’identifiants que vous seul pouvez lire (il doit
le rester : ce fichier est un secret). `user:` fait tourner le conteneur sous
votre identité, pour qu’il lise le dossier monté : remplacez `<uid>:<gid>` par
le résultat de `id -u` et de `id -g`, joints par deux-points. Sans cela,
`docker compose … logs tunnel` se termine par un « permission denied » sur le
fichier d’identifiants et le conteneur redémarre en boucle.

Puis, depuis le dépôt :

```bash
docker compose --env-file "$HOME/astro-portal-data/portal.env" \
  -f compose.yaml -f "$HOME/astro-portal-tunnel/compose.tunnel.yaml" up -d
```

L’ingress nomme le service `portal` du réseau du compose, jamais un port de
l’hôte. Vérifications : `docker compose … logs tunnel` montre les connexions
enregistrées ; `curl https://portal.example.test/api/v1/service` répond ;
l’administration s’ouvre sur `http://localhost:<port>` depuis la machine
elle-même et reste refusée à travers le tunnel. Pour arrêter le tunnel seul :
`docker compose … -f compose.tunnel.yaml stop tunnel`.

### Colima sur macOS : le partage du disque

Colima fait tourner Docker dans une petite machine virtuelle et ne lui partage
vos fichiers que dans la mesure où vous le dites. Par défaut, il partage votre
dossier personnel en **lecture seule**, et rien d’autre : un compose qui monte
le dossier de données ou celui du tunnel depuis un disque externe y trouve un
dossier vide, ou ne peut pas y écrire (la base ne s’ouvre pas, le portail
redémarre). Pour partager les dossiers que le compose monte, listez-les au
démarrage de la machine, en écriture pour le dossier de données et en lecture
seule pour celui du tunnel :

```bash
colima stop
colima start --mount "/Volumes/<disque>/astro-portal-data:w" \
  --mount "$HOME/astro-portal-tunnel:ro"
```

(`:w` veut dire « en écriture ».) La même liste peut être gardée dans la
section `mounts:` du fichier de configuration de Colima (`colima start --edit`),
pour que chaque démarrage la partage. Vérifications : `docker run --rm -v "<un dossier partagé>:/data" alpine ls /data`
liste les fichiers du dossier, et `docker compose … logs portal` montre le
portail démarré sur les données attendues. L’image disque de Colima est celle de
la machine virtuelle ; elle ne se déplace pas comme celle de Docker Desktop.

### Docker Desktop sur macOS : son disque sur un disque externe

Docker Desktop garde toutes ses images, conteneurs et volumes dans une seule
image disque, sur le disque système par défaut. Pour la placer sur un disque
externe, avant de télécharger ou de construire quoi que ce soit :

1. Le disque est formaté en APFS (`diskutil info /Volumes/<disque>` dit
   « APFS ») et monté avant le démarrage de Docker Desktop : sans son image
   disque, Docker Desktop ne démarre pas.
2. Docker Desktop → Settings → Resources → Advanced → « Disk image location » :
   choisissez un dossier du disque externe, puis « Apply & restart ». Docker
   Desktop déplace lui-même l’image disque ; ne la copiez pas à la main.
3. Settings → Resources → File sharing : les dossiers du disque qu’un compose
   monte (le dossier de données, celui du tunnel) sont partagés ; `/Volumes`
   l’est par défaut.
4. Vérifications : le fichier de l’image disque (`Docker.raw`) est dans le
   dossier choisi et n’est plus à son ancienne place
   (`~/Library/Containers/com.docker.docker/Data/vms/0/data/`) ; `docker info`
   répond ; l’espace libre du disque système (`df -h /`) est le même avant et
   après le téléchargement d’une image (`docker pull postgres:17-alpine`).

Gardez le dossier de données du portail sur le même disque (`--data-dir` de
l’installeur).

## Sauvegarde et restauration

- Avec SQLite, le service sauvegarde sa base avant chaque migration, et toutes les heures
  quand `ASTRO_PORTAL_BACKUP_MAX_AGE_DAYS` est renseigné ; Administration →
  Sauvegardes les liste et demande une restauration au prochain démarrage.
- `npm run backup:runtime -- --out <dossier>` prend une sauvegarde à la main : la
  base (SQLite ou PostgreSQL) et le manifeste des fichiers, et avec
  `--with-media --media-dir <dossier>` une copie de ces fichiers. La commande
  ne lit pas le fichier d’environnement : donnez-lui `--database-path` (ou
  `ASTRO_PORTAL_DATABASE_PATH`). Donnez toujours à `--out` un dossier hors de
  `releases/` et de `current/` : sans lui, la sauvegarde tombe dans le
  `backups/` de la version, supprimé avec elle.
- `npm run restore:runtime -- --backup <dossier> --target-path <dossier vide>`
  restaure une sauvegarde dans un dossier **vide** seulement (jamais par-dessus
  des données en service), puis vérifie chaque table et chaque fichier ;
  faites pointer `ASTRO_PORTAL_DATABASE_PATH` (et le dossier des fichiers) vers
  le résultat et démarrez le service.

## Le catalogue de cibles d’un portail privé

Un portail sans paquet d’initialisation ([STATIC_DATA.md](STATIC_DATA.md)) s’ouvre sur son **catalogue curé** : 91 objets, les onze corps du système solaire et 80 objets du ciel profond (surtout le catalogue de Messier), ce que compte l’onglet Catalogue du planificateur. Le service hébergé détient la bibliothèque complète (environ dix-sept mille objets, importés d’OpenNGC et curés dans un paquet privé) : c’est pourquoi son planificateur propose plus de cibles pour une nuit qu’un portail privé neuf, les deux chiffres ne mesurent pas la même liste. Le paquet d’initialisation ([STATIC_DATA.md](STATIC_DATA.md)) amène un portail privé à la bibliothèque complète.

**Photographies.** Les onze photographies du système solaire sont livrées avec le code et avec l’image, dans `examples/target-library-images/` : un portail neuf les affiche sans aucun import. Elles viennent de la photothèque de la NASA ; le dossier porte leurs crédits (`CREDITS.md`, `SOURCES.json` : fiche NASA, source, mention de crédit, licence). **Ce sont des médias de la NASA, utilisés selon les [lignes directrices de la NASA sur les médias](https://www.nasa.gov/nasa-brand-center/images-and-media/), et non du code source d’Astro Portal, qui est sous AGPL-3.0.** Le portail sert d’abord le fichier de son propre dossier (`<exécution>/target-library/images/`) puis se rabat sur celui qui est livré : l’import ci-dessous ne sert donc plus qu’à les **rafraîchir** depuis la NASA, depuis un clone du dépôt, avec le dossier de données du portail :

```sh
ASTRO_PORTAL_TARGET_LIBRARY_FILE=<données>/runtime/target-library/openngc.json \
  npm run import:solar-system-images -- --force
```

puis redémarrez le portail. La commande a besoin d’internet une fois et écrit les images et leur liste `images.json` ; sans `--force`, elle garde ce qu’elle a. Pour rafraîchir plutôt les images livrées avec le code (une étape de mainteneur), lancez `npm run import:solar-system-images -- --bundle` et vérifiez `CREDITS.md` et `SOURCES.json`. Les photographies des objets du ciel profond ne sont pas livrées : sans les images de la bibliothèque, ces cartes montrent la figure du type de l’objet.

## Jeu d’exemple

`npm run sample:install` installe la nuit d’exemple publique (plans,
sessions, captures) dans l’espace du propriétaire d’un portail
déjà amorcé : voir [SAMPLE_DATA.md](SAMPLE_DATA.md).

## Mettre à jour par versions

`npm run deploy:release` déploie le commit extrait comme une version
immuable, depuis le dépôt lui-même : `git archive` dans
`<racine>/releases/<commit>`, `npm ci`, la compilation, un candidat lancé sur
un port local sans vos données et sondé, un instantané vérifié de la base
SQLite, la bascule atomique de `<racine>/current`, le redémarrage du service,
une sonde du service en ligne, puis la suppression des anciennes versions
(trois sont gardées). Un candidat en échec laisse `current` intact ; un
service qui ne répond pas après la bascule remet `current` sur la version
précédente et la redémarre.

```bash
ASTRO_PORTAL_PRIVATE_ROOT=/chemin/vers/racine-de-deploiement \
ASTRO_PORTAL_DATABASE_PATH=/chemin/vers/racine-de-deploiement/private/portal.sqlite \
ASTRO_PORTAL_LAUNCHD_LABEL=org.astro-portal \
ASTRO_PORTAL_LIVE_URL=http://127.0.0.1:8787 \
npm run deploy:release -- --local
```

- `--local` déploie un commit d’un dépôt sans dépôt distant ; sans lui, le
  commit doit être poussé vers sa branche amont.
- `ASTRO_PORTAL_RESTART_COMMAND` remplace launchd (par exemple
  `sudo systemctl restart astro-portal`) ; `--no-launchd` ne redémarre rien.
- `ASTRO_PORTAL_CANDIDATE_PORT` (défaut 8878) est le port du candidat.

Gardez la base, le fichier d’environnement et vos données sous la racine de
déploiement, mais hors de `releases/` et de `current/` : une version ne
contient que du code.

## Venir d’un autre portail

Arrêtez l’ancien service, copiez sa base (un instantané `VACUUM INTO`, ou le
fichier d’un service arrêté) et ses dossiers de données sous la nouvelle
racine de déploiement, faites pointer `ASTRO_PORTAL_DATABASE_PATH` et les
dossiers vers ces copies, puis démarrez : le service sauvegarde la base et la
migre. Gardez l’original intact tant que le nouveau portail n’a pas été
vérifié.

La base d’un Astro Portal antérieur migre ainsi, quelle que soit sa version :
son propriétaire reste le propriétaire et se connecte avec la même adresse.
Ce qu’il faut aussi reprendre, et où le nouveau service le cherche :

| Données de l’ancien portail                                          | Réglage (défaut)                                                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Images et catalogue JSON de la galerie                               | `ASTRO_PORTAL_IMAGES_DIR`, `ASTRO_PORTAL_METADATA_DIR`                                              |
| `target-library/`, `plate-solves/`, `quality/`, `astrometry/`        | sous `ASTRO_PORTAL_RUNTIME_DIR`                                                                     |
| `static-data/` (le paquet d’initialisation)                          | `ASTRO_PORTAL_STATIC_DATA_DIR` (`static-data/` à côté du dossier d’exécution)                       |
| Les aperçus de carte du ciel de la galerie (`stellarium-previews/`)  | `ASTRO_PORTAL_STELLARIUM_DIR` (`stellarium-previews/` dans le dossier du catalogue) : à poser sinon |
| `portal.config.json` (langues, adresse publique)                     | `ASTRO_PORTAL_CONFIG` (aucun)                                                                       |
| Le raster de qualité du ciel, qu’un ancien portail peut ne pas avoir | `static-data/sky-quality/`, préparé comme le dit [SKY_QUALITY_RASTER.md](../SKY_QUALITY_RASTER.md)  |

Sans le raster, le planificateur dit l’estimation de la pollution lumineuse
indisponible. Sur macOS, `cp -cR` copie un dossier du même volume APFS sans
reprendre sa place. Les codes de secours et l’authentificateur d’un ancien
portail ne valent plus : tant que le serveur de courrier n’est pas éprouvé,
gardez la boîte factice sous la main (`ASTRO_PORTAL_MAIL_SENDER=file` avec
`ASTRO_PORTAL_MAIL_FILE_ALLOWED=1`, le code se lit sur le serveur).

## Démonstration en lecture seule

Utilisez la même image open source avec sa base **SQLite** par défaut, sur
un volume dédié à la démonstration. L'installation compose sur PostgreSQL
n'est pas la configuration de la démonstration. Lancez d'abord sans mode
démo, créez le compte propriétaire sur `/auth/bootstrap`, puis installez
l'exemple publié par `node scripts/sample-data/install.mjs --yes --database /data/astro-portal.sqlite
--images-dir /data/images --captures-dir /data/runtime/captures` après la
première connexion du propriétaire ([SAMPLE_DATA.md](SAMPLE_DATA.md)).

Lancez le service avec **exactement** `ASTRO_PORTAL_DEMO=1`. Toute méthode
sauf `GET`, `HEAD` et `OPTIONS` est refusée avant le routage ou
l'authentification, y compris connexion, bootstrap, administration et
préparation de pack : HTTP `403`, `Cache-Control: no-store`, code d'erreur
v1 `demo_read_only`, et « Cette démonstration est en lecture seule : rien ne
peut y être modifié. » dans la langue demandée (anglais si aucune n'est
connue). Aucun bandeau ni écran supplémentaire n'est ajouté. Les visiteurs
ne voient que la galerie du propriétaire et le
planificateur invité, comme sur tout portail privé. Les formulaires qui
affichent déjà une erreur serveur montrent ce message à sa place ; ceux
qui utilisent une erreur générique conservent ce texte existant.

Pour remettre la démonstration dans son état initial, arrêtez le service et
restaurez une copie de son volume de données (base, images et captures)
faite avant son ouverture aux visiteurs. Gardez cette copie privée : elle
contient le compte propriétaire en plus des données de démonstration.

Pour les fichiers servis et leur installation, voir
[Ajouter des packs à un portail privé](OFFLINE_PACKS.md#ajouter-des-packs-à-un-portail-privé).
