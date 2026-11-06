# Déploiement

## Réseau local

Construire l’application puis lancer le serveur sur toutes les interfaces :

```bash
npm ci
npm run build
HOST=0.0.0.0 PORT=8787 npm start
```

Ouvrir ensuite `http://<adresse-lan>:8787`. Un pare-feu peut limiter le port au
sous-réseau familial.

## macOS avec launchd, Linux avec systemd

Astro Portal (`apps/portal-oss`) tourne comme agent launchd ou
service systemd à partir des exemples
[deploy/macos/org.astro-portal.plist.example](../../deploy/macos/org.astro-portal.plist.example)
et [deploy/systemd/astro-portal.service.example](../../deploy/systemd/astro-portal.service.example) :
voir [SELF_HOSTING.md](SELF_HOSTING.md), « Lancement ». L’une et l’autre
démarrent le serveur avec `node apps/portal-oss/server.mjs` (ce que lance
`npm start`), depuis le dossier du dépôt cloné.

## Tunnel Cloudflare

Un Quick Tunnel peut exposer temporairement le portail :

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

Les pages et aperçus sont accessibles ; `/admin`, `/api/admin` et les
téléchargements TIFF sont refusés lorsque Cloudflare ajoute ses en-têtes.
L’adresse Quick Tunnel change à chaque reconnexion. Pour une URL durable,
utilisez un tunnel nommé et votre propre domaine.

Derrière un tunnel, chaque visiteur joint le portail depuis l’adresse du
tunnel : les limites (la connexion, l’association d’un appareil, le journal
des clients, la préparation d’un fond de ciel) les compteraient pour un seul
et un visiteur pourrait les épuiser pour tout le monde. Quand rien d’autre
que le tunnel ne peut joindre le portail (lancé avec `HOST=127.0.0.1`),
réglez `ASTRO_PORTAL_CLIENT_IP_HEADER=cf-connecting-ip`. Un portail aussi
ouvert sur le réseau local ne doit pas le faire : quiconque s’y trouve
pourrait écrire cet en-tête et choisir l’origine sous laquelle les limites le
comptent. La liste blanche d’adresses de l’administration n’est pas
concernée : elle lit l’adresse de la connexion.

Un tunnel public rend les descriptions, dates, coordonnées célestes et toutes
les métadonnées du catalogue consultables. Activez
`ASTRO_PORTAL_REDACT_LOCATIONS=true` et lisez [PRIVACY.md](PRIVACY.md) avant de
partager l’URL.

## Releases immuables et retour arrière

Pour une installation privée, les images, métadonnées, cartes et données
d’astrométrie restent hors du dépôt. Définissez `ASTRO_PORTAL_PRIVATE_ROOT`
vers une racine contenant `releases/` et `current`, puis lancez cette commande
depuis un dépôt propre :

```bash
ASTRO_PORTAL_PRIVATE_ROOT=/srv/astro-portal \
ASTRO_PORTAL_LAUNCHD_LABEL=org.astro-portal \
ASTRO_PORTAL_DATABASE_PATH=/srv/astro-portal/private/portal.sqlite \
ASTRO_PORTAL_LIVE_URL=http://127.0.0.1:8787 \
npm run deploy:release -- --app portal-oss
```

La commande exporte le SHA Git exact, installe les dépendances verrouillées,
compile et sonde le candidat sur un port temporaire de loopback (sans la base
en service), vérifie un snapshot SQLite cohérent dans `backups/` lorsque
`ASTRO_PORTAL_DATABASE_PATH` est fourni, remplace atomiquement le lien
`current`, redémarre le service (launchd, `ASTRO_PORTAL_RESTART_COMMAND`, ou
rien avec `--no-launchd`) et, avec `ASTRO_PORTAL_LIVE_URL`, sonde le service en
ligne : s’il ne répond pas, `current` revient à la version précédente, qui est
redémarrée. Elle ne synchronise ni ne supprime les données privées.
`--app portal-oss` (le défaut) déploie l’application de `apps/portal-oss` ;
`--local` accepte un commit sans branche amont. Tous les réglages sont dans
[SELF_HOSTING.md](SELF_HOSTING.md), « Mettre à jour par versions ».

Conservez la base SQLite et les réglages de connexion sous la racine privée, mais
hors de `current/` et `releases/`. Le candidat ne reçoit volontairement aucun
chemin de base : son installation, sa compilation et son probe ne peuvent donc
ni créer ni migrer la base de production. Le snapshot de release est une
sauvegarde `VACUUM INTO` vérifiée, sûre avec les différents modes de journal
SQLite ; la procédure de restauration et de migration PostgreSQL est détaillée dans
[PRIVATE_NOTEBOOK_AUTH.md](PRIVATE_NOTEBOOK_AUTH.md). Une modification de
documentation seule ne nécessite pas de release du portail.

Le catalogue local facultatif de ciel profond est lui aussi une donnée
d’exécution. Gardez son fichier, `openngc.json`, hors de l’arbre des releases,
par exemple dans `/srv/astro-portal/runtime/target-library/`. L’application lit
automatiquement cet emplacement lorsque son dossier d’exécution est
`/srv/astro-portal/runtime`.

`portal.config.json` peut définir `supportedLocales` et `defaultLocale`. Les
URLs sont stables (`/en/`, `/fr/`, `/ja/`) ; les chemins absolus et identifiants
de tunnel restent dans un fichier d’environnement non suivi.
