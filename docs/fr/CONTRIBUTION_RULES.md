# Règles des contributions

Astro Portal peut garder, avec le consentement explicite de l’observateur,
quelques valeurs anonymisées qui aident le projet à améliorer ses propres
modèles. Cette page est l’unique ensemble de règles que suit chacune de ces
contributions. Elle commence par le **jeu de calibration du fond de ciel** du
projet ; les contributions suivantes (métriques de session et diagnostics
confirmés) étendent ces règles et ne les relâchent jamais.

[English version](../CONTRIBUTION_RULES.md)

## Les règles, pour toute contribution

1. **Strictement sur consentement.** Rien n’est gardé tant que l’observateur
   ne l’active pas, à un seul endroit : la section de son espace. Ce n’est
   jamais demandé dans une fenêtre surgissante ni pendant une tâche, et c’est
   désactivé par défaut.
2. **Anonymisé avant de quitter l’endroit qui le détient.** Une contribution
   ne porte jamais un lieu d’observation ni ses coordonnées, un chemin de
   fichier, un nom, une adresse, un numéro de série, des données EXIF, ni un
   identifiant de compte, de personne ou d’appareil. L’équipement n’est gardé
   que par classe (focale, échantillonnage, type de monture), et seulement
   quand il compte.
3. **Une liste fermée de champs.** Chaque sorte de contribution nomme tout ce
   qu’elle garde (plus bas) ; tout autre champ est refusé, et une seconde liste
   de noms interdits (`FORBIDDEN_CONTRIBUTION_FIELDS`,
   `packages/portal/src/calibration/contribution-record.js`) est vérifiée sur
   chaque fiche et sur chaque fichier exporté.
4. **Révocable.** L’observateur peut se retirer à tout moment : ce qui n’a pas
   encore été publié est effacé tout de suite. **Une version déjà publiée ne
   peut pas être rappelée**, et le texte du consentement le dit avant que
   l’interrupteur soit activé.
5. **Une licence claire, annoncée avant la première publication.** Les données
   publiées sont sous **CC BY 4.0** (attribution, usage commercial permis,
   sans partage à l’identique ; jamais une licence non commerciale ni ODbL),
   écrite dans chaque fiche et nommée dans le texte du consentement ; l’export
   refuse une fiche qui en nomme une autre.
6. **Des publications relues et versionnées.** Les mainteneurs relisent chaque
   publication avant de la publier. Chacune a une version et une fiche qui dit
   ce qu’elle contient, comment elle a été faite et sous quelle licence.
7. **Jamais depuis un serveur privé.** Un serveur privé garde ses données pour
   lui : il ne propose aucun consentement et n’envoie rien nulle part. Les
   contributions n’existent que sur le service hébergé.
8. **Ni récompense ni classement.** Rien n’est montré aux autres : pas de
   classement, pas de compteur, pas de badge.

## Le jeu de calibration du fond de ciel

À quoi il sert : l’estimation de la qualité du ciel change une radiance
satellite en luminosité du ciel avec une constante par région
([SKY_QUALITY_RASTER.md](SKY_QUALITY_RASTER.md)). Les valeurs que les
observateurs mesurent ou saisissent sont la meilleure preuve qui soit pour
réajuster ces constantes ; avec leur accord, le projet les garde, sans aucun
lieu, dans un jeu qui lui appartient — sans licence tierce.

### La fiche (tout ce qui est gardé)

| Champ           | Ce que c’est                                                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`          | `measured` (la valeur de la nuit qu’Astro Sync a mesurée sur les poses de l’observateur) ou `entered` (la valeur saisie dans le formulaire d’un lieu)                               |
| `sqm`           | La valeur, en mag/arcsec², au centième                                                                                                                                              |
| `band`          | `camera` pour une valeur mesurée, `sqm` pour une valeur saisie (lecture d’un sky-mètre) ; les deux bandes diffèrent d’un écart systématique, d’où la bande gardée                   |
| `radianceLevel` | Le niveau du raster de qualité du ciel, sur son propre codage logarithmique à 256 niveaux (0–255), de la cellule où tombe le lieu : jamais la radiance brute, jamais une coordonnée |
| `region`        | La région de calibration du lieu (`japan`, …), `global` hors de toute région                                                                                                        |
| `year`          | L’année de la nuit (mesurée) ou de la saisie (saisie) ; jamais le mois ni le jour                                                                                                   |
| `methodVersion` | La méthode de mesure (`astro-sync-sky/1`) pour une valeur mesurée ; `null` pour une valeur saisie                                                                                   |

La fiche est construite sur le service à partir de la valeur enregistrée et du
lieu, puis le lieu est oublié. Un niveau de radiance et une région sont
grossiers à dessein : assez pour réajuster une constante régionale, jamais
assez pour retrouver un lieu.

### Comment c’est rangé

- `calibration_contributions` contient les fiches et une clé de ligne
  aléatoire, et **aucune colonne qui renvoie à un espace, une personne, un lieu
  ou un appareil**.
- `calibration_ledger` relie un espace à ses clés de ligne. C’est le seul lien,
  et il sert à deux choses : le retrait, et le remplacement de la ligne d’une
  valeur que l’observateur a changée. Il n’est jamais exporté.
- Le consentement est gardé par espace, avec sa date.

### Quand une valeur est gardée, remplacée ou effacée

- Activer le consentement garde les valeurs que l’espace détient déjà (chaque
  nuit mesurée dans un lieu, et la valeur saisie de chaque lieu).
- Tant qu’il est activé, une valeur nouvelle ou changée est gardée, et une
  valeur changée remplace sa ligne ; une valeur que l’observateur retire (ou
  dont il supprime le lieu) sort du jeu.
- Le désactiver arrête les nouvelles contributions ; ce qui est déjà gardé le
  reste jusqu’à ce que l’observateur le retire.
- « Retirer mes contributions » efface les lignes et le registre de l’espace,
  et désactive le consentement. Supprimer l’espace fait de même.
- Les sauvegardes gardent les lignes jusqu’à leur expiration, comme le reste
  de l’espace.
- Une valeur dont le lieu n’a pas de cellule dans le raster de qualité du ciel
  (aucun raster installé, une position hors de lui) n’est pas gardée.

### Publications

Une publication est un fichier versionné des fiches (sans clés de ligne ni
registre, lignes dans un ordre aléatoire) accompagné d’une fiche du jeu de
données. La licence est CC BY 4.0 : la fiche la porte, une fiche absente ou au
champ vide la reçoit, et une fiche qui en nomme une autre est refusée.
L’export vérifie sa propre sortie contre la liste fermée des champs et les noms
interdits avant d’écrire quoi que ce soit. Un mainteneur relit le fichier et la
fiche avant de les publier.
