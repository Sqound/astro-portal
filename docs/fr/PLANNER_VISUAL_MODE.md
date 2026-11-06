# Mode visuel et images de cadrage du planificateur

Le planificateur propose deux modes de présentation :

- **Photo** prépare une session d’imagerie et présente les images photographiques des cibles.
- **Visuel** prépare une session à l’oculaire. Il présente une référence visuelle disponible ; sinon il conserve volontairement la référence photographique au lieu de laisser une carte vide.

Le mode visuel est une aide à l’observation. Un relevé ou un croquis peut aider à comprendre la structure et l’orientation d’un objet, mais ne prédit pas son apparence à l’oculaire. Cette apparence dépend encore de l’ouverture, de la pupille de sortie, de la brillance du ciel, de la transparence, du filtre, du grossissement et de l’observateur.

## Variantes d’image de cible

Les données d’images de la bibliothèque de cibles restent dans le runtime privé. Les assets photographiques et visuels sont séparés volontairement :

| Variante           | Manifeste                      | Route des assets                             | Rôle                                                  |
| ------------------ | ------------------------------ | -------------------------------------------- | ----------------------------------------------------- |
| Photo sélectionnée | **curated-photo-images.json**  | /target-library-curated-images/{file}        | Photographie éditoriale de qualité avec droits suivis |
| Fallback photo DSS | **images.json**                | /target-library-images/{file}                | Couverture photographique du catalogue complet        |
| Référence visuelle | **visual-images.json**         | /target-library-visual-images/{file}         | Croquis ou référence avec droits suivis               |
| Aperçu visuel      | **visual-preview-images.json** | /target-library-visual-preview-images/{file} | Aperçu DSS généré, gris et adouci                     |

L’API de bibliothèque expose les URL résolues photoThumbnailUrl,
visualThumbnailUrl et visualPreviewThumbnailUrl, ainsi que dssThumbnailUrl et
premiumThumbnailUrl pour la comparaison administrative. Le crédit visuel actif
suit le même ordre de priorité. Le champ historique thumbnailUrl reste l’URL
photographique résolue pour les appelants existants.

| Mode du planificateur | Images enregistrées                 | Résultat                              |
| --------------------- | ----------------------------------- | ------------------------------------- |
| Photo                 | Photo sélectionnée                  | Image photographique sélectionnée     |
| Photo                 | Pas de photo sélectionnée           | Fallback photographique DSS           |
| Visuel                | Référence visuelle autorisée        | Référence et son crédit propre        |
| Visuel                | Pas de référence, aperçu disponible | Aperçu généré et adouci               |
| Visuel                | Aucun asset visuel                  | Photo sélectionnée, puis fallback DSS |

Cette règle s’applique aux cartes de cibles recommandées, du catalogue, de l’aperçu de cible sur la carte et du planning. L’agrandissement au survol de la vignette du catalogue utilise la même image résolue que la vignette normale.

Chaque entrée de manifeste peut contenir un court crédit, ainsi que la source et les détails de licence. Le crédit est posé sur la vignette lorsqu’il existe ; le catalogue affiche aussi l’attribution globale du manifeste. Un asset visuel doit conserver sa source et sa licence. La couche complète d’aperçus visuels est créée à partir des images DSS locales : niveaux de gris, luminosité à 58 % et contraste à −15 %. C’est une simulation orientée observation, pas un croquis à l’oculaire. Ne pas ajouter de croquis ou photographies tiers sans droits qui permettent explicitement cet usage.

### Fiches de référence préparées

L’administration peut préparer une fiche de référence visuelle avant que son
fichier local soit disponible. L’éditeur de cible conserve alors le nom de
fichier attendu, la source, le crédit et la licence, sans modifier le mode
visuel. Un fichier tiers préparé suit sa désignation de catalogue :
`Messier-79-sketch-s.jpg` pour M79 et `NGC40-sketch-s.jpg` pour NGC 40. Le
service vérifie la présence de ce nom précis dans le répertoire privé
`visual-images/` avant d’exposer l’image. Tant que le fichier n’existe pas, le
catalogue utilise son fallback d’aperçu visuel ou photo et n’affiche jamais de
vignette cassée.

#### Contrat d’une fiche de référence

Une fiche préparée est une métadonnée : elle ne prouve ni l’existence d’une
licence ni le téléchargement d’un fichier. L’éditeur conserve ces valeurs avec
la cible :

| Champ                    | Rôle                                                                        |
| ------------------------ | --------------------------------------------------------------------------- |
| `file`                   | Nom local exact attendu.                                                    |
| `source` / `sourceUrl`   | Source nommée et page de l’objet.                                           |
| `assetUrl`               | Asset d’origine ou page source lorsqu’aucune URL directe n’est conservée.   |
| `credit`                 | Crédit affiché lorsqu’une référence visuelle devient active.                |
| `license` / `licenseUrl` | Statut de réutilisation et conditions de référence.                         |
| `availability`           | État éditorial tel que `awaiting-file` ; ce champ n’accorde aucune licence. |

Les noms de fichiers préparés sont volontairement restreints et ne peuvent pas
contenir de séparateur de chemin :

| Catalogue | Exemple de fichier        |
| --------- | ------------------------- |
| Messier   | `Messier-79-sketch-s.jpg` |
| NGC       | `NGC40-sketch-s.jpg`      |
| IC        | `IC418-sketch-s.jpg`      |
| Barnard   | `Barnard-33-sketch-s.jpg` |

La route d’image n’accepte que ces noms, auxquels s’ajoutent les anciens noms
générés `visual-openngc-*` et `visual-barnard-*`, puis limite encore toute
lecture au répertoire privé des images visuelles.

#### Références Deep Sky Watch

Les références Deep Sky Watch sont préparées à partir de l’index public de Deep
Sky Watch : ses désignations sont associées au catalogue local et seules les
métadonnées de référence sont écrites dans la base privée des cibles. Aucune
image n’est demandée, téléchargée, transformée ni copiée. À la préparation, la
fiche indique que l’œuvre est protégée, crédite Michael Vlasov /
DeepSkyWatch.com et rappelle qu’une autorisation écrite est nécessaire.

L’export statique embarque uniquement les métadonnées du catalogue ; il
n’embarque jamais les fichiers images. Relancer la préparation est idempotent
pour une même source et ne remplace pas une autre référence visuelle existante.

#### Activation et vérification

Après obtention d’une autorisation écrite couvrant l’usage prévu seulement,
placer le fichier original ou le dérivé permis dans le répertoire privé
`target-library/visual-images/`, sous le nom exact du champ `file` de la
fiche. Une modification de ce répertoire fait partie de la révision de cache
du catalogue : la référence s’active donc sans modification du code ni
réécriture de la base.

Vérifier les deux états sur la release réellement servie :

1. Avant la présence du fichier, l’admin conserve les champs de la référence,
   mais `visualThumbnailUrl` est `null` et le fallback aperçu visuel/photo est
   affiché.
2. Après l’ajout du fichier autorisé au nom correct, `visualThumbnailUrl`
   utilise `/target-library-visual-images/<file>` et le crédit propre à
   l’image est visible.
3. Contrôler que la page source, le crédit et la licence de l’éditeur de cible
   correspondent bien à l’autorisation ou à la licence obtenue.

La première collection de photos sélectionnées utilise l’archive publique NSF
NOIRLab. Son import ne récupère que la sélection éditoriale versionnée, copie
un dérivé local de qualité publication et enregistre la page source, le crédit
complet, l’URL de l’asset et la licence CC BY 4.0 dans le manifeste privé. Il
n’écrase jamais le répertoire DSS.

## Aperçus de cadrage

« Utiliser ce cadrage » enregistre le centre J2000 exact et le champ du matériel sélectionné. L’action conserve aussi un aperçu HiPS généré afin de reconnaître un cadrage sauvegardé dans l’onglet **Cadrages**, puis dans un plan.

| Mode au moment de la création | Source HiPS de l’aperçu sauvegardé |
| ----------------------------- | ---------------------------------- |
| Photo                         | CDS/P/DSS2/color                   |
| Visuel                        | CDS/P/DSS2/red                     |

Un cadrage existant conserve donc l’aperçu avec lequel il a été créé. Changer de mode ensuite ne réécrit pas les données du cadrage et ne remplace pas son image.

## Carte Stellarium embarquée

La carte interactive utilise d’abord un relevé d’orientation large, puis passe à un relevé détaillé lorsque le champ est **inférieur ou égal à 18°** :

| État de la carte      | Mode photo              | Mode visuel             |
| --------------------- | ----------------------- | ----------------------- |
| Orientation large     | Relevé couleur CTA-FRAM | Relevé couleur CTA-FRAM |
| Fond détaillé (≤ 18°) | DSS couleur             | DSS2 rouge monochrome   |

La couche visuelle détaillée est le relevé HiPS DSS2 rouge monochrome, et non un filtre CSS appliqué à l’ensemble du canvas. Les anneaux de cible, le champ du matériel, les contrôles, les constellations et la grille de coordonnées restent lisibles et fonctionnels. Le crédit de la carte suit le relevé affiché. La fiche du registre pour [DSS2 Red](https://alasky.cds.unistra.fr/MocServer/query?ID=CDS%2FP%2FDSS2%2Fred&fmt=html&get=record) conserve sa provenance et ses conditions d’utilisation.

## Contrat des gestes tactiles

Le viewport du navigateur reste nativement à l’échelle 1. Le document permet le défilement normal mais ne propose pas de zoom navigateur par pincement. Cette règle repose sur les métadonnées du viewport et sur touch-action, sans écouteur JavaScript global.

La carte est l’exception locale intentionnelle :

- son conteneur complet, y compris overlays et contrôles, possède les gestes tactiles ;
- un pincement dans ce conteneur modifie seulement le champ de Stellarium ;
- un pincement ne doit jamais être transmis au navigateur comme zoom de page ;
- la remise à zéro ramène la carte à son champ normal sans modifier la cible sélectionnée.

Conserver touch-action: none sur le conteneur de carte lors de toute évolution de son markup ou de ses calques z-index. Le poser seulement sur le canvas ne suffit pas : un geste qui commence sur un contrôle ou un overlay pourrait sinon être interprété par le navigateur.

## Checklist de vérification

Après une modification de cette zone, vérifier sur la release réellement servie :

1. Le mode photo affiche une image de cible photographique.
2. Le mode visuel choisit une image visuelle enregistrée, puis retombe sur la photo.
3. Un cadrage créé en visuel possède un aperçu DSS2 rouge monochrome ; un cadrage photo reste en couleur.
4. À 18° ou moins, le crédit et le fond raster de la carte changent avec le mode, sans masquer les overlays.
5. Sur un vrai viewport mobile, un pincement dans la carte ne change que son échelle ; un pincement hors carte ne doit jamais agrandir la page. Tester un geste qui commence près d’un contrôle, comme un geste dans une zone de ciel vide.
