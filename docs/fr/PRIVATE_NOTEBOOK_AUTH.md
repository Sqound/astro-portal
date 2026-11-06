# Serveur privé : persistance et connexion

Un serveur privé est un espace pour une seule personne : son propriétaire,
l’unique administrateur créé à son installation. Il a un seul compte et n’en
crée jamais un second : une autre adresse e-mail est refusée, et personne n’est
invité. Le
catalogue JSON et tous les originaux, TIFF, PNG, aperçus et ressources de
résolution restent hors base ; SQLite (ou PostgreSQL) contient les données
privées et vivantes : l’organisation, le propriétaire et son rattachement, les
codes de secours hachés, les sessions, les appareils, les plans et les lieux,
les compteurs de la connexion et un audit minimal.

Le service emploie `node:sqlite`, sans pilote natif. Les UUID, dates UTC,
`tenant_id`, documents JSON texte et l’accès par dépôt permettent à PostgreSQL
de ne remplacer que le pilote et l’exécution des migrations.

## Deux façons de se connecter

L’authentification est **désactivée par défaut**
(`ASTRO_PORTAL_AUTH_MODE=disabled` : aucune API privée, le catalogue public
seulement). Un serveur privé choisit l’un de deux modes :

| Mode         | Le propriétaire se connecte avec                                                     | Appareils (PlanAstro, Astro Sync)                                                                     | Il faut                                 |
| ------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `email-code` | son adresse e-mail, puis un code à six chiffres reçu par e-mail ; aucun mot de passe | se connectent eux-mêmes, de la même façon, et figurent dans « Mes appareils » (renommés, détachés là) | un moyen d’envoyer des e-mails (`smtp`) |
| `password`   | son adresse e-mail et un mot de passe de 14 caractères ou plus                       | s’associent avec le code qu’affiche la page Compte (« Associer un nouvel appareil »)                  | rien d’autre que le serveur             |

`email-code` est la connexion par code reçu par e-mail, pour une seule adresse : le
serveur annonce `signIn: { method: "email-code", spaceCreation: "closed",
codeLength: 6 }` dans `GET /api/v1/service`. Toute autre adresse est refusée
clairement — « Ce portail appartient à quelqu’un d’autre. » (`403`
`not_owner`) — et ne reçoit rien : un serveur privé n’a rien à cacher d’une
énumération. Avant l’installation, toute adresse est refusée avec `409`
`not_initialized`, qui renvoie à `/auth/bootstrap`. Aucune suppression
d’espace : le propriétaire supprime son serveur. Choisissez `password` quand
le serveur ne peut pas envoyer d’e-mails.

`totp`, l’authentificateur des premiers serveurs privés, **n’existe plus** :
un serveur réglé sur `ASTRO_PORTAL_AUTH_MODE=totp` ne démarre pas et dit
quels deux modes choisir. Ses tables `totp_credentials` et
`bootstrap_enrollments` restent dans le schéma, inutilisées (aucune
migration destructrice). Pour faire passer un serveur qui l’utilisait :
réglez le nouveau mode et ses réglages, puis connectez-vous une fois avec un
code de secours (le mode `password` demande alors le nouveau mot de passe).

## Réglages

Placez-les dans l’environnement privé du service (jamais dans
`portal.config.json`, un dossier de release, Git ou un historique de shell).
Le service refuse de démarrer tant qu’un réglage dont il a besoin manque ou
est faux, et nomme le réglage — jamais sa valeur.

| Réglage                                         | Modes                    | Valeur                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ASTRO_PORTAL_AUTH_MODE`                        | tous                     | `disabled` (par défaut), `password` ou `email-code`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ASTRO_PORTAL_DATABASE_PATH` ou `_DATABASE_URL` | les deux                 | La base privée (un chemin SQLite sous la racine privée, ou une URL PostgreSQL). Obligatoire dès que la connexion est active.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ASTRO_PORTAL_BOOTSTRAP_SECRET`                 | les deux                 | Un long secret aléatoire, saisi une fois sur `/auth/bootstrap` ; il ne sert que tant qu’aucun compte n’existe.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ASTRO_PORTAL_SIGN_IN_KEY`                      | les deux                 | **Obligatoire.** 32 octets aléatoires en base64 (`openssl rand -base64 32`) : la clé des codes envoyés par e-mail, des compteurs des verrous et des codes de secours. La changer invalide les codes de secours.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ASTRO_PORTAL_PUBLIC_URL`                       | `email-code`             | **Obligatoire.** L’adresse du portail telle que son propriétaire l’ouvre, reprise dans le lien du message : `https://…`, ou `http://…` pour un serveur privé du réseau local.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `ASTRO_PORTAL_MAIL_SENDER`                      | `email-code`             | **Obligatoire.** `smtp`, ou `file` (la boîte factice, pour un essai). Sans expéditeur aucun code ne peut partir, et le service ne démarre pas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `ASTRO_PORTAL_SMTP_URL`                         | `email-code` avec `smtp` | `smtps://utilisateur:motdepasse@hote:465` (TLS dès le premier octet) ou `smtp://utilisateur:motdepasse@hote:587` (STARTTLS, exigé). Un `@`, `:` ou `/` du nom ou du mot de passe s’écrit `%40`, `%3A`, `%2F`.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `ASTRO_PORTAL_SMTP_ALLOW_INSECURE`              | `email-code` avec `smtp` | `1` pour un relais du réseau local sans TLS, ou dont le certificat ne peut pas être vérifié. Jamais pour un serveur joint par Internet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ASTRO_PORTAL_MAIL_FROM`                        | `email-code` avec `smtp` | **Obligatoire.** L’expéditeur de chaque message, par exemple `Astro Portal <vous@example.com>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ASTRO_PORTAL_MAIL_FILE_DIR`                    | `email-code` avec `file` | Où la boîte factice écrit ses messages (par défaut `<runtime>/mailbox`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `ASTRO_PORTAL_MAIL_FILE_ALLOWED`                | `email-code` avec `file` | `1` pour autoriser la boîte factice en production : elle écrit les codes sur disque. Pour les essais seulement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ASTRO_PORTAL_MAIL_HOURLY_BUDGET`, `_MINUTE_…`  | `email-code`             | Le budget d’e-mails du serveur (par défaut 80 par heure, 20 par minute).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `ASTRO_PORTAL_COOKIE_SECURE`                    | les deux                 | Non renseigné : les cookies de session sont `Secure` (`__Host-`) quand `NODE_ENV=production`, et un navigateur ne garde alors la session web qu’en https ou sur `localhost` ; `true` les rend `Secure` en développement aussi. `false`, écrit explicitement, n’est honoré que par un serveur privé : ses cookies sont alors simples et la session web tient en `http://` — **pour un serveur du réseau local, jamais exposé à Internet** (le service le rappelle dans son journal au démarrage). Sinon, ouvrez le portail en https (proxy inverse, tunnel). Les applications, qui utilisent un jeton d’appareil, ne sont pas concernées. |
| `ASTRO_PORTAL_CLIENT_IP_HEADER`                 | les deux                 | L’en-tête qui nomme l’adresse d’un visiteur derrière un proxy inverse (`x-forwarded-for`, `cf-connecting-ip`…), ou `socket`. Chaque verrou compte par cette origine.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ASTRO_PORTAL_TRUSTED_PROXIES`                  | les deux                 | Combien de proxys se tiennent devant le service (1 à 10, 1 par défaut).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `ASTRO_PORTAL_HOSTED_SPACES`                    | `email-code`             | `off` pour que `email-code` soit celui du serveur privé, pour son propriétaire. Le serveur open source n’en a pas besoin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

`ASTRO_PORTAL_TOTP_ENCRYPTION_KEY` disparaît : retirez-la.

Au démarrage, un serveur en mode `email-code` dit une fois dans son journal
comment partent ses codes, par exemple `by smtp through smtp.example.com:587
(STARTTLS required)` : l’hôte et le port, jamais l’adresse, qui contient le
mot de passe.

## Installer (`/auth/bootstrap`)

Ouvrez `/auth/bootstrap` avant la création du premier compte, avec le secret
d’amorçage :

- `email-code` : le secret, le nom de l’organisation et l’adresse du
  propriétaire. Un code part **aussitôt** vers cette adresse ; le saisir crée
  le compte et connecte le navigateur. Un expéditeur mal réglé se voit à
  l’installation, pas au premier soir de sortie.
- `password` : le secret, l’organisation, l’adresse et un mot de passe de 14
  caractères ou plus (deux fois). Le compte est créé et le navigateur connecté
  aussitôt.

Dans les deux modes, la page montre ensuite **dix codes de secours, une seule
fois**. Gardez-les hors ligne. L’installation n’a lieu qu’une fois : ne
supprimez pas de lignes pour la rouvrir.

## Se connecter

- `email-code` : `/auth/sign-in` — l’adresse du propriétaire, puis le code à
  six chiffres du message (ou son lien, qui ouvre l’application ou la page
  `/auth/link`). La page parle de « votre portail », jamais de créer un
  espace.
- `password` : `/auth/login` — l’adresse et le mot de passe.

Un visiteur non connecté d’une page privée est envoyé vers la page du mode,
puis ramené à la page demandée.

## Codes de secours (`/auth/recovery`)

Un code de secours connecte quel que soit le mode — la voie de retour quand
l’e-mail ne part plus, ou quand le mot de passe est perdu — et il est consommé
une fois utilisé. En mode `password`, il s’accompagne d’un **nouveau mot de
passe**, enregistré aussitôt : c’est ainsi qu’on remplace un mot de passe
perdu, et qu’un serveur passé de `email-code` à `password` reçoit son premier
mot de passe. Une fois tous les codes utilisés, seule la restauration d’une
sauvegarde vérifiée permet de revenir.

## Appareils

- `email-code` : un appareil se connecte lui-même avec l’adresse du
  propriétaire et un code, et reçoit son propre jeton. La page Compte est la
  page de l’espace : « Mes appareils » liste les appareils, qu’on y renomme et
  détache, avec les mots d’un portail d’une personne (« votre portail »). Astro Sync se connecte de la même façon
  (`application: "sync"`) et ne compte jamais dans la règle « un appareil,
  un espace ».
- `password` : la page Compte affiche « Associer un nouvel appareil » : un
  code de huit caractères (et son code QR) que l’appareil réclame
  (`POST /api/v1/devices/claim`), comme avant.

## Les verrous

Chaque compteur est une empreinte à clé sous `ASTRO_PORTAL_SIGN_IN_KEY` ;
aucune adresse e-mail ni adresse réseau n’est gardée.

- **Codes par e-mail** : un code vit 10
  minutes et s’essaie 5 fois ; au plus 5 codes par heure et par adresse, un
  par minute ; cinq échecs d’une adresse depuis une origine réseau, ou vingt
  depuis toutes les origines en une heure, verrouillent l’adresse 15 minutes,
  puis 1 heure, puis 24 heures quand cela revient dans les 24 heures. Le lien
  du message n’est jamais verrouillé.
- **Mot de passe** : cinq échecs pour une adresse depuis une origine
  verrouillent ce couple 15 minutes, puis 1 heure, puis 24 heures, comme les
  codes ; vingt échecs de l’adresse depuis toutes les origines en une heure
  verrouillent l’adresse ; trente échecs depuis une origine en une heure,
  quelle que soit l’adresse, refusent cette origine jusqu’à la fin de
  l’heure. La page dit jusqu’à quand (« Trop d’essais : cette adresse ne peut
  plus se connecter d’ici avant 21:40. »). Qui connaît l’adresse ne peut,
  depuis une origine, retenir que lui-même.
- Un **code de secours** n’est jamais retenu par le verrou d’une adresse :
  c’est la voie de retour du propriétaire qu’un autre aurait bloqué. Seul le
  budget de son origine le compte.

Les mots de passe utilisent scrypt (N=32768, r=8, p=1) avec un sel aléatoire
unique. Jetons de session, CSRF, jetons d’appareils et codes de secours ne sont
jamais gardés en clair ; le cookie de session est HttpOnly, Secure quand c’est
réglé, et SameSite=Lax. Toutes les API authentifiées qui écrivent vérifient un
jeton CSRF distinct.

## Envoyer les codes : recettes SMTP

Utilisez un mot de passe d’application quand le fournisseur en propose un,
jamais le mot de passe de la boîte. `vous@example.com` tient lieu de votre
propre adresse.

- **iCloud Mail** (une adresse `@icloud.com`, `@me.com` ou un domaine
  personnalisé d’iCloud+) : créez un mot de passe pour application sur
  appleid.apple.com, puis

  ```text
  ASTRO_PORTAL_MAIL_SENDER=smtp
  ASTRO_PORTAL_SMTP_URL=smtp://vous%40example.com:mot-de-passe-application@smtp.mail.me.com:587
  ASTRO_PORTAL_MAIL_FROM=vous@example.com
  ```

  Port 587, STARTTLS ; le nom d’utilisateur est l’adresse entière, son `@`
  écrit `%40`.

- **Gmail** : activez la validation en deux étapes, créez un mot de passe
  d’application (Compte Google → Sécurité → Mots de passe des applications),
  puis

  ```text
  ASTRO_PORTAL_MAIL_SENDER=smtp
  ASTRO_PORTAL_SMTP_URL=smtps://vous%40example.com:mot-de-passe-application@smtp.gmail.com:465
  ASTRO_PORTAL_MAIL_FROM=vous@example.com
  ```

- **Tout fournisseur** : son serveur d’envoi, avec TLS dès le premier octet
  sur 465 (`smtps://`) ou STARTTLS sur 587 (`smtp://`), et les identifiants
  qu’il donne :

  ```text
  ASTRO_PORTAL_MAIL_SENDER=smtp
  ASTRO_PORTAL_SMTP_URL=smtps://utilisateur:motdepasse@smtp.fournisseur.example:465
  ASTRO_PORTAL_MAIL_FROM=Astro Portal <vous@example.com>
  ```

- **Un relais de votre propre réseau** sans TLS (un NAS, une box) :
  `smtp://relais.local:25` avec `ASTRO_PORTAL_SMTP_ALLOW_INSECURE=1`.
  Seulement sur votre propre réseau.

Un message que le serveur de messagerie n’accepte pas répond `502`
`email_delivery_failed` : rien n’est compté comme envoyé, et la page le dit.
Pour essayer le serveur sans serveur de messagerie,
`ASTRO_PORTAL_MAIL_SENDER=file` écrit chaque message en JSON dans la boîte
factice (avec `ASTRO_PORTAL_MAIL_FILE_ALLOWED=1` en production).

## Chemins protégés

Quand la connexion est active, la page du planificateur reste publique pour
proposer le choix entre invité et connexion. Le serveur Node exige une session
valide pour les données privées des plans (`/api/plans`) et l’administration
(chemins d’administration localisés et `/api/admin/*`). Le catalogue public et
les médias restent publics. Une configuration privée cassée échoue fermée, en
HTTP 503, sur ces chemins protégés.

## Transition du planificateur

La valeur localStorage `astro-portal:planner:v1` est conservée. Le planificateur
propose d’abord le choix entre invité et connexion : en invité, tout reste local
au navigateur. À la connexion d’un navigateur qui garde des plans d’invité, un
serveur vide les reçoit sans rien demander, un serveur qui contient déjà des
plans demande « Vous avez N plans dans ce navigateur. Les ajouter à votre
portail ? », et ce qui est emporté quitte le stockage du navigateur.
L’import est idempotent : un plan que le serveur a déjà n’est jamais envoyé
deux fois. Les changements sont ensuite persistés côté serveur.

Les modifications d’un plan connecté sont sauvegardées automatiquement côté
serveur pour le tenant authentifié ; l’indicateur discret est placé dans la
carte du plan et ne déplace pas l’éditeur. Chaque plan conserve aussi un
historique local annuler/rétablir pour son titre, ses éléments, son lieu, son
matériel et le contexte de hauteur minimale : il facilite l’édition mais ne
remplace pas un retour arrière d’audit en base. L’API ne mélange jamais les
tenants.

## Sauvegarde, restauration et migration PostgreSQL

Avant une migration réelle, arrêtez le service et créez une copie cohérente :

```bash
sqlite3 "$ASTRO_PORTAL_DATABASE_PATH" '.backup /private/backups/portal-YYYYMMDD.sqlite'
sqlite3 /private/backups/portal-YYYYMMDD.sqlite 'PRAGMA integrity_check'
```

Pour restaurer, gardez d’abord une copie du fichier défaillant, remplacez
uniquement le chemin de base configuré par la sauvegarde vérifiée puis vérifiez
`/api/auth/status`. Une migration PostgreSQL devra préserver les UUID et dates
UTC, comparer les comptes par tenant et valider les routes authentifiées dans
un candidat, sans jamais migrer la production durant le probe de release.
