# Journal des versions

Les changements notables de ce projet sont consignés dans ce fichier. Le
projet suit le versionnement sémantique.

## Non publié

- supprimer une capture, une image ou une session ne dépend plus de la réponse
  du stockage des captures : la suppression des fichiers (l’original, la
  miniature, la copie partagée) est une tâche écrite dans la même transaction
  que les lignes (`capture_file_deletions`, migration 110), tentée aussitôt et,
  quand le stockage échoue (un disque ou un conteneur Blob qui ne répond pas),
  reprise par le passage horaire, cinq minutes après le premier échec puis deux
  fois plus longtemps à chaque fois jusqu’à six heures ; la route répond `204`
  au lieu de `503 capture_storage_unavailable`, et les fichiers d’une image
  remplacée ou supprimée pendant son traitement suivent le même chemin. Un
  condensat qu’une image détient de nouveau n’est jamais supprimé par une
  tâche en retard. `scripts/captures-orphans.mjs` (lecture seule ; `--apply`
  supprime) et `GET /api/admin/captures/orphans` rapportent, espace par espace,
  les fichiers qu’aucune ligne ne détient, ceux qu’une suppression va retirer et
  les images dont le stockage n’a plus l’original ;
- un serveur privé se connecte par un code reçu par e-mail (`email-code`,
  envoyé par `smtp`, pour la seule adresse de son propriétaire) ou par adresse
  et mot de passe (`password`, avec des verrous par adresse et origine
  réseau) ; les codes de secours restent la voie de retour. `totp` disparaît :
  un serveur réglé ainsi ne démarre pas et dit quel mode choisir ;
  `ASTRO_PORTAL_TOTP_ENCRYPTION_KEY` est remplacée par
  `ASTRO_PORTAL_SIGN_IN_KEY` (docs/fr/PRIVATE_NOTEBOOK_AUTH.md) ;
- l’application mobile et Astro Sync se connectent à un serveur privé qui
  utilise des codes par e-mail (`spaceCreation: "closed"`) avec les mots d’un
  portail d’une personne — « votre portail », la seule adresse du
  propriétaire, sans suppression d’espace — et l’analyse d’une nuit se
  calcule sur l’ordinateur ;
- fait de l’anglais la langue principale de la documentation ;
- conserve la documentation française complète dans `docs/fr/`.
- documente le planificateur privé optionnel : stockage local invité,
  persistance SQLite par tenant, connexion et récupération TOTP, sauvegarde
  automatique, import et annuler/rétablir local ;
- documente la frontière de release atomique sans données et les limites des
  liens sortants vers Stellarium Web.

## 1.0.1 — 2026-09-07

- inclut correctement les quatre illustrations synthétiques du catalogue de
  démonstration dans les clones du dépôt.

## 1.0.0 — 2026-09-07

- première version publique de la galerie et des fiches partageables ;
- gestion des variantes, progressions, cartes Stellarium et plate solving ;
- panneau d’informations responsive et vue image seule ;
- éditeur local de métadonnées protégé par adresse IP ;
- exemple M42 entièrement synthétique, documentation de déploiement et audit
  de confidentialité avant publication.
