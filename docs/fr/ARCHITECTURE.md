# Architecture

## Vue d’ensemble

```text
navigateur
   │
   ├── galerie et fiches Next.js
   ├── API catalogue ── scanner d’images + fiches JSON
   ├── routes média ─── originaux en lecture seule
   ├── API plate solve ─ Astrometry.net + HYG + cache WCS
   └── API admin ────── contrôle IP + écriture atomique JSON
```

Le serveur HTTP personnalisé ne remplace pas Next.js : il prépare l’application,
injecte l’adresse TCP fiable dans chaque requête, puis délègue au gestionnaire
Next. Ce mécanisme permet à l’administration de ne pas faire confiance à un
en-tête envoyé par le navigateur.

## Modules

Une implémentation, des coquilles minces. L’application — chaque route, page
et module serveur, et le démarrage du service — vit dans `packages/portal-app` ;
la composition open source (`apps/portal-oss`) est une mince coquille qui la
réexporte (`apps/portal-oss/tests/shell.test.mjs` vérifie que la coquille ne
contient rien d’autre).

- `packages/portal-app/src/routes/` : pages et routes d’API App Router, au
  chemin où les coquilles les servent ;
- `packages/portal-app/src/lib/config.server.js` : chemins et commandes ;
- `packages/portal-app/src/lib/catalog.server.js` : scan, association et
  enrichissement ;
- `packages/portal-app/src/lib/plate-solving.server.js` : exécution et cache
  WCS ;
- `packages/portal-app/src/lib/media.server.js` : streaming et protection
  TIFF ;
- `packages/portal-app/src/lib/admin.server.js` : règles d’adresse ;
- `packages/portal-app/src/lib/metadata-store.server.js` : lecture et écriture
  atomique ;
- `packages/portal-app/src/lib/service-extensions.js` : les points où une
  composition ajoute à l’application ;
- `packages/portal/src/persistence/migration-registry.ts` : les migrations qu’une
  composition ajoute à la chaîne du cœur, entières ou en complément d’une
  migration du cœur ;
- `packages/portal-app/src/server/start.js` : le démarrage du service ;
- `packages/portal/src/components/` : galerie, pages de détail, surimpression
  astrométrique, sessions, compte ;
- `packages/planner/` : le planificateur de nuit.

## Frontière des données

Le code ne connaît aucune cible particulière. Les tags, instruments, objets,
variantes, cartes et indices de résolution viennent du JSON. Les seules données
versionnées sont les illustrations synthétiques de `examples/`.

Les routes média valident chaque chemin résolu contre sa racine avant d’ouvrir
le fichier. Les données sont diffusées en flux et ne transitent pas par un
encodeur d’image.

## État côté navigateur

La cible et la version sont portées par l’URL. Les préférences temporaires
(position de galerie et panneau rétracté) utilisent `sessionStorage`. Elles ne
contiennent ni métadonnée ni secret.
