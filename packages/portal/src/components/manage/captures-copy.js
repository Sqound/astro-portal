import { copyFor } from "astro-contracts/locales";
import { hostedCopy } from "./hosted-copy.js";

/**
 * The words of the tab « Captures » of « Mon espace »
 * The French is the approved wording, to the character — with an ordinary
 * space before « : », as drawn; the other languages say the same thing in
 * the register of their catalogue. « Galerie privée » and « galerie
 * publique » name the two galleries; « portail » never does.
 *
 * Dates and numbers are formatted by the page (`captures-format.js`); a
 * function here receives them already written.
 */
const fr = {
  title: "Captures",
  help: "Privée : dans votre galerie privée seulement. Publique : aussi dans la galerie publique.",
  infoLabel: "Privée, publique : ce que cela change",
  usage: (count, limit) =>
    `${count} capture${count > 1 ? "s" : ""} sur ${limit}`,
  // The free space says it is a limit.
  // The read-only window says so instead of « Espace gratuit ».
  add: "Ajouter une capture",
  open: "Ouvrir la capture",
  // The title of a capture that has no target.
  noTarget: "Capture sans titre",
  night: (date) => `Nuit du ${date}`,
  added: (date) => `Ajoutée le ${date}`,
  visibility: "Visibilité",
  private: "Privée",
  public: "Publique",
  // « Publique depuis le … » of the capture's sheet; the date
  // arrives written, `publicSinceUnknown` when it was never kept.
  publicSince: (date) => `Publique depuis le ${date}`,
  publicSinceUnknown: "Publique, date inconnue",
  noImageShort: "Sans image",
  noImage:
    "Aucune image pour l’instant : envoyez-les depuis Astro Sync ou ajoutez-en ici.",
  addImage: "Ajouter une image",
  publishNoImage:
    "Sans image, la capture ne peut pas être rendue publique : ajoutez-en une d’abord.",
  targetZone: "Cible",
  targetNone: "Aucune cible pour l’instant.",
  targetAdd: "Ajouter une cible",
  targetChoose: "Choisir une cible",
  targetChange: (d) => `Changer ${d}`,
  targetRemove: (d) => `Retirer ${d}`,
  targetCancel: "Annuler",
  createWithoutImage: "Créer la capture sans image",
  definitionFailed: "La capture n’a pas pu être créée. Réessayez plus tard.",
  definitionName: "La capture",
  notShowable:
    "Ce fichier ne peut pas être montré dans la galerie publique : seules les images peuvent être publiques.",
  quotaTitle: (file) =>
    `${file} n’a pas été ajoutée : votre espace n’a plus de place pour elle.`,
  tooLargeTitle: (file) =>
    `${file} n’a pas été ajoutée : le fichier est trop lourd pour votre espace.`,
  contentRefusedTitle: (file) =>
    `${file} n’a pas été ajoutée : ce type de fichier n’est pas accepté.`,
  uploadFailedTitle: (file) => `${file} n’a pas été ajoutée.`,
  tryLater: "Réessayez dans un moment.",
  emptyTitle: "Aucune capture pour l’instant",
  emptyBody:
    "Elles arrivent par Astro Sync depuis votre ordinateur, par PlanAstro sur votre téléphone, ou par cette page.",
  retired: "Retirée de la galerie publique.",
  allCaptures: "Toutes les captures",
  captureLabel: (title) => `Capture ${title}`,
  alreadyVisible: "Déjà visible dans la galerie publique.",
  equipment: "Matériel",
  month: "Mois de la nuit",
  monthPlan: "Mois des nuits",
  sky: "Qualité du ciel",
  place: "Lieu",
  placeValue: (name) => `${name} (jamais publié)`,
  bortle: (value) => `Bortle ${value}`,
  tags: "Tags",
  tagsHelp:
    "Séparés par des virgules. Visibles dans votre galerie privée seulement.",
  tagsBounds: "40 caractères au plus par tag, 20 tags au plus par capture.",
  saveTags: "Enregistrer les tags",
  deleteCapture: "Supprimer la capture",
  deleteTitle: (title) => `Supprimer « ${title} » ?`,
  deleteBody: "La capture et son fichier sont effacés de votre espace.",
  publishTitle: "Rendre cette capture publique ?",
  publishIntro: "Elle apparaîtra dans la galerie publique, avec :",
  publishImage: "l’image",
  publishTarget: (designation) => `la cible : ${designation}`,
  publishEquipment: "le matériel",
  publishMonth: (month) => `le mois de la nuit : ${month}`,
  publishMonths: (months) => `les mois des nuits : ${months}`,
  publishSky: "la qualité du ciel",
  publishNoPlace:
    "Ni le lieu, ni ses coordonnées : la position est aussi retirée du fichier publié.",
  // A server with no team: its owner decides alone (the three lines of the
  // tab).
  ruleDecide:
    "Vous décidez seul de ce qui est public, et vous pouvez repasser une capture en privé à tout moment.",
  rulePublic: "Une capture publique est visible de tous, sans connexion.",
  ruleResponsible:
    "Personne d’autre sur ce serveur ne vérifie ce que vous publiez. Vous en êtes responsable.",
  publishConfirm: "Rendre publique",
  cancel: "Annuler",
  close: "Fermer",
  loading: "Chargement de vos captures…",
  loadFailed:
    "La liste de vos captures n’a pas pu être lue. Réessayez plus tard.",
  notFound: "Cette capture n’est plus dans votre espace.",
  retry: "Réessayer",
  changeFailed: "La capture n’a pas pu être modifiée. Réessayez plus tard.",
  syncNothing: "Rien de nouveau à reprendre.",
  syncDone: "Les lignes sont à jour.",
  viewLabel: "Affichage",
  listView: "Liste",
  mapView: "Carte",
  allChip: "Toutes",
  searchTarget: "Rechercher une cible",
  reverseSort: "Inverser le tri par date",
  newestFirst: "Plus récentes",
  oldestFirst: "Plus anciennes",
  counter: (captures, targets) =>
    `${captures} capture${captures > 1 ? "s" : ""} · ${targets} cible${targets > 1 ? "s" : ""}`,
  noMatch: "Aucune capture ne correspond à ce filtre.",
  storageUsed: (used, quota) => `${used} utilisés sur ${quota}`,
  storageUsedAlone: (used) => `${used} utilisés`,
  storageIncluded: "Inclus",
  storageLeft: (left) => `Il reste ${left}`,
  storageInfo:
    "Les copies montrées dans les galeries et les miniatures ne comptent pas : seuls vos originaux comptent.",
  storageInfoLabel: "Espace utilisé : ce que cela change",
  variantsInfoLabel: "Variantes d’une capture : ce que cela change",
  messageInfoLabel:
    "Visibilité de l’ancienne et de la nouvelle image principale",
  storageFull:
    "Votre espace est plein : une nouvelle capture ne peut pas y entrer.",
  integration: (duration) => `Intégration ${duration}`,
  integrationUnknown: "Intégration non notée",
  stageDraft: "Brouillon",
  archived: "Archivée",
  stageFinalized: "Finalisée",
  personal: "Cible personnelle",
  fileZone: "Fichier",
  downloadOriginal: (kind, size) =>
    `Télécharger l’original (${[kind, size].filter(Boolean).join(", ")})`,
  fileSent: "Le fichier que vous avez envoyé, sans changement.",
  fileMain: "Le fichier de l’image principale, sans changement.",
  fileInfo:
    "C’est le fichier tel qu’il a été envoyé, avec ses métadonnées. Les galeries n’en montrent qu’une copie, sans la position, et ne proposent jamais de téléchargement.",
  addVariant: "Ajouter une variante",
  stateZone: "État",
  draftLine: "Brouillon : la capture n’est pas encore finalisée.",
  finalize: "Finaliser cette capture",
  draftBanner:
    "Brouillon : cette capture n’apparaît pas encore dans votre galerie privée.",
  draftBannerHint:
    "Finalisez-la quand elle est prête : elle apparaîtra alors dans votre galerie privée, et vous pourrez la rendre publique.",
  finalized: "Finalisée.",
  finalizedOn: (day) => `Finalisée le ${day}.`,
  finalizeFirst: "Finalisez la capture pour pouvoir la rendre publique.",
  makePublic: "Rendre publique",
  draftInfo:
    "Une capture envoyée par le téléphone ou par Astro Sync arrive en brouillon. Finalisez-la quand elle est prête : elle pourra alors devenir publique.",
  skyZone: "Plate solving",
  skyProvenance: {
    "astro-sync": (date) =>
      `Solution de ciel : calculée par Astro Sync le ${date}.`,
    "astrometry-net": (date) =>
      `Solution de ciel : calculée avec astrometry.net le ${date}.`,
    import: (date) => `Solution de ciel : reprise de l’import le ${date}.`,
  },
  skyShow: "Afficher le plate solving",
  skyOn: "La galerie propose les annotations de cette capture.",
  skyOff: "La galerie ne propose pas les annotations de cette capture.",
  skyNone:
    "Cette image n’a pas de solution de ciel : les annotations ne peuvent pas être dessinées.",
  skyInfoLabel: "Plate solving : ce que cela change",
  skyInfo:
    "Une solution de ciel dit où se trouve l’image dans le ciel. Avec elle, la galerie peut dessiner sur l’image le nom de la cible, des objets proches et des étoiles, que le visiteur affiche ou masque. Éteindre ce choix retire ces annotations de la galerie ; la solution reste stockée.",
  skyInfoNone:
    "Une solution de ciel dit où se trouve l’image dans le ciel ; sans elle, les annotations ne peuvent pas être dessinées. Astro Sync, l’application de bureau, la calcule sur votre ordinateur à partir de l’image et l’envoie ici : téléchargez l’application depuis la page de téléchargement du site, puis ouvrez « Annotations » et résolvez cette capture.",
  skyAstroSync: "Résoudre dans Astro Sync",
  skyServer: "Résoudre sur ce serveur",
  skyRunning: "Résolution en cours…",
  skyFailed: {
    not_solved:
      "Trop peu d’étoiles reconnues, ou champ hors des index installés.",
    unreadable_solution: "Le résultat de la résolution n’a pas pu être lu.",
    not_started: "L’outil de résolution du serveur ne démarre pas.",
    image_changed: "L’image a changé pendant la résolution.",
    sky_solution_aspect_mismatch:
      "Le résultat ne correspond pas aux proportions de l’image.",
    other: "La résolution n’a pas abouti.",
  },
  deleteBodyImages: (count) =>
    `La capture et ses ${count} images sont effacées de votre espace, avec leurs fichiers.`,
  freed: (size) => `${size} sont libérés.`,
  variantsZone: "Variantes",
  variantsPending:
    "Une nouvelle variante est arrivée : elle est privée, l’image principale n’a pas changé.",
  variantsCount: (count) =>
    `${count} images. La galerie privée montre toutes les images ; la galerie publique, l’image principale puis les variantes publiques.`,
  variantsInfo:
    "Une nouvelle image envoyée pour la même capture s’ajoute ici, en variante privée. L’image principale ne change que si vous en choisissez une autre. Une variante n’est publique que si la capture l’est. Toutes les images comptent dans l’espace utilisé.",
  mainPill: "Principale",
  variantPill: "Variante",
  // « Progression de la nuit », the milestones of the night.
  progressionZone: "Progression de la nuit",
  progressionLine:
    "Les jalons qu’Astro Sync a empilés pendant la nuit, de la première pose à toutes. Ils sont montrés avec la capture dans les galeries et ne comptent pas parmi les variantes.",
  progressionFrames: (count) => `${count} pose${count > 1 ? "s" : ""}`,
  progressionStep: (index, count) =>
    count
      ? `Jalon ${index} — ${count} pose${count > 1 ? "s" : ""}`
      : `Jalon ${index}`,
  // The image of a multi-night plan: its stacked image after each night.
  progressionPlanZone: "Progression de l’empilement",
  progressionPlanLine:
    "Le cumul de l’image après chaque nuit, de la première nuit à l’image finale. Elles sont montrées avec la capture dans les galeries et ne comptent pas parmi les variantes.",
  progressionPlanStep: (index, count) =>
    count
      ? `Après la nuit ${index} — ${count} pose${count > 1 ? "s" : ""}`
      : `Après la nuit ${index}`,
  editNames: "Modifier le titre et la description",
  titleLabel: "Titre",
  titleHelp: (fallback) => `Facultatif. À défaut : « ${fallback} ».`,
  descriptionLabel: "Description",
  descriptionHelp:
    "Facultative. Elle s’affiche sous l’image, dans la galerie, si la variante est publique.",
  mainDescriptionHelp:
    "Facultative. Elle s’affiche sous l’image, dans la galerie, si la capture est publique.",
  textCount: (count, max) => `${count} / ${max}`,
  textTooLong: (max) => `${max} caractères au plus.`,
  saveTitle: "Enregistrer le titre",
  saveDescription: "Enregistrer la description",
  sources: {
    phone: "Téléphone",
    web: "Web",
    "astro-sync": "Astro Sync",
    stacking: "Astro Sync · empilement",
  },
  digest: (short) => `SHA-256 ${short}`,
  makeVariantPublic: "Rendre cette variante publique",
  deleteVariant: "Supprimer cette variante",
  useAsMain: "Utiliser comme image principale",
  deleteMain: "Supprimer l’image principale",
  deleteMainRefused:
    "Choisissez d’abord une autre image principale : l’image principale ne se supprime pas seule.",
  useAsMainTitle: "Utiliser comme image principale ?",
  useAsMainBody: (name, file, size, target) =>
    `La variante « ${name} » (${file}, ${size}) deviendra l’image principale de ${target} : c’est elle que la galerie montrera en premier.`,
  becomesPublic:
    "Cette variante est privée : comme image principale, elle sera publique, comme la capture.",
  becomesPublicInfo: (name, file) =>
    `L’image principale actuelle (« ${name} », ${file}) devient une variante et reste publique. La visibilité de l’image principale est toujours celle de la capture.`,
  mainChosenPublic: (chosen, former) =>
    `${chosen} est devenue l’image principale, donc publique comme la capture ; ${former} reste publique, en variante.`,
  mainChosen: (chosen, former, isPublic) =>
    `${chosen} est devenue l’image principale ; ${former} reste ${isPublic ? "publique" : "privée"}, en variante.`,
  deleteVariantTitle: "Supprimer cette variante ?",
  deleteVariantBody: (name, file, source, when, size) =>
    `La variante « ${name} » (${[file, source, when, size].filter(Boolean).join(", ")}) sera supprimée de votre espace, avec son fichier.`,
  deleteVariantPublic: "Elle disparaît aussi de la galerie publique.",
  deleteVariantKeeps: (size) =>
    `L’image principale et la capture ne changent pas. ${size} sont libérés.`,
  addTitle: "Ajouter une capture",
  addTo: (designation) => `Ajouter à ${designation}`,
  steps: { night: "Nuit", target: "Cible", image: "Image" },
  stepsLabel: "Étapes",
  nightTargets: (place, count) =>
    [
      place,
      `${count} cible${count > 1 ? "s" : ""} observée${count > 1 ? "s" : ""}`,
    ]
      .filter(Boolean)
      .join(" · "),
  outcomes: { done: "Faite", partial: "Partielle" },
  captureCount: (count) => `${count} capture${count > 1 ? "s" : ""}`,
  notInCatalogue: "Une cible qui n’est pas au catalogue",
  searchNoResult: "Aucune cible du catalogue ne correspond.",
  back: "Retour",
  dropHere: "Glissez l’image ici",
  chooseFile: "Choisir un fichier",
  addedAsDraft: "Elle sera ajoutée en brouillon, privée.",
  nightLabel: "Nuit",
  integrationLabel: "Intégration",
  newTarget: "Nouvelle cible",
  nameLabel: "Nom",
  nameFromFile: "Proposé d’après le nom du fichier.",
  placeLabel: "Lieu",
  placeNearest: "Lieu enregistré le plus proche de la photo.",
  dateLabel: "Date",
  alreadyPresent: (file) =>
    `${file} est déjà dans votre espace : rien n’a été envoyé.`,
  checking: "Vérification du fichier…",
  targetFailed: "La cible n’a pas pu être créée. Réessayez plus tard.",
  nightsLoading: "Chargement de vos nuits…",
  // The add box's step « Rangement ».
  stepFiling: "Rangement",
  filingChange: "Changer",
  filingEdit: "Modifier",
  filingTitle: (count) =>
    count > 1
      ? "Ces captures seront rangées dans leurs sessions"
      : "Cette capture sera rangée dans une session",
  filingFromPhoto: (date, time) => `D’après la photo · ${date}, ${time}`,
  filingNoExif:
    "Cette image ne porte ni date ni position : changez la nuit si c’est une autre.",
  filingNightAssumed: (date) => `Nuit du ${date} · supposée`,
  filingPlace: (name) => `Lieu : ${name}`,
  filingPlaceCurrent: "Lieu courant",
  filingPlacePhoto: "Position de la photo",
  filingTarget: (name) => `Cible : ${name}`,
  filingTargetNone: "Cible : à préciser",
  filingTargetFromFile: "D’après le nom du fichier",
  filingTargetClear: "Laisser la cible à préciser",
  filingNewTargetUse: "Utiliser ce nom",
  filingExistsTitle: "Cette nuit a déjà une session",
  filingAttachAsk: (day) => `Rattacher à la nuit du ${day} ?`,
  filingAttachChoice: (date) => `Rattacher à la session du ${date}`,
  filingCreateChoice: "Créer une nouvelle session",
  filingCreateAndSend: "Créer la session et envoyer",
  filingCreateManyAndSend: (n) => `Créer ${n} sessions et envoyer`,
  filingAttachAndSend: (day) => `Rattacher à la nuit du ${day} et envoyer`,
  filingSendAll: "Ranger et envoyer",
  filingPickExisting: "Choisir une session existante",
  // A public capture also leaves the public gallery when deleted.
  deletePublicNote: "Elle quitte aussi la galerie publique.",
};

const en = {
  title: "Captures",
  help: "Private: in your private gallery only. Public: also in the public gallery.",
  infoLabel: "Private, public: what changes",
  usage: (count, limit) => `${count} of ${limit} captures`,
  // The free space says it is a limit.
  add: "Add a capture",
  open: "Open the capture",
  // The title of a capture that has no target.
  noTarget: "Untitled capture",
  night: (date) => `Night of ${date}`,
  added: (date) => `Added on ${date}`,
  visibility: "Visibility",
  private: "Private",
  public: "Public",
  publicSince: (date) => `Public since ${date}`,
  publicSinceUnknown: "Public, date unknown",
  noImageShort: "No image",
  noImage: "No image yet: send them from Astro Sync or add one here.",
  addImage: "Add an image",
  publishNoImage:
    "A capture without an image cannot be made public: add one first.",
  targetZone: "Target",
  targetNone: "No target yet.",
  targetAdd: "Add a target",
  targetChoose: "Choose a target",
  targetChange: (d) => `Change ${d}`,
  targetRemove: (d) => `Remove ${d}`,
  targetCancel: "Cancel",
  createWithoutImage: "Create the capture without an image",
  definitionFailed: "The capture could not be created. Try again later.",
  definitionName: "The capture",
  notShowable:
    "This file cannot be shown in the public gallery: only images can be public.",
  quotaTitle: (file) =>
    `${file} was not added: your space has no room left for it.`,
  tooLargeTitle: (file) =>
    `${file} was not added: the file is too large for your space.`,
  contentRefusedTitle: (file) =>
    `${file} was not added: this type of file is not accepted.`,
  uploadFailedTitle: (file) => `${file} was not added.`,
  tryLater: "Try again in a moment.",
  emptyTitle: "No capture yet",
  emptyBody:
    "They arrive through Astro Sync from your computer, through PlanAstro on your phone, or through this page.",
  retired: "Removed from the public gallery.",
  allCaptures: "All captures",
  captureLabel: (title) => `Capture ${title}`,
  alreadyVisible: "Already visible in the public gallery.",
  equipment: "Equipment",
  month: "Month of the night",
  monthPlan: "Months of the nights",
  sky: "Sky quality",
  place: "Place",
  placeValue: (name) => `${name} (never published)`,
  bortle: (value) => `Bortle ${value}`,
  tags: "Tags",
  tagsHelp: "Separated by commas. Shown in your private gallery only.",
  tagsBounds: "40 characters at most per tag, 20 tags at most per capture.",
  saveTags: "Save the tags",
  deleteCapture: "Delete the capture",
  deleteTitle: (title) => `Delete “${title}”?`,
  deleteBody: "The capture and its file are erased from your space.",
  publishTitle: "Make this capture public?",
  publishIntro: "It will appear in the public gallery, with:",
  publishImage: "the image",
  publishTarget: (designation) => `the target: ${designation}`,
  publishEquipment: "the equipment",
  publishMonth: (month) => `the month of the night: ${month}`,
  publishMonths: (months) => `the months of the nights: ${months}`,
  publishSky: "the sky quality",
  publishNoPlace:
    "Neither the place nor its coordinates: the position is also removed from the published file.",
  // A server with no team: its owner decides alone (the three lines of the
  // tab).
  ruleDecide:
    "You alone decide what is public, and you can make a capture private again at any time.",
  rulePublic: "A public capture can be seen by anyone, without signing in.",
  ruleResponsible:
    "Nobody else on this server checks what you publish. You are responsible for it.",
  publishConfirm: "Make public",
  cancel: "Cancel",
  close: "Close",
  loading: "Loading your captures…",
  loadFailed: "The list of your captures could not be read. Try again later.",
  notFound: "This capture is no longer in your space.",
  retry: "Try again",
  changeFailed: "The capture could not be changed. Try again later.",
  syncNothing: "Nothing new to take.",
  syncDone: "The lines are up to date.",
  viewLabel: "View",
  listView: "List",
  mapView: "Map",
  allChip: "All",
  searchTarget: "Search for a target",
  reverseSort: "Reverse the order by date",
  newestFirst: "Newest first",
  oldestFirst: "Oldest first",
  counter: (captures, targets) =>
    `${captures} capture${captures === 1 ? "" : "s"} · ${targets} target${targets === 1 ? "" : "s"}`,
  noMatch: "No capture matches this filter.",
  storageUsed: (used, quota) => `${used} used of ${quota}`,
  storageUsedAlone: (used) => `${used} used`,
  storageIncluded: "Included",
  storageLeft: (left) => `${left} left`,
  storageInfo:
    "The copies shown in the galleries and the thumbnails do not count: only your originals do.",
  storageInfoLabel: "Space used: what it changes",
  variantsInfoLabel: "Variants of a capture: what it changes",
  messageInfoLabel: "Visibility of the former and the new main image",
  storageFull: "Your space is full: a new capture cannot fit in it.",
  integration: (duration) => `Integration ${duration}`,
  integrationUnknown: "Integration not noted",
  stageDraft: "Draft",
  archived: "Archived",
  stageFinalized: "Finalized",
  personal: "Personal target",
  fileZone: "File",
  downloadOriginal: (kind, size) =>
    `Download the original (${[kind, size].filter(Boolean).join(", ")})`,
  fileSent: "The file you sent, unchanged.",
  fileMain: "The main image's file, unchanged.",
  fileInfo:
    "This is the file as it was sent, with its metadata. The galleries only show a copy of it, without the location, and never offer a download.",
  addVariant: "Add a variant",
  stateZone: "State",
  draftLine: "Draft: the capture is not finalized yet.",
  finalize: "Finalize this capture",
  draftBanner:
    "Draft: this capture does not appear in your private gallery yet.",
  draftBannerHint:
    "Finalize it when it is ready: it will then appear in your private gallery, and you can make it public.",
  finalized: "Finalized.",
  finalizedOn: (day) => `Finalized on ${day}.`,
  finalizeFirst: "Finalize the capture to be able to make it public.",
  makePublic: "Make public",
  draftInfo:
    "A capture sent by the phone or by Astro Sync arrives as a draft. Finalize it when it is ready: it can then become public.",
  skyZone: "Plate solving",
  skyProvenance: {
    "astro-sync": (date) => `Sky solution: computed by Astro Sync on ${date}.`,
    "astrometry-net": (date) =>
      `Sky solution: computed with astrometry.net on ${date}.`,
    import: (date) =>
      `Sky solution: carried over from the old portal on ${date}.`,
  },
  skyShow: "Show plate solving",
  skyOn: "The gallery offers the annotations of this capture.",
  skyOff: "The gallery does not offer the annotations of this capture.",
  skyNone: "This image has no sky solution: the annotations cannot be drawn.",
  skyInfoLabel: "Plate solving: what it changes",
  skyInfo:
    "A sky solution says where the image sits in the sky. With it, the gallery can draw the target’s name, nearby objects and stars on the image, which visitors show or hide. Turning this off removes the annotations from the gallery; the solution stays stored.",
  skyInfoNone:
    "A sky solution says where the image sits in the sky; without it, the annotations cannot be drawn. Astro Sync, the desktop application, computes it on your computer from the image and sends it here: download the application from the site’s download page, then open “Annotations” and resolve this capture.",
  skyAstroSync: "Resolve in Astro Sync",
  skyServer: "Resolve on this server",
  skyRunning: "Resolving…",
  skyFailed: {
    not_solved:
      "Too few stars recognised, or the field is outside the installed indexes.",
    unreadable_solution: "The result of the resolution could not be read.",
    not_started: "The server’s solving tool does not start.",
    image_changed: "The image changed during the resolution.",
    sky_solution_aspect_mismatch:
      "The result does not match the image’s proportions.",
    other: "The resolution did not succeed.",
  },
  deleteBodyImages: (count) =>
    `The capture and its ${count} images are erased from your space, with their files.`,
  freed: (size) => `${size} freed.`,
  variantsZone: "Variants",
  variantsPending:
    "A new variant has arrived: it is private, the main image has not changed.",
  variantsCount: (count) =>
    `${count} images. The private gallery shows all of them; the public gallery, the main image then the public variants.`,
  variantsInfo:
    "A new image sent for the same capture is added here, as a private variant. The main image changes only if you choose another one. A variant is public only if the capture is. Every image counts in the space used.",
  mainPill: "Main",
  variantPill: "Variant",
  progressionZone: "Progression of the night",
  progressionLine:
    "The milestones Astro Sync stacked during the night, from the first frame to all of them. They are shown with the capture in the galleries and are not counted among the variants.",
  progressionFrames: (count) => `${count} frame${count === 1 ? "" : "s"}`,
  progressionStep: (index, count) =>
    count
      ? `Milestone ${index} — ${count} frame${count === 1 ? "" : "s"}`
      : `Milestone ${index}`,
  // The image of a multi-night plan: its stacked image after each night.
  progressionPlanZone: "Stacking progress",
  progressionPlanLine:
    "The image stacked after each night, from the first night to the final image. They are shown with the capture in the galleries and are not counted among the variants.",
  progressionPlanStep: (index, count) =>
    count
      ? `After night ${index} — ${count} frame${count === 1 ? "" : "s"}`
      : `After night ${index}`,
  editNames: "Edit the title and the description",
  titleLabel: "Title",
  titleHelp: (fallback) => `Optional. By default: “${fallback}”.`,
  descriptionLabel: "Description",
  descriptionHelp:
    "Optional. It is shown under the image, in the gallery, if the variant is public.",
  mainDescriptionHelp:
    "Optional. It is shown under the image, in the gallery, if the capture is public.",
  textCount: (count, max) => `${count} / ${max}`,
  textTooLong: (max) => `${max} characters at most.`,
  saveTitle: "Save the title",
  saveDescription: "Save the description",
  sources: {
    phone: "Phone",
    web: "Web",
    "astro-sync": "Astro Sync",
    stacking: "Astro Sync · stacking",
  },
  digest: (short) => `SHA-256 ${short}`,
  makeVariantPublic: "Make this variant public",
  deleteVariant: "Delete this variant",
  useAsMain: "Use as main image",
  deleteMain: "Delete the main image",
  deleteMainRefused:
    "Choose another main image first: the main image is never deleted alone.",
  useAsMainTitle: "Use as main image?",
  useAsMainBody: (name, file, size, target) =>
    `The variant “${name}” (${file}, ${size}) will become the main image of ${target}: it is the one the gallery will show first.`,
  becomesPublic:
    "This variant is private: as the main image, it will be public, like the capture.",
  becomesPublicInfo: (name, file) =>
    `The current main image (“${name}”, ${file}) becomes a variant and stays public. The main image's visibility is always the capture's.`,
  mainChosenPublic: (chosen, former) =>
    `${chosen} is now the main image, so public like the capture; ${former} stays public, as a variant.`,
  mainChosen: (chosen, former, isPublic) =>
    `${chosen} is now the main image; ${former} stays ${isPublic ? "public" : "private"}, as a variant.`,
  deleteVariantTitle: "Delete this variant?",
  deleteVariantBody: (name, file, source, when, size) =>
    `The variant “${name}” (${[file, source, when, size].filter(Boolean).join(", ")}) will be deleted from your space, with its file.`,
  deleteVariantPublic: "It also leaves the public gallery.",
  deleteVariantKeeps: (size) =>
    `The main image and the capture do not change. ${size} freed.`,
  addTitle: "Add a capture",
  addTo: (designation) => `Add to ${designation}`,
  steps: { night: "Night", target: "Target", image: "Image" },
  stepsLabel: "Steps",
  nightTargets: (place, count) =>
    [place, `${count} target${count === 1 ? "" : "s"} observed`]
      .filter(Boolean)
      .join(" · "),
  outcomes: { done: "Done", partial: "Partial" },
  captureCount: (count) => `${count} capture${count === 1 ? "" : "s"}`,
  notInCatalogue: "A target that is not in the catalogue",
  searchNoResult: "No catalogue target matches.",
  back: "Back",
  dropHere: "Drop the image here",
  chooseFile: "Choose a file",
  addedAsDraft: "It will be added as a private draft.",
  nightLabel: "Night",
  integrationLabel: "Integration",
  newTarget: "New target",
  nameLabel: "Name",
  nameFromFile: "Suggested from the file name.",
  placeLabel: "Place",
  placeNearest: "The saved place nearest to the photo.",
  dateLabel: "Date",
  alreadyPresent: (file) =>
    `${file} is already in your space: nothing was sent.`,
  checking: "Checking the file…",
  targetFailed: "The target could not be created. Try again later.",
  nightsLoading: "Loading your nights…",
  // The add box's step « Rangement ».
  stepFiling: "Filing",
  filingChange: "Change",
  filingEdit: "Edit",
  filingTitle: (count) =>
    count > 1
      ? "These captures will be filed in their sessions"
      : "This capture will be filed in a session",
  filingFromPhoto: (date, time) => `From the photo · ${date}, ${time}`,
  filingNoExif:
    "This image carries neither a date nor a position: change the night if it is another one.",
  filingNightAssumed: (date) => `Night of ${date} · assumed`,
  filingPlace: (name) => `Place: ${name}`,
  filingPlaceCurrent: "Current place",
  filingPlacePhoto: "The photo’s position",
  filingTarget: (name) => `Target: ${name}`,
  filingTargetNone: "Target: to specify",
  filingTargetFromFile: "From the file name",
  filingTargetClear: "Leave the target to specify later",
  filingNewTargetUse: "Use this name",
  filingExistsTitle: "This night already has a session",
  filingAttachAsk: (day) => `Attach to the night of ${day}?`,
  filingAttachChoice: (date) => `Attach to the session of ${date}`,
  filingCreateChoice: "Create a new session",
  filingCreateAndSend: "Create the session and send",
  filingCreateManyAndSend: (n) => `Create ${n} sessions and send`,
  filingAttachAndSend: (day) => `Attach to the night of ${day} and send`,
  filingSendAll: "File and send",
  filingPickExisting: "Choose an existing session",
  // A public capture also leaves the public gallery when deleted.
  deletePublicNote: "It also leaves the public gallery.",
};

const ja = {
  title: "キャプチャ",
  help: "非公開：プライベートギャラリーだけに表示。公開：公開ギャラリーにも表示。",
  infoLabel: "非公開と公開：何が変わるか",
  usage: (count, limit) => `${limit}件中${count}件のキャプチャ`,
  // The free space says it is a limit.
  add: "キャプチャを追加",
  open: "キャプチャを開く",
  // The title of a capture that has no target.
  noTarget: "無題のキャプチャ",
  night: (date) => `${date}の夜`,
  added: (date) => `${date}に追加`,
  visibility: "公開範囲",
  private: "非公開",
  public: "公開",
  publicSince: (date) => `${date}から公開中`,
  publicSinceUnknown: "公開中（日付不明）",
  noImageShort: "画像なし",
  noImage:
    "まだ画像がありません。Astro Sync から送るか、ここで追加してください。",
  addImage: "画像を追加",
  publishNoImage:
    "画像のないキャプチャは公開できません。先に画像を追加してください。",
  targetZone: "対象",
  targetNone: "まだ対象がありません。",
  targetAdd: "対象を追加",
  targetChoose: "対象を選ぶ",
  targetChange: (d) => `${d}を変更`,
  targetRemove: (d) => `${d}を外す`,
  targetCancel: "キャンセル",
  createWithoutImage: "画像なしでキャプチャを作成",
  definitionFailed:
    "キャプチャを作成できませんでした。しばらくしてからもう一度お試しください。",
  definitionName: "キャプチャ",
  notShowable:
    "このファイルは公開ギャラリーに表示できません：公開できるのは画像だけです。",
  quotaTitle: (file) =>
    `${file}は追加されませんでした：スペースに空きがありません。`,
  tooLargeTitle: (file) =>
    `${file}は追加されませんでした：このスペースにはファイルが大きすぎます。`,
  contentRefusedTitle: (file) =>
    `${file}は追加されませんでした：この種類のファイルは受け付けていません。`,
  uploadFailedTitle: (file) => `${file}は追加されませんでした。`,
  tryLater: "しばらくしてからもう一度お試しください。",
  emptyTitle: "まだキャプチャはありません",
  emptyBody:
    "パソコンの Astro Sync、スマートフォンの PlanAstro、またはこのページから届きます。",
  retired: "公開ギャラリーから外しました。",
  allCaptures: "すべてのキャプチャ",
  captureLabel: (title) => `キャプチャ ${title}`,
  alreadyVisible: "すでに公開ギャラリーに表示されています。",
  equipment: "機材",
  month: "撮影した月",
  monthPlan: "撮影した月",
  sky: "空の質",
  place: "場所",
  placeValue: (name) => `${name}（公開されません）`,
  bortle: (value) => `ボートル ${value}`,
  tags: "タグ",
  tagsHelp:
    "カンマで区切って入力します。プライベートギャラリーだけに表示されます。",
  tagsBounds: "タグは1つにつき40文字まで、1つのキャプチャにつき20個までです。",
  saveTags: "タグを保存",
  deleteCapture: "キャプチャを削除",
  deleteTitle: (title) => `「${title}」を削除しますか？`,
  deleteBody: "キャプチャとそのファイルがスペースから消去されます。",
  publishTitle: "このキャプチャを公開しますか？",
  publishIntro: "公開ギャラリーに次の情報とともに表示されます：",
  publishImage: "画像",
  publishTarget: (designation) => `対象：${designation}`,
  publishEquipment: "機材",
  publishMonth: (month) => `撮影した月：${month}`,
  publishMonths: (months) => `撮影した月：${months}`,
  publishSky: "空の質",
  publishNoPlace:
    "場所とその座標は含まれません。公開されるファイルからも位置情報は削除されます。",
  // A server with no team: its owner decides alone (the three lines of the
  // tab).
  ruleDecide:
    "何を公開するかは自分だけが決めます。キャプチャはいつでも非公開に戻せます。",
  rulePublic: "公開したキャプチャは、サインインなしで誰でも見られます。",
  ruleResponsible:
    "このサーバーでは、他の誰も公開内容を確認しません。公開した内容の責任は自分にあります。",
  publishConfirm: "公開する",
  cancel: "キャンセル",
  close: "閉じる",
  loading: "キャプチャを読み込み中…",
  loadFailed:
    "キャプチャの一覧を読み込めませんでした。しばらくしてからもう一度お試しください。",
  notFound: "このキャプチャはもうスペースにありません。",
  retry: "再試行",
  changeFailed:
    "キャプチャを変更できませんでした。しばらくしてからもう一度お試しください。",
  syncNothing: "取り込む新しい内容はありません。",
  syncDone: "行を更新しました。",
  viewLabel: "表示",
  listView: "リスト",
  mapView: "マップ",
  allChip: "すべて",
  searchTarget: "対象を検索",
  reverseSort: "日付の並び順を逆にする",
  newestFirst: "新しい順",
  oldestFirst: "古い順",
  counter: (captures, targets) => `${captures}件の撮影 · ${targets}個の対象`,
  noMatch: "この絞り込みに合う撮影はありません。",
  storageUsed: (used, quota) => `${quota}中 ${used}を使用`,
  storageUsedAlone: (used) => `${used}を使用`,
  storageIncluded: "含まれています",
  storageLeft: (left) => `残り${left}`,
  storageInfo:
    "ギャラリーに表示されるコピーとサムネイルは数えません。数えるのは元のファイルだけです。",
  storageInfoLabel: "使用容量：これで変わること",
  variantsInfoLabel: "撮影のバリアント：これで変わること",
  messageInfoLabel: "以前のメイン画像と新しいメイン画像の公開設定",
  storageFull: "スペースがいっぱいです。新しい撮影は入りません。",
  integration: (duration) => `積算 ${duration}`,
  integrationUnknown: "積算 未記録",
  stageDraft: "下書き",
  archived: "アーカイブ済み",
  stageFinalized: "確定済み",
  personal: "個人の対象",
  fileZone: "ファイル",
  downloadOriginal: (kind, size) =>
    `元のファイルをダウンロード（${[kind, size].filter(Boolean).join("、")}）`,
  fileSent: "送信されたファイルそのままです。",
  fileMain: "メイン画像のファイルそのままです。",
  fileInfo:
    "送信されたときのままのファイルで、メタデータも含みます。ギャラリーには位置情報を除いたコピーだけが表示され、ダウンロードはできません。",
  addVariant: "バリアントを追加",
  stateZone: "状態",
  draftLine: "下書き：撮影はまだ確定されていません。",
  finalize: "この撮影を確定",
  draftBanner:
    "下書き：この撮影はまだプライベートギャラリーに表示されていません。",
  draftBannerHint:
    "準備ができたら確定してください。確定するとプライベートギャラリーに表示され、公開することもできます。",
  finalized: "確定済みです。",
  finalizedOn: (day) => `${day}に確定しました。`,
  finalizeFirst: "公開するには、先に撮影を確定してください。",
  makePublic: "公開する",
  draftInfo:
    "スマートフォンや Astro Sync から送られた撮影は下書きとして届きます。準備ができたら確定してください。そのあと公開できます。",
  skyZone: "プレートソルビング",
  skyProvenance: {
    "astro-sync": (date) => `天球位置の解析結果：${date}にAstro Sync で計算。`,
    "astrometry-net": (date) =>
      `天球位置の解析結果：${date}にastrometry.net で計算。`,
    import: (date) => `天球位置の解析結果：${date}に旧ポータルから引き継ぎ。`,
  },
  skyShow: "プレートソルビングを表示",
  skyOn: "ギャラリーでこの撮影の注釈を表示できます。",
  skyOff: "ギャラリーでこの撮影の注釈は表示されません。",
  skyNone: "この画像には天球位置の解析結果がないため、注釈を描画できません。",
  skyInfoLabel: "プレートソルビング：変わること",
  skyInfo:
    "天球位置の解析結果は、画像が空のどこにあるかを示します。これがあると、ギャラリーは画像に対象の名前や近くの天体、星を描画でき、訪問者は表示と非表示を切り替えられます。この設定をオフにすると、ギャラリーから注釈が外れます。解析結果は保存されたままです。",
  skyInfoNone:
    "天球位置の解析結果は、画像が空のどこにあるかを示します。これがないと注釈を描画できません。デスクトップアプリの Astro Sync が、お使いのコンピューター上で画像から計算し、ここへ送信します。サイトのダウンロードページからアプリを入手し、「注釈」を開いてこの撮影を解析してください。",
  skyAstroSync: "Astro Sync で解析",
  skyServer: "このサーバーで解析",
  skyRunning: "解析中…",
  skyFailed: {
    not_solved:
      "認識できた星が少なすぎるか、インストール済みのインデックスの範囲外です。",
    unreadable_solution: "解析結果を読み取れませんでした。",
    not_started: "サーバーの解析ツールを起動できません。",
    image_changed: "解析中に画像が変更されました。",
    sky_solution_aspect_mismatch: "解析結果が画像の縦横比と一致しません。",
    other: "解析できませんでした。",
  },
  deleteBodyImages: (count) =>
    `撮影と${count}枚の画像が、ファイルごとスペースから削除されます。`,
  freed: (size) => `${size}が空きます。`,
  variantsZone: "バリアント",
  variantsPending:
    "新しいバリアントが届きました。非公開のままで、メイン画像は変わっていません。",
  variantsCount: (count) =>
    `${count}枚の画像：プライベートギャラリーではすべてを表示し、公開ギャラリーではメイン画像、続いて公開のバリアントを表示します。`,
  variantsInfo:
    "同じ撮影に送られた新しい画像は、非公開のバリアントとしてここに加わります。メイン画像は、別の画像を選んだときだけ変わります。バリアントは撮影が公開のときだけ公開できます。すべての画像が使用容量に数えられます。",
  mainPill: "メイン",
  variantPill: "バリアント",
  progressionZone: "夜のプログレッション",
  progressionLine:
    "Astro Sync が夜のあいだに重ねたマイルストーンです（最初の1枚からすべての枚数まで）。ギャラリーではキャプチャと一緒に表示され、バリアントには数えられません。",
  progressionFrames: (count) => `${count} 枚`,
  progressionStep: (index, count) =>
    count ? `マイルストーン ${index} — ${count} 枚` : `マイルストーン ${index}`,
  // The image of a multi-night plan: its stacked image after each night.
  progressionPlanZone: "スタックの進行",
  progressionPlanLine:
    "夜ごとの積算画像です（最初の夜から最終画像まで）。ギャラリーではキャプチャと一緒に表示され、バリアントには数えられません。",
  progressionPlanStep: (index, count) =>
    count ? `${index} 夜目まで — ${count} 枚` : `${index} 夜目まで`,
  editNames: "タイトルと説明を編集",
  titleLabel: "タイトル",
  titleHelp: (fallback) => `任意。未入力のときは「${fallback}」。`,
  descriptionLabel: "説明",
  descriptionHelp:
    "任意。バリアントが公開のとき、ギャラリーの画像の下に表示されます。",
  mainDescriptionHelp:
    "任意。撮影が公開のとき、ギャラリーの画像の下に表示されます。",
  textCount: (count, max) => `${count} / ${max}`,
  textTooLong: (max) => `${max}文字までです。`,
  saveTitle: "タイトルを保存",
  saveDescription: "説明を保存",
  sources: {
    phone: "スマートフォン",
    web: "Web",
    "astro-sync": "Astro Sync",
    stacking: "Astro Sync · スタック",
  },
  digest: (short) => `SHA-256 ${short}`,
  makeVariantPublic: "このバリアントを公開する",
  deleteVariant: "このバリアントを削除",
  useAsMain: "メイン画像にする",
  deleteMain: "メイン画像を削除",
  deleteMainRefused:
    "先に別のメイン画像を選んでください。メイン画像だけを削除することはできません。",
  useAsMainTitle: "メイン画像にしますか？",
  useAsMainBody: (name, file, size, target) =>
    `バリアント「${name}」（${file}、${size}）が${target}のメイン画像になります。ギャラリーで最初に表示される画像です。`,
  becomesPublic:
    "このバリアントは非公開です。メイン画像になると、撮影と同じく公開されます。",
  becomesPublicInfo: (name, file) =>
    `現在のメイン画像（「${name}」、${file}）はバリアントになり、公開のままです。メイン画像の公開設定は常に撮影と同じです。`,
  mainChosenPublic: (chosen, former) =>
    `${chosen}がメイン画像になり、撮影と同じく公開されました。${former}はバリアントとして公開のままです。`,
  mainChosen: (chosen, former, isPublic) =>
    `${chosen}がメイン画像になりました。${former}はバリアントとして${isPublic ? "公開" : "非公開"}のままです。`,
  deleteVariantTitle: "このバリアントを削除しますか？",
  deleteVariantBody: (name, file, source, when, size) =>
    `バリアント「${name}」（${[file, source, when, size].filter(Boolean).join("、")}）が、ファイルごとスペースから削除されます。`,
  deleteVariantPublic: "公開ギャラリーからも消えます。",
  deleteVariantKeeps: (size) =>
    `メイン画像と撮影は変わりません。${size}が空きます。`,
  addTitle: "撮影を追加",
  addTo: (designation) => `${designation}に追加`,
  steps: { night: "夜", target: "対象", image: "画像" },
  stepsLabel: "手順",
  nightTargets: (place, count) =>
    [place, `観測した対象 ${count}個`].filter(Boolean).join(" · "),
  outcomes: { done: "完了", partial: "一部" },
  captureCount: (count) => `撮影${count}件`,
  notInCatalogue: "カタログにない対象",
  searchNoResult: "一致するカタログの対象はありません。",
  back: "戻る",
  dropHere: "ここに画像をドロップ",
  chooseFile: "ファイルを選ぶ",
  addedAsDraft: "非公開の下書きとして追加されます。",
  nightLabel: "夜",
  integrationLabel: "積算",
  newTarget: "新しい対象",
  nameLabel: "名前",
  nameFromFile: "ファイル名から提案しています。",
  placeLabel: "場所",
  placeNearest: "写真にいちばん近い保存済みの場所です。",
  dateLabel: "日付",
  alreadyPresent: (file) =>
    `${file}はすでにスペースにあります。何も送信していません。`,
  checking: "ファイルを確認しています…",
  targetFailed:
    "対象を作成できませんでした。しばらくしてからもう一度お試しください。",
  nightsLoading: "夜を読み込んでいます…",
  // The add box's step « Rangement ».
  stepFiling: "保存先",
  filingChange: "選び直す",
  filingEdit: "変更",
  filingTitle: (count) =>
    count > 1
      ? "これらのキャプチャはそれぞれのセッションに保存されます"
      : "このキャプチャはセッションに保存されます",
  filingFromPhoto: (date, time) => `写真より · ${date} ${time}`,
  filingNoExif:
    "この画像には日時も位置情報もありません。別の夜なら変更してください。",
  filingNightAssumed: (date) => `${date}の夜（仮）`,
  filingPlace: (name) => `場所：${name}`,
  filingPlaceCurrent: "現在の場所",
  filingPlacePhoto: "写真の位置",
  filingTarget: (name) => `対象：${name}`,
  filingTargetNone: "対象：あとで指定",
  filingTargetFromFile: "ファイル名から",
  filingTargetClear: "対象はあとで指定する",
  filingNewTargetUse: "この名前を使う",
  filingExistsTitle: "この夜にはすでにセッションがあります",
  filingAttachAsk: (day) => `${day}の夜に追加しますか？`,
  filingAttachChoice: (date) => `${date}のセッションに追加`,
  filingCreateChoice: "新しいセッションを作成",
  filingCreateAndSend: "セッションを作成して送信",
  filingCreateManyAndSend: (n) => `${n}件のセッションを作成して送信`,
  filingAttachAndSend: (day) => `${day}の夜に追加して送信`,
  filingSendAll: "保存して送信",
  filingPickExisting: "既存のセッションを選択",
  // A public capture also leaves the public gallery when deleted.
  deletePublicNote: "公開ギャラリーからも外れます。",
};

const de = {
  title: "Aufnahmen",
  help: "Privat: nur in deiner privaten Galerie. Öffentlich: auch in der öffentlichen Galerie.",
  infoLabel: "Privat, öffentlich: was sich ändert",
  usage: (count, limit) => `${count} von ${limit} Aufnahmen`,
  // The free space says it is a limit.
  add: "Aufnahme hinzufügen",
  open: "Aufnahme öffnen",
  // The title of a capture that has no target.
  noTarget: "Aufnahme ohne Titel",
  night: (date) => `Nacht vom ${date}`,
  added: (date) => `Hinzugefügt am ${date}`,
  visibility: "Sichtbarkeit",
  private: "Privat",
  public: "Öffentlich",
  publicSince: (date) => `Öffentlich seit ${date}`,
  publicSinceUnknown: "Öffentlich, Datum unbekannt",
  noImageShort: "Kein Bild",
  noImage:
    "Noch kein Bild: Sende die Bilder aus Astro Sync oder füge hier eines hinzu.",
  addImage: "Ein Bild hinzufügen",
  publishNoImage:
    "Eine Aufnahme ohne Bild kann nicht veröffentlicht werden: Füge zuerst ein Bild hinzu.",
  targetZone: "Ziel",
  targetNone: "Noch kein Ziel.",
  targetAdd: "Ein Ziel hinzufügen",
  targetChoose: "Ein Ziel wählen",
  targetChange: (d) => `${d} ändern`,
  targetRemove: (d) => `${d} entfernen`,
  targetCancel: "Abbrechen",
  createWithoutImage: "Aufnahme ohne Bild erstellen",
  definitionFailed:
    "Die Aufnahme konnte nicht erstellt werden. Versuche es später erneut.",
  definitionName: "Die Aufnahme",
  notShowable:
    "Diese Datei kann nicht in der öffentlichen Galerie gezeigt werden: Nur Bilder können öffentlich sein.",
  quotaTitle: (file) =>
    `${file} wurde nicht hinzugefügt: dein Bereich hat keinen Platz mehr dafür.`,
  tooLargeTitle: (file) =>
    `${file} wurde nicht hinzugefügt: Die Datei ist für deinen Bereich zu groß.`,
  contentRefusedTitle: (file) =>
    `${file} wurde nicht hinzugefügt: Dieser Dateityp wird nicht angenommen.`,
  uploadFailedTitle: (file) => `${file} wurde nicht hinzugefügt.`,
  tryLater: "Versuche es gleich noch einmal.",
  emptyTitle: "Noch keine Aufnahme",
  emptyBody:
    "Sie kommen über Astro Sync von deinem Computer, über PlanAstro auf deinem Telefon oder über diese Seite.",
  retired: "Aus der öffentlichen Galerie entfernt.",
  allCaptures: "Alle Aufnahmen",
  captureLabel: (title) => `Aufnahme ${title}`,
  alreadyVisible: "Bereits in der öffentlichen Galerie sichtbar.",
  equipment: "Ausrüstung",
  month: "Monat der Nacht",
  monthPlan: "Monate der Nächte",
  sky: "Himmelsqualität",
  place: "Ort",
  placeValue: (name) => `${name} (nie veröffentlicht)`,
  bortle: (value) => `Bortle ${value}`,
  tags: "Tags",
  tagsHelp: "Durch Kommas getrennt. Nur in deiner privaten Galerie sichtbar.",
  tagsBounds: "Höchstens 40 Zeichen pro Tag, höchstens 20 Tags pro Aufnahme.",
  saveTags: "Tags speichern",
  deleteCapture: "Aufnahme löschen",
  deleteTitle: (title) => `„${title}“ löschen?`,
  deleteBody: "Die Aufnahme und ihre Datei werden aus deinem Bereich gelöscht.",
  publishTitle: "Diese Aufnahme öffentlich machen?",
  publishIntro: "Sie erscheint in der öffentlichen Galerie, mit:",
  publishImage: "dem Bild",
  publishTarget: (designation) => `dem Objekt: ${designation}`,
  publishEquipment: "der Ausrüstung",
  publishMonth: (month) => `dem Monat der Nacht: ${month}`,
  publishMonths: (months) => `den Monaten der Nächte: ${months}`,
  publishSky: "der Himmelsqualität",
  publishNoPlace:
    "Weder der Ort noch seine Koordinaten: Die Position wird auch aus der veröffentlichten Datei entfernt.",
  // A server with no team: its owner decides alone (the three lines of the
  // tab).
  ruleDecide:
    "Allein du entscheidest, was öffentlich ist, und du kannst eine Aufnahme jederzeit wieder privat machen.",
  rulePublic: "Eine öffentliche Aufnahme kann jeder ohne Anmeldung sehen.",
  ruleResponsible:
    "Niemand sonst auf diesem Server prüft, was du veröffentlichst. Du bist dafür verantwortlich.",
  publishConfirm: "Öffentlich machen",
  cancel: "Abbrechen",
  close: "Schließen",
  loading: "Deine Aufnahmen werden geladen…",
  loadFailed:
    "Die Liste deiner Aufnahmen konnte nicht gelesen werden. Versuche es später erneut.",
  notFound: "Diese Aufnahme ist nicht mehr in deinem Bereich.",
  retry: "Erneut versuchen",
  changeFailed:
    "Die Aufnahme konnte nicht geändert werden. Versuche es später erneut.",
  syncNothing: "Es gibt nichts Neues zu übernehmen.",
  syncDone: "Die Zeilen sind aktualisiert.",
  viewLabel: "Ansicht",
  listView: "Liste",
  mapView: "Karte",
  allChip: "Alle",
  searchTarget: "Ein Ziel suchen",
  reverseSort: "Sortierung nach Datum umkehren",
  newestFirst: "Neueste zuerst",
  oldestFirst: "Älteste zuerst",
  counter: (captures, targets) =>
    `${captures} ${captures === 1 ? "Aufnahme" : "Aufnahmen"} · ${targets} ${targets === 1 ? "Ziel" : "Ziele"}`,
  noMatch: "Keine Aufnahme passt zu diesem Filter.",
  storageUsed: (used, quota) => `${used} von ${quota} belegt`,
  storageUsedAlone: (used) => `${used} belegt`,
  storageIncluded: "Inklusive",
  storageLeft: (left) => `Noch ${left} frei`,
  storageInfo:
    "Die Kopien in den Galerien und die Miniaturbilder zählen nicht: Nur deine Originale zählen.",
  storageInfoLabel: "Belegter Speicher: was das ändert",
  variantsInfoLabel: "Varianten einer Aufnahme: was das ändert",
  messageInfoLabel: "Sichtbarkeit des bisherigen und des neuen Hauptbilds",
  storageFull:
    "Dein Bereich ist voll: Eine neue Aufnahme passt nicht mehr hinein.",
  integration: (duration) => `Integration ${duration}`,
  integrationUnknown: "Integration nicht erfasst",
  stageDraft: "Entwurf",
  archived: "Archiviert",
  stageFinalized: "Fertiggestellt",
  personal: "Eigenes Ziel",
  fileZone: "Datei",
  downloadOriginal: (kind, size) =>
    `Original herunterladen (${[kind, size].filter(Boolean).join(", ")})`,
  fileSent: "Die Datei, die du gesendet hast, unverändert.",
  fileMain: "Die Datei des Hauptbilds, unverändert.",
  fileInfo:
    "Es ist die Datei, wie sie gesendet wurde, mit ihren Metadaten. Die Galerien zeigen nur eine Kopie ohne Standort und bieten nie einen Download an.",
  addVariant: "Eine Variante hinzufügen",
  stateZone: "Status",
  draftLine: "Entwurf: Die Aufnahme ist noch nicht fertiggestellt.",
  finalize: "Diese Aufnahme fertigstellen",
  draftBanner:
    "Entwurf: Diese Aufnahme erscheint noch nicht in deiner privaten Galerie.",
  draftBannerHint:
    "Stelle sie fertig, wenn sie bereit ist: Dann erscheint sie in deiner privaten Galerie, und du kannst sie öffentlich machen.",
  finalized: "Fertiggestellt.",
  finalizedOn: (day) => `Fertiggestellt am ${day}.`,
  finalizeFirst:
    "Stelle die Aufnahme fertig, um sie veröffentlichen zu können.",
  makePublic: "Öffentlich machen",
  draftInfo:
    "Eine Aufnahme vom Telefon oder von Astro Sync kommt als Entwurf an. Stelle sie fertig, wenn sie bereit ist: Dann kann sie öffentlich werden.",
  skyZone: "Plate Solving",
  skyProvenance: {
    "astro-sync": (date) =>
      `Himmelslösung: von Astro Sync berechnet am ${date}.`,
    "astrometry-net": (date) =>
      `Himmelslösung: mit astrometry.net berechnet am ${date}.`,
    import: (date) =>
      `Himmelslösung: aus dem alten Portal übernommen am ${date}.`,
  },
  skyShow: "Plate Solving anzeigen",
  skyOn: "Die Galerie bietet die Annotationen dieser Aufnahme an.",
  skyOff: "Die Galerie bietet die Annotationen dieser Aufnahme nicht an.",
  skyNone:
    "Dieses Bild hat keine Himmelslösung: Die Annotationen können nicht gezeichnet werden.",
  skyInfoLabel: "Plate Solving: Was es ändert",
  skyInfo:
    "Eine Himmelslösung sagt, wo das Bild am Himmel liegt. Mit ihr kann die Galerie den Namen des Ziels, nahe Objekte und Sterne auf das Bild zeichnen, die Besucher ein- oder ausblenden. Schaltest du dies aus, verschwinden die Annotationen aus der Galerie; die Lösung bleibt gespeichert.",
  skyInfoNone:
    "Eine Himmelslösung sagt, wo das Bild am Himmel liegt; ohne sie können die Annotationen nicht gezeichnet werden. Astro Sync, die Desktop-Anwendung, berechnet sie auf deinem Computer aus dem Bild und sendet sie hierher: Lade die Anwendung von der Download-Seite der Website herunter, öffne dann „Annotationen“ und löse diese Aufnahme.",
  skyAstroSync: "In Astro Sync lösen",
  skyServer: "Auf diesem Server lösen",
  skyRunning: "Wird gelöst …",
  skyFailed: {
    not_solved:
      "Zu wenige Sterne erkannt, oder das Feld liegt außerhalb der installierten Indizes.",
    unreadable_solution: "Das Ergebnis der Lösung konnte nicht gelesen werden.",
    not_started: "Das Lösungswerkzeug des Servers startet nicht.",
    image_changed: "Das Bild hat sich während der Lösung geändert.",
    sky_solution_aspect_mismatch:
      "Das Ergebnis passt nicht zu den Proportionen des Bildes.",
    other: "Die Lösung ist nicht gelungen.",
  },
  deleteBodyImages: (count) =>
    `Die Aufnahme und ihre ${count} Bilder werden mit ihren Dateien aus deinem Bereich gelöscht.`,
  freed: (size) => `${size} werden frei.`,
  variantsZone: "Varianten",
  variantsPending:
    "Eine neue Variante ist angekommen: Sie ist privat, das Hauptbild hat sich nicht geändert.",
  variantsCount: (count) =>
    `${count} Bilder: Die private Galerie zeigt alle; die öffentliche Galerie das Hauptbild, dann die öffentlichen Varianten.`,
  variantsInfo:
    "Ein neues Bild für dieselbe Aufnahme kommt hier als private Variante hinzu. Das Hauptbild ändert sich nur, wenn du ein anderes wählst. Eine Variante ist nur öffentlich, wenn die Aufnahme es ist. Jedes Bild zählt zum belegten Speicher.",
  mainPill: "Hauptbild",
  variantPill: "Variante",
  progressionZone: "Verlauf der Nacht",
  progressionLine:
    "Die Meilensteine, die Astro Sync während der Nacht gestapelt hat, vom ersten Einzelbild bis zu allen. Sie werden mit der Aufnahme in den Galerien gezeigt und zählen nicht zu den Varianten.",
  progressionFrames: (count) =>
    `${count} ${count === 1 ? "Einzelbild" : "Einzelbilder"}`,
  progressionStep: (index, count) =>
    count
      ? `Meilenstein ${index} – ${count} ${count === 1 ? "Einzelbild" : "Einzelbilder"}`
      : `Meilenstein ${index}`,
  // The image of a multi-night plan: its stacked image after each night.
  progressionPlanZone: "Verlauf der Stapelung",
  progressionPlanLine:
    "Das Bild, gestapelt nach jeder Nacht, von der ersten Nacht bis zum fertigen Bild. Sie werden mit der Aufnahme in den Galerien gezeigt und zählen nicht zu den Varianten.",
  progressionPlanStep: (index, count) =>
    count
      ? `Nach Nacht ${index} – ${count} ${count === 1 ? "Einzelbild" : "Einzelbilder"}`
      : `Nach Nacht ${index}`,
  editNames: "Titel und Beschreibung bearbeiten",
  titleLabel: "Titel",
  titleHelp: (fallback) => `Optional. Standard: „${fallback}“.`,
  descriptionLabel: "Beschreibung",
  descriptionHelp:
    "Optional. Sie erscheint in der Galerie unter dem Bild, wenn die Variante öffentlich ist.",
  mainDescriptionHelp:
    "Optional. Sie erscheint in der Galerie unter dem Bild, wenn die Aufnahme öffentlich ist.",
  textCount: (count, max) => `${count} / ${max}`,
  textTooLong: (max) => `Höchstens ${max} Zeichen.`,
  saveTitle: "Titel speichern",
  saveDescription: "Beschreibung speichern",
  sources: {
    phone: "Telefon",
    web: "Web",
    "astro-sync": "Astro Sync",
    stacking: "Astro Sync · Stacking",
  },
  digest: (short) => `SHA-256 ${short}`,
  makeVariantPublic: "Diese Variante öffentlich machen",
  deleteVariant: "Diese Variante löschen",
  useAsMain: "Als Hauptbild verwenden",
  deleteMain: "Hauptbild löschen",
  deleteMainRefused:
    "Wähle zuerst ein anderes Hauptbild: Das Hauptbild wird nie allein gelöscht.",
  useAsMainTitle: "Als Hauptbild verwenden?",
  useAsMainBody: (name, file, size, target) =>
    `Die Variante „${name}“ (${file}, ${size}) wird das Hauptbild von ${target}: Die Galerie zeigt sie zuerst.`,
  becomesPublic:
    "Diese Variante ist privat: Als Hauptbild wird sie öffentlich, wie die Aufnahme.",
  becomesPublicInfo: (name, file) =>
    `Das aktuelle Hauptbild („${name}“, ${file}) wird eine Variante und bleibt öffentlich. Die Sichtbarkeit des Hauptbilds ist immer die der Aufnahme.`,
  mainChosenPublic: (chosen, former) =>
    `${chosen} ist jetzt das Hauptbild und damit öffentlich wie die Aufnahme; ${former} bleibt als Variante öffentlich.`,
  mainChosen: (chosen, former, isPublic) =>
    `${chosen} ist jetzt das Hauptbild; ${former} bleibt als Variante ${isPublic ? "öffentlich" : "privat"}.`,
  deleteVariantTitle: "Diese Variante löschen?",
  deleteVariantBody: (name, file, source, when, size) =>
    `Die Variante „${name}“ (${[file, source, when, size].filter(Boolean).join(", ")}) wird mit ihrer Datei aus deinem Bereich gelöscht.`,
  deleteVariantPublic: "Sie verschwindet auch aus der öffentlichen Galerie.",
  deleteVariantKeeps: (size) =>
    `Das Hauptbild und die Aufnahme ändern sich nicht. ${size} werden frei.`,
  addTitle: "Eine Aufnahme hinzufügen",
  addTo: (designation) => `Zu ${designation} hinzufügen`,
  steps: { night: "Nacht", target: "Ziel", image: "Bild" },
  stepsLabel: "Schritte",
  nightTargets: (place, count) =>
    [place, `${count} ${count === 1 ? "Ziel" : "Ziele"} beobachtet`]
      .filter(Boolean)
      .join(" · "),
  outcomes: { done: "Erledigt", partial: "Teilweise" },
  captureCount: (count) => `${count} ${count === 1 ? "Aufnahme" : "Aufnahmen"}`,
  notInCatalogue: "Ein Ziel, das nicht im Katalog steht",
  searchNoResult: "Kein Katalogziel passt.",
  back: "Zurück",
  dropHere: "Bild hier ablegen",
  chooseFile: "Eine Datei wählen",
  addedAsDraft: "Sie wird als privater Entwurf hinzugefügt.",
  nightLabel: "Nacht",
  integrationLabel: "Integration",
  newTarget: "Neues Ziel",
  nameLabel: "Name",
  nameFromFile: "Aus dem Dateinamen vorgeschlagen.",
  placeLabel: "Ort",
  placeNearest: "Der gespeicherte Ort, der dem Foto am nächsten liegt.",
  dateLabel: "Datum",
  alreadyPresent: (file) =>
    `${file} ist schon in deinem Bereich: Nichts wurde gesendet.`,
  checking: "Die Datei wird geprüft…",
  targetFailed:
    "Das Ziel konnte nicht angelegt werden. Versuche es später erneut.",
  nightsLoading: "Deine Nächte werden geladen…",
  // The add box's step « Rangement ».
  stepFiling: "Ablage",
  filingChange: "Ändern",
  filingEdit: "Ändern",
  filingTitle: (count) =>
    count > 1
      ? "Diese Aufnahmen werden in ihren Sitzungen abgelegt"
      : "Diese Aufnahme wird in einer Sitzung abgelegt",
  filingFromPhoto: (date, time) => `Laut Foto · ${date}, ${time}`,
  filingNoExif:
    "Dieses Bild enthält weder Datum noch Position: Ändere die Nacht, falls es eine andere ist.",
  filingNightAssumed: (date) => `Nacht vom ${date} · angenommen`,
  filingPlace: (name) => `Ort: ${name}`,
  filingPlaceCurrent: "Aktueller Ort",
  filingPlacePhoto: "Position des Fotos",
  filingTarget: (name) => `Ziel: ${name}`,
  filingTargetNone: "Ziel: noch festzulegen",
  filingTargetFromFile: "Nach dem Dateinamen",
  filingTargetClear: "Ziel später festlegen",
  filingNewTargetUse: "Diesen Namen verwenden",
  filingExistsTitle: "Für diese Nacht gibt es schon eine Sitzung",
  filingAttachAsk: (day) => `Der Nacht vom ${day} zuordnen?`,
  filingAttachChoice: (date) => `Der Sitzung vom ${date} zuordnen`,
  filingCreateChoice: "Neue Sitzung erstellen",
  filingCreateAndSend: "Sitzung erstellen und senden",
  filingCreateManyAndSend: (n) => `${n} Sitzungen erstellen und senden`,
  filingAttachAndSend: (day) => `Der Nacht vom ${day} zuordnen und senden`,
  filingSendAll: "Ablegen und senden",
  filingPickExisting: "Bestehende Sitzung wählen",
  // A public capture also leaves the public gallery when deleted.
  deletePublicNote: "Sie verschwindet auch aus der öffentlichen Galerie.",
};

const es = {
  title: "Capturas",
  help: "Privada: solo en tu galería privada. Pública: también en la galería pública.",
  infoLabel: "Privada, pública: qué cambia",
  usage: (count, limit) => `${count} de ${limit} capturas`,
  // The free space says it is a limit.
  add: "Añadir una captura",
  open: "Abrir la captura",
  // The title of a capture that has no target.
  noTarget: "Captura sin título",
  night: (date) => `Noche del ${date}`,
  added: (date) => `Añadida el ${date}`,
  visibility: "Visibilidad",
  private: "Privada",
  public: "Pública",
  publicSince: (date) => `Pública desde el ${date}`,
  publicSinceUnknown: "Pública, fecha desconocida",
  noImageShort: "Sin imagen",
  noImage: "Aún no hay imagen: envíalas desde Astro Sync o añade una aquí.",
  addImage: "Añadir una imagen",
  publishNoImage:
    "Una captura sin imagen no se puede hacer pública: añade una primero.",
  targetZone: "Objetivo",
  targetNone: "Aún no hay objetivo.",
  targetAdd: "Añadir un objetivo",
  targetChoose: "Elegir un objetivo",
  targetChange: (d) => `Cambiar ${d}`,
  targetRemove: (d) => `Quitar ${d}`,
  targetCancel: "Cancelar",
  createWithoutImage: "Crear la captura sin imagen",
  definitionFailed:
    "No se pudo crear la captura. Inténtalo de nuevo más tarde.",
  definitionName: "La captura",
  notShowable:
    "Este archivo no se puede mostrar en la galería pública: solo las imágenes pueden ser públicas.",
  quotaTitle: (file) =>
    `${file} no se ha añadido: tu espacio ya no tiene sitio para ella.`,
  tooLargeTitle: (file) =>
    `${file} no se ha añadido: el archivo es demasiado grande para tu espacio.`,
  contentRefusedTitle: (file) =>
    `${file} no se ha añadido: este tipo de archivo no se acepta.`,
  uploadFailedTitle: (file) => `${file} no se ha añadido.`,
  tryLater: "Vuelve a intentarlo dentro de un momento.",
  emptyTitle: "Aún no hay capturas",
  emptyBody:
    "Llegan con Astro Sync desde tu ordenador, con PlanAstro en tu teléfono o desde esta página.",
  retired: "Retirada de la galería pública.",
  allCaptures: "Todas las capturas",
  captureLabel: (title) => `Captura ${title}`,
  alreadyVisible: "Ya visible en la galería pública.",
  equipment: "Equipo",
  month: "Mes de la noche",
  monthPlan: "Meses de las noches",
  sky: "Calidad del cielo",
  place: "Lugar",
  placeValue: (name) => `${name} (nunca publicado)`,
  bortle: (value) => `Bortle ${value}`,
  tags: "Etiquetas",
  tagsHelp: "Separadas por comas. Visibles solo en tu galería privada.",
  tagsBounds:
    "Como máximo 40 caracteres por etiqueta y 20 etiquetas por captura.",
  saveTags: "Guardar las etiquetas",
  deleteCapture: "Eliminar la captura",
  deleteTitle: (title) => `¿Eliminar «${title}»?`,
  deleteBody: "La captura y su archivo se borran de tu espacio.",
  publishTitle: "¿Hacer pública esta captura?",
  publishIntro: "Aparecerá en la galería pública, con:",
  publishImage: "la imagen",
  publishTarget: (designation) => `el objeto: ${designation}`,
  publishEquipment: "el equipo",
  publishMonth: (month) => `el mes de la noche: ${month}`,
  publishMonths: (months) => `los meses de las noches: ${months}`,
  publishSky: "la calidad del cielo",
  publishNoPlace:
    "Ni el lugar ni sus coordenadas: la posición también se retira del archivo publicado.",
  // A server with no team: its owner decides alone (the three lines of the
  // tab).
  ruleDecide:
    "Solo usted decide qué es público, y puede volver a hacer privada una captura en cualquier momento.",
  rulePublic: "Una captura pública puede verla cualquiera, sin iniciar sesión.",
  ruleResponsible:
    "Nadie más en este servidor verifica lo que usted publica. Usted es responsable de ello.",
  publishConfirm: "Hacer pública",
  cancel: "Cancelar",
  close: "Cerrar",
  loading: "Cargando tus capturas…",
  loadFailed:
    "No se ha podido leer la lista de tus capturas. Vuelve a intentarlo más tarde.",
  notFound: "Esta captura ya no está en tu espacio.",
  retry: "Reintentar",
  changeFailed:
    "No se ha podido modificar la captura. Vuelve a intentarlo más tarde.",
  syncNothing: "No hay nada nuevo que tomar.",
  syncDone: "Las líneas están actualizadas.",
  viewLabel: "Vista",
  listView: "Lista",
  mapView: "Mapa",
  allChip: "Todas",
  searchTarget: "Buscar un objetivo",
  reverseSort: "Invertir el orden por fecha",
  newestFirst: "Más recientes",
  oldestFirst: "Más antiguas",
  counter: (captures, targets) =>
    `${captures} ${captures === 1 ? "captura" : "capturas"} · ${targets} ${targets === 1 ? "objetivo" : "objetivos"}`,
  noMatch: "Ninguna captura corresponde a este filtro.",
  storageUsed: (used, quota) => `${used} usados de ${quota}`,
  storageUsedAlone: (used) => `${used} usados`,
  storageIncluded: "Incluido",
  storageLeft: (left) => `Quedan ${left}`,
  storageInfo:
    "Las copias mostradas en las galerías y las miniaturas no cuentan: solo cuentan tus originales.",
  storageInfoLabel: "Espacio usado: lo que cambia",
  variantsInfoLabel: "Variantes de una captura: lo que cambia",
  messageInfoLabel: "Visibilidad de la imagen principal anterior y de la nueva",
  storageFull: "Tu espacio está lleno: una nueva captura no cabe.",
  integration: (duration) => `Integración ${duration}`,
  integrationUnknown: "Integración no anotada",
  stageDraft: "Borrador",
  archived: "Archivada",
  stageFinalized: "Finalizada",
  personal: "Objetivo personal",
  fileZone: "Archivo",
  downloadOriginal: (kind, size) =>
    `Descargar el original (${[kind, size].filter(Boolean).join(", ")})`,
  fileSent: "El archivo que envió, sin cambios.",
  fileMain: "El archivo de la imagen principal, sin cambios.",
  fileInfo:
    "Es el archivo tal como se envió, con sus metadatos. Las galerías solo muestran una copia, sin la ubicación, y nunca ofrecen una descarga.",
  addVariant: "Añadir una variante",
  stateZone: "Estado",
  draftLine: "Borrador: la captura aún no está finalizada.",
  finalize: "Finalizar esta captura",
  draftBanner: "Borrador: esta captura aún no aparece en tu galería privada.",
  draftBannerHint:
    "Finalízala cuando esté lista: entonces aparecerá en tu galería privada y podrás hacerla pública.",
  finalized: "Finalizada.",
  finalizedOn: (day) => `Finalizada el ${day}.`,
  finalizeFirst: "Finaliza la captura para poder hacerla pública.",
  makePublic: "Hacer pública",
  draftInfo:
    "Una captura enviada por el teléfono o por Astro Sync llega como borrador. Finalícela cuando esté lista: entonces podrá hacerse pública.",
  skyZone: "Plate solving",
  skyProvenance: {
    "astro-sync": (date) =>
      `Solución de cielo: calculada por Astro Sync el ${date}.`,
    "astrometry-net": (date) =>
      `Solución de cielo: calculada con astrometry.net el ${date}.`,
    import: (date) =>
      `Solución de cielo: traída del antiguo portal el ${date}.`,
  },
  skyShow: "Mostrar el plate solving",
  skyOn: "La galería ofrece las anotaciones de esta captura.",
  skyOff: "La galería no ofrece las anotaciones de esta captura.",
  skyNone:
    "Esta imagen no tiene solución de cielo: las anotaciones no se pueden dibujar.",
  skyInfoLabel: "Plate solving: qué cambia",
  skyInfo:
    "Una solución de cielo dice dónde está la imagen en el cielo. Con ella, la galería puede dibujar sobre la imagen el nombre del objetivo, objetos cercanos y estrellas, que el visitante muestra u oculta. Si lo desactiva, las anotaciones desaparecen de la galería; la solución sigue guardada.",
  skyInfoNone:
    "Una solución de cielo dice dónde está la imagen en el cielo; sin ella, las anotaciones no se pueden dibujar. Astro Sync, la aplicación de escritorio, la calcula en tu ordenador a partir de la imagen y la envía aquí: descarga la aplicación desde la página de descargas del sitio, abre después «Anotaciones» y resuelve esta captura.",
  skyAstroSync: "Resolver en Astro Sync",
  skyServer: "Resolver en este servidor",
  skyRunning: "Resolviendo…",
  skyFailed: {
    not_solved:
      "Se reconocieron muy pocas estrellas, o el campo está fuera de los índices instalados.",
    unreadable_solution: "No se pudo leer el resultado de la resolución.",
    not_started: "La herramienta de resolución del servidor no arranca.",
    image_changed: "La imagen cambió durante la resolución.",
    sky_solution_aspect_mismatch:
      "El resultado no coincide con las proporciones de la imagen.",
    other: "La resolución no tuvo éxito.",
  },
  deleteBodyImages: (count) =>
    `La captura y sus ${count} imágenes se borran de tu espacio, con sus archivos.`,
  freed: (size) => `Se liberan ${size}.`,
  variantsZone: "Variantes",
  variantsPending:
    "Ha llegado una nueva variante: es privada, la imagen principal no ha cambiado.",
  variantsCount: (count) =>
    `${count} imágenes: la galería privada las muestra todas; la galería pública, la imagen principal y luego las variantes públicas.`,
  variantsInfo:
    "Una nueva imagen enviada para la misma captura se añade aquí como variante privada. La imagen principal solo cambia si usted elige otra. Una variante solo es pública si la captura lo es. Todas las imágenes cuentan en el espacio usado.",
  mainPill: "Principal",
  variantPill: "Variante",
  progressionZone: "Progresión de la noche",
  progressionLine:
    "Los hitos que Astro Sync apiló durante la noche, de la primera toma a todas. Se muestran con la captura en las galerías y no cuentan entre las variantes.",
  progressionFrames: (count) => `${count} toma${count === 1 ? "" : "s"}`,
  progressionStep: (index, count) =>
    count
      ? `Hito ${index} — ${count} toma${count === 1 ? "" : "s"}`
      : `Hito ${index}`,
  // The image of a multi-night plan: its stacked image after each night.
  progressionPlanZone: "Progresión del apilado",
  progressionPlanLine:
    "La imagen apilada tras cada noche, de la primera noche a la imagen final. Se muestran con la captura en las galerías y no cuentan entre las variantes.",
  progressionPlanStep: (index, count) =>
    count
      ? `Tras la noche ${index} — ${count} toma${count === 1 ? "" : "s"}`
      : `Tras la noche ${index}`,
  editNames: "Editar el título y la descripción",
  titleLabel: "Título",
  titleHelp: (fallback) => `Opcional. Por defecto: «${fallback}».`,
  descriptionLabel: "Descripción",
  descriptionHelp:
    "Opcional. Aparece bajo la imagen, en la galería, si la variante es pública.",
  mainDescriptionHelp:
    "Opcional. Aparece bajo la imagen, en la galería, si la captura es pública.",
  textCount: (count, max) => `${count} / ${max}`,
  textTooLong: (max) => `${max} caracteres como máximo.`,
  saveTitle: "Guardar el título",
  saveDescription: "Guardar la descripción",
  sources: {
    phone: "Teléfono",
    web: "Web",
    "astro-sync": "Astro Sync",
    stacking: "Astro Sync · apilado",
  },
  digest: (short) => `SHA-256 ${short}`,
  makeVariantPublic: "Hacer pública esta variante",
  deleteVariant: "Eliminar esta variante",
  useAsMain: "Usar como imagen principal",
  deleteMain: "Eliminar la imagen principal",
  deleteMainRefused:
    "Elige primero otra imagen principal: la imagen principal nunca se elimina sola.",
  useAsMainTitle: "¿Usar como imagen principal?",
  useAsMainBody: (name, file, size, target) =>
    `La variante «${name}» (${file}, ${size}) será la imagen principal de ${target}: es la que la galería mostrará primero.`,
  becomesPublic:
    "Esta variante es privada: como imagen principal, será pública, como la captura.",
  becomesPublicInfo: (name, file) =>
    `La imagen principal actual («${name}», ${file}) pasa a ser una variante y sigue pública. La visibilidad de la imagen principal es siempre la de la captura.`,
  mainChosenPublic: (chosen, former) =>
    `${chosen} es ahora la imagen principal, así que pública como la captura; ${former} sigue pública, como variante.`,
  mainChosen: (chosen, former, isPublic) =>
    `${chosen} es ahora la imagen principal; ${former} sigue ${isPublic ? "pública" : "privada"}, como variante.`,
  deleteVariantTitle: "¿Eliminar esta variante?",
  deleteVariantBody: (name, file, source, when, size) =>
    `La variante «${name}» (${[file, source, when, size].filter(Boolean).join(", ")}) se eliminará de tu espacio, con su archivo.`,
  deleteVariantPublic: "También desaparece de la galería pública.",
  deleteVariantKeeps: (size) =>
    `La imagen principal y la captura no cambian. Se liberan ${size}.`,
  addTitle: "Añadir una captura",
  addTo: (designation) => `Añadir a ${designation}`,
  steps: { night: "Noche", target: "Objetivo", image: "Imagen" },
  stepsLabel: "Pasos",
  nightTargets: (place, count) =>
    [
      place,
      `${count} ${count === 1 ? "objetivo observado" : "objetivos observados"}`,
    ]
      .filter(Boolean)
      .join(" · "),
  outcomes: { done: "Hecho", partial: "Parcial" },
  captureCount: (count) => `${count} ${count === 1 ? "captura" : "capturas"}`,
  notInCatalogue: "Un objetivo que no está en el catálogo",
  searchNoResult: "Ningún objetivo del catálogo corresponde.",
  back: "Volver",
  dropHere: "Suelta la imagen aquí",
  chooseFile: "Elegir un archivo",
  addedAsDraft: "Se añadirá como borrador, privada.",
  nightLabel: "Noche",
  integrationLabel: "Integración",
  newTarget: "Nuevo objetivo",
  nameLabel: "Nombre",
  nameFromFile: "Propuesto a partir del nombre del archivo.",
  placeLabel: "Lugar",
  placeNearest: "El lugar guardado más cercano a la foto.",
  dateLabel: "Fecha",
  alreadyPresent: (file) =>
    `${file} ya está en tu espacio: no se ha enviado nada.`,
  checking: "Comprobando el archivo…",
  targetFailed: "No se pudo crear el objetivo. Inténtalo más tarde.",
  nightsLoading: "Cargando tus noches…",
  // The add box's step « Rangement ».
  stepFiling: "Destino",
  filingChange: "Cambiar",
  filingEdit: "Modificar",
  filingTitle: (count) =>
    count > 1
      ? "Estas capturas se guardarán en tus sesiones"
      : "Esta captura se guardará en una sesión",
  filingFromPhoto: (date, time) => `Según la foto · ${date}, ${time}`,
  filingNoExif:
    "Esta imagen no lleva ni fecha ni posición: cambia la noche si es otra.",
  filingNightAssumed: (date) => `Noche del ${date} · supuesta`,
  filingPlace: (name) => `Lugar: ${name}`,
  filingPlaceCurrent: "Lugar actual",
  filingPlacePhoto: "Posición de la foto",
  filingTarget: (name) => `Objetivo: ${name}`,
  filingTargetNone: "Objetivo: por precisar",
  filingTargetFromFile: "Según el nombre del archivo",
  filingTargetClear: "Dejar el objetivo por precisar",
  filingNewTargetUse: "Usar este nombre",
  filingExistsTitle: "Esta noche ya tiene una sesión",
  filingAttachAsk: (day) => `¿Asociar a la noche del ${day}?`,
  filingAttachChoice: (date) => `Asociar a la sesión del ${date}`,
  filingCreateChoice: "Crear una sesión nueva",
  filingCreateAndSend: "Crear la sesión y enviar",
  filingCreateManyAndSend: (n) => `Crear ${n} sesiones y enviar`,
  filingAttachAndSend: (day) => `Asociar a la noche del ${day} y enviar`,
  filingSendAll: "Guardar y enviar",
  filingPickExisting: "Elegir una sesión existente",
  // A public capture also leaves the public gallery when deleted.
  deletePublicNote: "También sale de la galería pública.",
};

const it = {
  title: "Riprese",
  help: "Privata: solo nella sua galleria privata. Pubblica: anche nella galleria pubblica.",
  infoLabel: "Privata, pubblica: che cosa cambia",
  usage: (count, limit) =>
    `${count === 1 ? "1 ripresa" : `${count} riprese`} su ${limit}`,
  // The free space says it is a limit.
  add: "Aggiungere una ripresa",
  open: "Aprire la ripresa",
  // The title of a capture that has no target.
  noTarget: "Ripresa senza titolo",
  night: (date) => `Notte del ${date}`,
  added: (date) => `Aggiunta il ${date}`,
  visibility: "Visibilità",
  private: "Privata",
  public: "Pubblica",
  publicSince: (date) => `Pubblica dal ${date}`,
  publicSinceUnknown: "Pubblica, data sconosciuta",
  noImageShort: "Senza immagine",
  noImage:
    "Ancora nessuna immagine: le invii da Astro Sync o ne aggiungi una qui.",
  addImage: "Aggiungere un’immagine",
  publishNoImage:
    "Una cattura senza immagine non può essere resa pubblica: aggiungi prima un’immagine.",
  targetZone: "Bersaglio",
  targetNone: "Ancora nessun bersaglio.",
  targetAdd: "Aggiungere un bersaglio",
  targetChoose: "Scegliere un bersaglio",
  targetChange: (d) => `Cambiare ${d}`,
  targetRemove: (d) => `Rimuovere ${d}`,
  targetCancel: "Annulla",
  createWithoutImage: "Creare la cattura senza immagine",
  definitionFailed: "Impossibile creare la cattura. Riprova più tardi.",
  definitionName: "La cattura",
  notShowable:
    "Questo file non può essere mostrato nella galleria pubblica: solo le immagini possono essere pubbliche.",
  quotaTitle: (file) =>
    `${file} non è stata aggiunta: il tuo spazio non ha più posto.`,
  tooLargeTitle: (file) =>
    `${file} non è stata aggiunta: il file è troppo grande per il tuo spazio.`,
  contentRefusedTitle: (file) =>
    `${file} non è stata aggiunta: questo tipo di file non è accettato.`,
  uploadFailedTitle: (file) => `${file} non è stata aggiunta.`,
  tryLater: "Riprova tra un momento.",
  emptyTitle: "Ancora nessuna ripresa",
  emptyBody:
    "Arrivano con Astro Sync dal tuo computer, con PlanAstro sul tuo telefono o da questa pagina.",
  retired: "Tolta dalla galleria pubblica.",
  allCaptures: "Tutte le riprese",
  captureLabel: (title) => `Ripresa ${title}`,
  alreadyVisible: "Già visibile nella galleria pubblica.",
  equipment: "Attrezzatura",
  month: "Mese della notte",
  monthPlan: "Mesi delle notti",
  sky: "Qualità del cielo",
  place: "Luogo",
  placeValue: (name) => `${name} (mai pubblicato)`,
  bortle: (value) => `Bortle ${value}`,
  tags: "Tag",
  tagsHelp: "Separati da virgole. Visibili solo nella tua galleria privata.",
  tagsBounds: "Al massimo 40 caratteri per tag e 20 tag per ripresa.",
  saveTags: "Salvare i tag",
  deleteCapture: "Eliminare la ripresa",
  deleteTitle: (title) => `Eliminare «${title}»?`,
  deleteBody: "La ripresa e il suo file vengono cancellati dal tuo spazio.",
  publishTitle: "Rendere pubblica questa ripresa?",
  publishIntro: "Apparirà nella galleria pubblica, con:",
  publishImage: "l’immagine",
  publishTarget: (designation) => `l’oggetto: ${designation}`,
  publishEquipment: "l’attrezzatura",
  publishMonth: (month) => `il mese della notte: ${month}`,
  publishMonths: (months) => `i mesi delle notti: ${months}`,
  publishSky: "la qualità del cielo",
  publishNoPlace:
    "Né il luogo né le sue coordinate: la posizione viene tolta anche dal file pubblicato.",
  // A server with no team: its owner decides alone (the three lines of the
  // tab).
  ruleDecide:
    "Solo lei decide che cosa è pubblico e può rendere di nuovo privata una cattura in qualsiasi momento.",
  rulePublic:
    "Una cattura pubblica può essere vista da chiunque, senza accedere.",
  ruleResponsible:
    "Nessun altro su questo server controlla ciò che pubblica. Ne è responsabile.",
  publishConfirm: "Rendere pubblica",
  cancel: "Annulla",
  close: "Chiudi",
  loading: "Caricamento delle tue riprese…",
  loadFailed:
    "Non è stato possibile leggere l’elenco delle tue riprese. Riprova più tardi.",
  notFound: "Questa ripresa non è più nel suo spazio.",
  retry: "Riprova",
  changeFailed:
    "Non è stato possibile modificare la ripresa. Riprova più tardi.",
  syncNothing: "Non c’è nulla di nuovo da riprendere.",
  syncDone: "Le righe sono aggiornate.",
  viewLabel: "Vista",
  listView: "Elenco",
  mapView: "Mappa",
  allChip: "Tutte",
  searchTarget: "Cercare un obiettivo",
  reverseSort: "Invertire l’ordine per data",
  newestFirst: "Più recenti",
  oldestFirst: "Meno recenti",
  counter: (captures, targets) =>
    `${captures} ${captures === 1 ? "ripresa" : "riprese"} · ${targets} ${targets === 1 ? "obiettivo" : "obiettivi"}`,
  noMatch: "Nessuna ripresa corrisponde a questo filtro.",
  storageUsed: (used, quota) => `${used} usati su ${quota}`,
  storageUsedAlone: (used) => `${used} usati`,
  storageIncluded: "Incluso",
  storageLeft: (left) => `Restano ${left}`,
  storageInfo:
    "Le copie mostrate nelle gallerie e le miniature non contano: contano solo i tuoi originali.",
  storageInfoLabel: "Spazio usato: cosa cambia",
  variantsInfoLabel: "Varianti di una ripresa: cosa cambia",
  messageInfoLabel:
    "Visibilità dell’immagine principale precedente e di quella nuova",
  storageFull: "Il suo spazio è pieno: una nuova ripresa non può entrarci.",
  integration: (duration) => `Integrazione ${duration}`,
  integrationUnknown: "Integrazione non annotata",
  stageDraft: "Bozza",
  archived: "Archiviata",
  stageFinalized: "Finalizzata",
  personal: "Obiettivo personale",
  fileZone: "File",
  downloadOriginal: (kind, size) =>
    `Scaricare l’originale (${[kind, size].filter(Boolean).join(", ")})`,
  fileSent: "Il file che ha inviato, senza modifiche.",
  fileMain: "Il file dell’immagine principale, senza modifiche.",
  fileInfo:
    "È il file così come è stato inviato, con i suoi metadati. Le gallerie ne mostrano solo una copia, senza la posizione, e non offrono mai un download.",
  addVariant: "Aggiungere una variante",
  stateZone: "Stato",
  draftLine: "Bozza: la ripresa non è ancora finalizzata.",
  finalize: "Finalizzare questa ripresa",
  draftBanner:
    "Bozza: questa ripresa non compare ancora nella tua galleria privata.",
  draftBannerHint:
    "Finalizzala quando è pronta: comparirà allora nella tua galleria privata e potrai renderla pubblica.",
  finalized: "Finalizzata.",
  finalizedOn: (day) => `Finalizzata il ${day}.`,
  finalizeFirst: "Finalizzi la ripresa per poterla rendere pubblica.",
  makePublic: "Rendere pubblica",
  draftInfo:
    "Una ripresa inviata dal telefono o da Astro Sync arriva come bozza. La finalizzi quando è pronta: potrà allora diventare pubblica.",
  skyZone: "Plate solving",
  skyProvenance: {
    "astro-sync": (date) =>
      `Soluzione del cielo: calcolata da Astro Sync il ${date}.`,
    "astrometry-net": (date) =>
      `Soluzione del cielo: calcolata con astrometry.net il ${date}.`,
    import: (date) =>
      `Soluzione del cielo: ripresa dal vecchio portale il ${date}.`,
  },
  skyShow: "Mostrare il plate solving",
  skyOn: "La galleria propone le annotazioni di questa ripresa.",
  skyOff: "La galleria non propone le annotazioni di questa ripresa.",
  skyNone:
    "Questa immagine non ha una soluzione del cielo: le annotazioni non possono essere disegnate.",
  skyInfoLabel: "Plate solving: cosa cambia",
  skyInfo:
    "Una soluzione del cielo dice dove si trova l’immagine nel cielo. Con essa, la galleria può disegnare sull’immagine il nome del bersaglio, gli oggetti vicini e le stelle, che il visitatore mostra o nasconde. Disattivando questa scelta, le annotazioni spariscono dalla galleria; la soluzione resta memorizzata.",
  skyInfoNone:
    "Una soluzione del cielo dice dove si trova l’immagine nel cielo; senza, le annotazioni non possono essere disegnate. Astro Sync, l’applicazione desktop, la calcola sul tuo computer a partire dall’immagine e la invia qui: scarica l’applicazione dalla pagina di download del sito, poi apri «Annotazioni» e risolvi questa ripresa.",
  skyAstroSync: "Risolvere in Astro Sync",
  skyServer: "Risolvere su questo server",
  skyRunning: "Risoluzione in corso…",
  skyFailed: {
    not_solved:
      "Troppe poche stelle riconosciute, o campo fuori dagli indici installati.",
    unreadable_solution:
      "Il risultato della risoluzione non ha potuto essere letto.",
    not_started: "Lo strumento di risoluzione del server non si avvia.",
    image_changed: "L’immagine è cambiata durante la risoluzione.",
    sky_solution_aspect_mismatch:
      "Il risultato non corrisponde alle proporzioni dell’immagine.",
    other: "La risoluzione non è riuscita.",
  },
  deleteBodyImages: (count) =>
    `La ripresa e le sue ${count} immagini vengono cancellate dal tuo spazio, con i loro file.`,
  freed: (size) => `Si liberano ${size}.`,
  variantsZone: "Varianti",
  variantsPending:
    "È arrivata una nuova variante: è privata, l’immagine principale non è cambiata.",
  variantsCount: (count) =>
    `${count} immagini: la galleria privata le mostra tutte; la galleria pubblica, l’immagine principale, poi le varianti pubbliche.`,
  variantsInfo:
    "Una nuova immagine inviata per la stessa ripresa si aggiunge qui come variante privata. L’immagine principale cambia solo se ne sceglie un’altra. Una variante è pubblica solo se lo è la ripresa. Tutte le immagini contano nello spazio usato.",
  mainPill: "Principale",
  variantPill: "Variante",
  progressionZone: "Progressione della notte",
  progressionLine:
    "Le tappe che Astro Sync ha impilato durante la notte, dal primo frame a tutti. Sono mostrate con l’acquisizione nelle gallerie e non contano tra le varianti.",
  progressionFrames: (count) => `${count} frame`,
  progressionStep: (index, count) =>
    count ? `Tappa ${index} — ${count} frame` : `Tappa ${index}`,
  // The image of a multi-night plan: its stacked image after each night.
  progressionPlanZone: "Progressione dell’impilamento",
  progressionPlanLine:
    "L’immagine impilata dopo ogni notte, dalla prima notte all’immagine finale. Sono mostrate con l’acquisizione nelle gallerie e non contano tra le varianti.",
  progressionPlanStep: (index, count) =>
    count
      ? `Dopo la notte ${index} — ${count} frame`
      : `Dopo la notte ${index}`,
  editNames: "Modificare il titolo e la descrizione",
  titleLabel: "Titolo",
  titleHelp: (fallback) => `Facoltativo. In mancanza: «${fallback}».`,
  descriptionLabel: "Descrizione",
  descriptionHelp:
    "Facoltativa. Compare sotto l’immagine, nella galleria, se la variante è pubblica.",
  mainDescriptionHelp:
    "Facoltativa. Compare sotto l’immagine, nella galleria, se la ripresa è pubblica.",
  textCount: (count, max) => `${count} / ${max}`,
  textTooLong: (max) => `Al massimo ${max} caratteri.`,
  saveTitle: "Salvare il titolo",
  saveDescription: "Salvare la descrizione",
  sources: {
    phone: "Telefono",
    web: "Web",
    "astro-sync": "Astro Sync",
    stacking: "Astro Sync · stacking",
  },
  digest: (short) => `SHA-256 ${short}`,
  makeVariantPublic: "Rendere pubblica questa variante",
  deleteVariant: "Eliminare questa variante",
  useAsMain: "Usare come immagine principale",
  deleteMain: "Eliminare l’immagine principale",
  deleteMainRefused:
    "Scegli prima un’altra immagine principale: l’immagine principale non si elimina mai da sola.",
  useAsMainTitle: "Usare come immagine principale?",
  useAsMainBody: (name, file, size, target) =>
    `La variante «${name}» (${file}, ${size}) diventerà l’immagine principale di ${target}: è quella che la galleria mostrerà per prima.`,
  becomesPublic:
    "Questa variante è privata: come immagine principale sarà pubblica, come la ripresa.",
  becomesPublicInfo: (name, file) =>
    `L’immagine principale attuale («${name}», ${file}) diventa una variante e resta pubblica. La visibilità dell’immagine principale è sempre quella della ripresa.`,
  mainChosenPublic: (chosen, former) =>
    `${chosen} è ora l’immagine principale, quindi pubblica come la ripresa; ${former} resta pubblica, come variante.`,
  mainChosen: (chosen, former, isPublic) =>
    `${chosen} è ora l’immagine principale; ${former} resta ${isPublic ? "pubblica" : "privata"}, come variante.`,
  deleteVariantTitle: "Eliminare questa variante?",
  deleteVariantBody: (name, file, source, when, size) =>
    `La variante «${name}» (${[file, source, when, size].filter(Boolean).join(", ")}) sarà eliminata dal tuo spazio, con il suo file.`,
  deleteVariantPublic: "Scompare anche dalla galleria pubblica.",
  deleteVariantKeeps: (size) =>
    `L’immagine principale e la ripresa non cambiano. Si liberano ${size}.`,
  addTitle: "Aggiungere una ripresa",
  addTo: (designation) => `Aggiungere a ${designation}`,
  steps: { night: "Notte", target: "Obiettivo", image: "Immagine" },
  stepsLabel: "Passaggi",
  nightTargets: (place, count) =>
    [
      place,
      `${count} ${count === 1 ? "obiettivo osservato" : "obiettivi osservati"}`,
    ]
      .filter(Boolean)
      .join(" · "),
  outcomes: { done: "Fatto", partial: "Parziale" },
  captureCount: (count) => `${count} ${count === 1 ? "ripresa" : "riprese"}`,
  notInCatalogue: "Un obiettivo che non è nel catalogo",
  searchNoResult: "Nessun obiettivo del catalogo corrisponde.",
  back: "Indietro",
  dropHere: "Trascina qui l’immagine",
  chooseFile: "Scegliere un file",
  addedAsDraft: "Sarà aggiunta come bozza, privata.",
  nightLabel: "Notte",
  integrationLabel: "Integrazione",
  newTarget: "Nuovo obiettivo",
  nameLabel: "Nome",
  nameFromFile: "Proposto dal nome del file.",
  placeLabel: "Luogo",
  placeNearest: "Il luogo salvato più vicino alla foto.",
  dateLabel: "Data",
  alreadyPresent: (file) =>
    `${file} è già nel tuo spazio: non è stato inviato nulla.`,
  checking: "Verifica del file…",
  targetFailed: "Non è stato possibile creare l’obiettivo. Riprova più tardi.",
  nightsLoading: "Caricamento delle tue notti…",
  // The add box's step « Rangement ».
  stepFiling: "Archiviazione",
  filingChange: "Cambia",
  filingEdit: "Modifica",
  filingTitle: (count) =>
    count > 1
      ? "Queste riprese saranno archiviate nelle loro sessioni"
      : "Questa ripresa sarà archiviata in una sessione",
  filingFromPhoto: (date, time) => `Dalla foto · ${date}, ${time}`,
  filingNoExif:
    "Questa immagine non contiene né data né posizione: cambia la notte se è un’altra.",
  filingNightAssumed: (date) => `Notte del ${date} · presunta`,
  filingPlace: (name) => `Luogo: ${name}`,
  filingPlaceCurrent: "Luogo corrente",
  filingPlacePhoto: "Posizione della foto",
  filingTarget: (name) => `Target: ${name}`,
  filingTargetNone: "Target: da precisare",
  filingTargetFromFile: "Dal nome del file",
  filingTargetClear: "Lasciare il target da precisare",
  filingNewTargetUse: "Usare questo nome",
  filingExistsTitle: "Questa notte ha già una sessione",
  filingAttachAsk: (day) => `Collegare alla notte del ${day}?`,
  filingAttachChoice: (date) => `Collegare alla sessione del ${date}`,
  filingCreateChoice: "Creare una nuova sessione",
  filingCreateAndSend: "Creare la sessione e inviare",
  filingCreateManyAndSend: (n) => `Creare ${n} sessioni e inviare`,
  filingAttachAndSend: (day) => `Collegare alla notte del ${day} e inviare`,
  filingSendAll: "Archiviare e inviare",
  filingPickExisting: "Scegliere una sessione esistente",
  // A public capture also leaves the public gallery when deleted.
  deletePublicNote: "Esce anche dalla galleria pubblica.",
};

const ptBR = {
  title: "Capturas",
  help: "Privada: só na sua galeria privada. Pública: também na galeria pública.",
  infoLabel: "Privada, pública: o que muda",
  usage: (count, limit) => `${count} de ${limit} capturas`,
  // The free space says it is a limit.
  add: "Adicionar uma captura",
  open: "Abrir a captura",
  // The title of a capture that has no target.
  noTarget: "Captura sem título",
  night: (date) => `Noite de ${date}`,
  added: (date) => `Adicionada em ${date}`,
  visibility: "Visibilidade",
  private: "Privada",
  public: "Pública",
  publicSince: (date) => `Pública desde ${date}`,
  publicSinceUnknown: "Pública, data desconhecida",
  noImageShort: "Sem imagem",
  noImage:
    "Nenhuma imagem por enquanto: envie-as do Astro Sync ou adicione uma aqui.",
  addImage: "Adicionar uma imagem",
  publishNoImage:
    "Uma captura sem imagem não pode ser tornada pública: adicione uma primeiro.",
  targetZone: "Alvo",
  targetNone: "Nenhum alvo por enquanto.",
  targetAdd: "Adicionar um alvo",
  targetChoose: "Escolher um alvo",
  targetChange: (d) => `Alterar ${d}`,
  targetRemove: (d) => `Remover ${d}`,
  targetCancel: "Cancelar",
  createWithoutImage: "Criar a captura sem imagem",
  definitionFailed:
    "Não foi possível criar a captura. Tente novamente mais tarde.",
  definitionName: "A captura",
  notShowable:
    "Este arquivo não pode ser mostrado na galeria pública: só imagens podem ser públicas.",
  quotaTitle: (file) =>
    `${file} não foi adicionada: seu espaço não tem mais lugar para ela.`,
  tooLargeTitle: (file) =>
    `${file} não foi adicionada: o arquivo é grande demais para o seu espaço.`,
  contentRefusedTitle: (file) =>
    `${file} não foi adicionada: este tipo de arquivo não é aceito.`,
  uploadFailedTitle: (file) => `${file} não foi adicionada.`,
  tryLater: "Tente de novo em um instante.",
  emptyTitle: "Nenhuma captura por enquanto",
  emptyBody:
    "Elas chegam pelo Astro Sync no seu computador, pelo PlanAstro no seu celular ou por esta página.",
  retired: "Retirada da galeria pública.",
  allCaptures: "Todas as capturas",
  captureLabel: (title) => `Captura ${title}`,
  alreadyVisible: "Já visível na galeria pública.",
  equipment: "Equipamento",
  month: "Mês da noite",
  monthPlan: "Meses das noites",
  sky: "Qualidade do céu",
  place: "Lugar",
  placeValue: (name) => `${name} (nunca publicado)`,
  bortle: (value) => `Bortle ${value}`,
  tags: "Tags",
  tagsHelp: "Separadas por vírgulas. Visíveis só na sua galeria privada.",
  tagsBounds: "No máximo 40 caracteres por tag e 20 tags por captura.",
  saveTags: "Salvar as tags",
  deleteCapture: "Excluir a captura",
  deleteTitle: (title) => `Excluir “${title}”?`,
  deleteBody: "A captura e seu arquivo são apagados do seu espaço.",
  publishTitle: "Tornar esta captura pública?",
  publishIntro: "Ela aparecerá na galeria pública, com:",
  publishImage: "a imagem",
  publishTarget: (designation) => `o objeto: ${designation}`,
  publishEquipment: "o equipamento",
  publishMonth: (month) => `o mês da noite: ${month}`,
  publishMonths: (months) => `os meses das noites: ${months}`,
  publishSky: "a qualidade do céu",
  publishNoPlace:
    "Nem o lugar nem suas coordenadas: a posição também é retirada do arquivo publicado.",
  // A server with no team: its owner decides alone (the three lines of the
  // tab).
  ruleDecide:
    "Só você decide o que é público e pode tornar uma captura privada de novo a qualquer momento.",
  rulePublic:
    "Uma captura pública pode ser vista por qualquer pessoa, sem entrar.",
  ruleResponsible:
    "Ninguém mais neste servidor verifica o que você publica. A responsabilidade é sua.",
  publishConfirm: "Tornar pública",
  cancel: "Cancelar",
  close: "Fechar",
  loading: "Carregando suas capturas…",
  loadFailed:
    "Não foi possível ler a lista das suas capturas. Tente de novo mais tarde.",
  notFound: "Esta captura não está mais no seu espaço.",
  retry: "Tentar de novo",
  changeFailed: "Não foi possível alterar a captura. Tente de novo mais tarde.",
  syncNothing: "Não há nada de novo para trazer.",
  syncDone: "As linhas foram atualizadas.",
  viewLabel: "Exibição",
  listView: "Lista",
  mapView: "Mapa",
  allChip: "Todas",
  searchTarget: "Buscar um alvo",
  reverseSort: "Inverter a ordem por data",
  newestFirst: "Mais recentes",
  oldestFirst: "Mais antigas",
  counter: (captures, targets) =>
    `${captures} ${captures === 1 ? "captura" : "capturas"} · ${targets} ${targets === 1 ? "alvo" : "alvos"}`,
  noMatch: "Nenhuma captura corresponde a este filtro.",
  storageUsed: (used, quota) => `${used} usados de ${quota}`,
  storageUsedAlone: (used) => `${used} usados`,
  storageIncluded: "Incluído",
  storageLeft: (left) => `Restam ${left}`,
  storageInfo:
    "As cópias mostradas nas galerias e as miniaturas não contam: só os seus originais contam.",
  storageInfoLabel: "Espaço usado: o que muda",
  variantsInfoLabel: "Variantes de uma captura: o que muda",
  messageInfoLabel: "Visibilidade da imagem principal anterior e da nova",
  storageFull: "Seu espaço está cheio: uma nova captura não cabe nele.",
  integration: (duration) => `Integração ${duration}`,
  integrationUnknown: "Integração não anotada",
  stageDraft: "Rascunho",
  archived: "Arquivada",
  stageFinalized: "Finalizada",
  personal: "Alvo pessoal",
  fileZone: "Arquivo",
  downloadOriginal: (kind, size) =>
    `Baixar o original (${[kind, size].filter(Boolean).join(", ")})`,
  fileSent: "O arquivo que você enviou, sem alteração.",
  fileMain: "O arquivo da imagem principal, sem alteração.",
  fileInfo:
    "É o arquivo tal como foi enviado, com os seus metadados. As galerias mostram apenas uma cópia, sem a localização, e nunca oferecem download.",
  addVariant: "Adicionar uma variante",
  stateZone: "Estado",
  draftLine: "Rascunho: a captura ainda não foi finalizada.",
  finalize: "Finalizar esta captura",
  draftBanner:
    "Rascunho: esta captura ainda não aparece na sua galeria privada.",
  draftBannerHint:
    "Finalize-a quando estiver pronta: ela aparecerá então na sua galeria privada, e você poderá torná-la pública.",
  finalized: "Finalizada.",
  finalizedOn: (day) => `Finalizada em ${day}.`,
  finalizeFirst: "Finalize a captura para poder torná-la pública.",
  makePublic: "Tornar pública",
  draftInfo:
    "Uma captura enviada pelo telefone ou pelo Astro Sync chega como rascunho. Finalize-a quando estiver pronta: então ela poderá ficar pública.",
  skyZone: "Plate solving",
  skyProvenance: {
    "astro-sync": (date) =>
      `Solução do céu: calculada pelo Astro Sync em ${date}.`,
    "astrometry-net": (date) =>
      `Solução do céu: calculada com o astrometry.net em ${date}.`,
    import: (date) => `Solução do céu: trazida do antigo portal em ${date}.`,
  },
  skyShow: "Mostrar o plate solving",
  skyOn: "A galeria oferece as anotações desta captura.",
  skyOff: "A galeria não oferece as anotações desta captura.",
  skyNone:
    "Esta imagem não tem solução do céu: as anotações não podem ser desenhadas.",
  skyInfoLabel: "Plate solving: o que isso muda",
  skyInfo:
    "Uma solução do céu diz onde a imagem está no céu. Com ela, a galeria pode desenhar sobre a imagem o nome do alvo, objetos próximos e estrelas, que o visitante mostra ou oculta. Desativar esta opção tira as anotações da galeria; a solução continua guardada.",
  skyInfoNone:
    "Uma solução do céu diz onde a imagem está no céu; sem ela, as anotações não podem ser desenhadas. O Astro Sync, o aplicativo de desktop, a calcula no seu computador a partir da imagem e a envia para cá: baixe o aplicativo na página de download do site, depois abra «Anotações» e resolva esta captura.",
  skyAstroSync: "Resolver no Astro Sync",
  skyServer: "Resolver neste servidor",
  skyRunning: "Resolvendo…",
  skyFailed: {
    not_solved:
      "Poucas estrelas reconhecidas, ou campo fora dos índices instalados.",
    unreadable_solution: "Não foi possível ler o resultado da resolução.",
    not_started: "A ferramenta de resolução do servidor não inicia.",
    image_changed: "A imagem mudou durante a resolução.",
    sky_solution_aspect_mismatch:
      "O resultado não corresponde às proporções da imagem.",
    other: "A resolução não teve êxito.",
  },
  deleteBodyImages: (count) =>
    `A captura e as suas ${count} imagens são apagadas do seu espaço, com os seus arquivos.`,
  freed: (size) => `${size} são liberados.`,
  variantsZone: "Variantes",
  variantsPending:
    "Uma nova variante chegou: ela é privada, a imagem principal não mudou.",
  variantsCount: (count) =>
    `${count} imagens: a galeria privada mostra todas; a galeria pública, a imagem principal e depois as variantes públicas.`,
  variantsInfo:
    "Uma nova imagem enviada para a mesma captura é adicionada aqui como variante privada. A imagem principal só muda se você escolher outra. Uma variante só é pública se a captura for. Todas as imagens contam no espaço usado.",
  mainPill: "Principal",
  variantPill: "Variante",
  progressionZone: "Progressão da noite",
  progressionLine:
    "Os marcos que o Astro Sync empilhou durante a noite, do primeiro frame a todos. Aparecem com a captura nas galerias e não contam entre as variantes.",
  progressionFrames: (count) => `${count} frame${count === 1 ? "" : "s"}`,
  progressionStep: (index, count) =>
    count
      ? `Marco ${index} — ${count} frame${count === 1 ? "" : "s"}`
      : `Marco ${index}`,
  // The image of a multi-night plan: its stacked image after each night.
  progressionPlanZone: "Progressão do empilhamento",
  progressionPlanLine:
    "A imagem empilhada depois de cada noite, da primeira noite à imagem final. Aparecem com a captura nas galerias e não contam entre as variantes.",
  progressionPlanStep: (index, count) =>
    count
      ? `Depois da noite ${index} — ${count} frame${count === 1 ? "" : "s"}`
      : `Depois da noite ${index}`,
  editNames: "Editar o título e a descrição",
  titleLabel: "Título",
  titleHelp: (fallback) => `Opcional. Por padrão: “${fallback}”.`,
  descriptionLabel: "Descrição",
  descriptionHelp:
    "Opcional. Ela aparece sob a imagem, na galeria, se a variante for pública.",
  mainDescriptionHelp:
    "Opcional. Ela aparece sob a imagem, na galeria, se a captura for pública.",
  textCount: (count, max) => `${count} / ${max}`,
  textTooLong: (max) => `No máximo ${max} caracteres.`,
  saveTitle: "Salvar o título",
  saveDescription: "Salvar a descrição",
  sources: {
    phone: "Telefone",
    web: "Web",
    "astro-sync": "Astro Sync",
    stacking: "Astro Sync · empilhamento",
  },
  digest: (short) => `SHA-256 ${short}`,
  makeVariantPublic: "Tornar esta variante pública",
  deleteVariant: "Excluir esta variante",
  useAsMain: "Usar como imagem principal",
  deleteMain: "Excluir a imagem principal",
  deleteMainRefused:
    "Escolha primeiro outra imagem principal: a imagem principal nunca é excluída sozinha.",
  useAsMainTitle: "Usar como imagem principal?",
  useAsMainBody: (name, file, size, target) =>
    `A variante “${name}” (${file}, ${size}) será a imagem principal de ${target}: é ela que a galeria mostrará primeiro.`,
  becomesPublic:
    "Esta variante é privada: como imagem principal, ela será pública, como a captura.",
  becomesPublicInfo: (name, file) =>
    `A imagem principal atual (“${name}”, ${file}) vira uma variante e continua pública. A visibilidade da imagem principal é sempre a da captura.`,
  mainChosenPublic: (chosen, former) =>
    `${chosen} agora é a imagem principal, portanto pública como a captura; ${former} continua pública, como variante.`,
  mainChosen: (chosen, former, isPublic) =>
    `${chosen} agora é a imagem principal; ${former} continua ${isPublic ? "pública" : "privada"}, como variante.`,
  deleteVariantTitle: "Excluir esta variante?",
  deleteVariantBody: (name, file, source, when, size) =>
    `A variante “${name}” (${[file, source, when, size].filter(Boolean).join(", ")}) será excluída do seu espaço, com o seu arquivo.`,
  deleteVariantPublic: "Ela também sai da galeria pública.",
  deleteVariantKeeps: (size) =>
    `A imagem principal e a captura não mudam. ${size} são liberados.`,
  addTitle: "Adicionar uma captura",
  addTo: (designation) => `Adicionar a ${designation}`,
  steps: { night: "Noite", target: "Alvo", image: "Imagem" },
  stepsLabel: "Etapas",
  nightTargets: (place, count) =>
    [place, `${count} ${count === 1 ? "alvo observado" : "alvos observados"}`]
      .filter(Boolean)
      .join(" · "),
  outcomes: { done: "Feito", partial: "Parcial" },
  captureCount: (count) => `${count} ${count === 1 ? "captura" : "capturas"}`,
  notInCatalogue: "Um alvo que não está no catálogo",
  searchNoResult: "Nenhum alvo do catálogo corresponde.",
  back: "Voltar",
  dropHere: "Solte a imagem aqui",
  chooseFile: "Escolher um arquivo",
  addedAsDraft: "Ela será adicionada como rascunho, privada.",
  nightLabel: "Noite",
  integrationLabel: "Integração",
  newTarget: "Novo alvo",
  nameLabel: "Nome",
  nameFromFile: "Sugerido a partir do nome do arquivo.",
  placeLabel: "Local",
  placeNearest: "O local salvo mais próximo da foto.",
  dateLabel: "Data",
  alreadyPresent: (file) => `${file} já está no seu espaço: nada foi enviado.`,
  checking: "Verificando o arquivo…",
  targetFailed: "Não foi possível criar o alvo. Tente mais tarde.",
  nightsLoading: "Carregando as suas noites…",
  // The add box's step « Rangement ».
  stepFiling: "Destino",
  filingChange: "Trocar",
  filingEdit: "Alterar",
  filingTitle: (count) =>
    count > 1
      ? "Estas capturas serão guardadas em suas sessões"
      : "Esta captura será guardada em uma sessão",
  filingFromPhoto: (date, time) => `Pela foto · ${date}, ${time}`,
  filingNoExif:
    "Esta imagem não traz data nem posição: mude a noite se for outra.",
  filingNightAssumed: (date) => `Noite de ${date} · presumida`,
  filingPlace: (name) => `Local: ${name}`,
  filingPlaceCurrent: "Local atual",
  filingPlacePhoto: "Posição da foto",
  filingTarget: (name) => `Alvo: ${name}`,
  filingTargetNone: "Alvo: a especificar",
  filingTargetFromFile: "Pelo nome do arquivo",
  filingTargetClear: "Deixar o alvo a especificar",
  filingNewTargetUse: "Usar este nome",
  filingExistsTitle: "Esta noite já tem uma sessão",
  filingAttachAsk: (day) => `Associar à noite de ${day}?`,
  filingAttachChoice: (date) => `Associar à sessão de ${date}`,
  filingCreateChoice: "Criar uma nova sessão",
  filingCreateAndSend: "Criar a sessão e enviar",
  filingCreateManyAndSend: (n) => `Criar ${n} sessões e enviar`,
  filingAttachAndSend: (day) => `Associar à noite de ${day} e enviar`,
  filingSendAll: "Guardar e enviar",
  filingPickExisting: "Escolher uma sessão existente",
  // A public capture also leaves the public gallery when deleted.
  deletePublicNote: "Ela também sai da galeria pública.",
};

const zhHans = {
  title: "作品",
  help: "私密：仅在你的私人图库中。公开：也会出现在公开图库中。",
  infoLabel: "私密与公开：有何不同",
  usage: (count, limit) => `${count}/${limit} 件作品`,
  // The free space says it is a limit.
  add: "添加作品",
  open: "打开作品",
  // The title of a capture that has no target.
  noTarget: "未命名作品",
  night: (date) => `${date}之夜`,
  added: (date) => `添加于${date}`,
  visibility: "可见性",
  private: "私密",
  public: "公开",
  publicSince: (date) => `自${date}起公开`,
  publicSinceUnknown: "公开，日期未知",
  noImageShort: "无图像",
  noImage: "暂无图像：请从 Astro Sync 发送，或在此添加。",
  addImage: "添加图像",
  publishNoImage: "没有图像的拍摄无法公开：请先添加图像。",
  targetZone: "目标",
  targetNone: "暂无目标。",
  targetAdd: "添加目标",
  targetChoose: "选择目标",
  targetChange: (d) => `更改 ${d}`,
  targetRemove: (d) => `移除 ${d}`,
  targetCancel: "取消",
  createWithoutImage: "创建无图像的拍摄",
  definitionFailed: "无法创建该拍摄。请稍后再试。",
  definitionName: "该拍摄",
  notShowable: "此文件无法在公开图库中显示：只有图像才能公开。",
  quotaTitle: (file) => `${file} 未添加：你的空间已没有足够位置。`,
  tooLargeTitle: (file) => `${file} 未添加：文件对你的空间来说太大。`,
  contentRefusedTitle: (file) => `${file} 未添加：不接受此类文件。`,
  uploadFailedTitle: (file) => `${file} 未添加。`,
  tryLater: "请稍后再试。",
  emptyTitle: "暂无作品",
  emptyBody: "作品可通过电脑上的 Astro Sync、手机上的 PlanAstro 或本页面添加。",
  retired: "已从公开图库中移除。",
  allCaptures: "全部作品",
  captureLabel: (title) => `作品 ${title}`,
  alreadyVisible: "已在公开图库中显示。",
  equipment: "器材",
  month: "拍摄月份",
  monthPlan: "拍摄月份",
  sky: "天空质量",
  place: "地点",
  placeValue: (name) => `${name}（从不公开）`,
  bortle: (value) => `波特尔 ${value}`,
  tags: "标签",
  tagsHelp: "用逗号分隔。仅在你的私人图库中显示。",
  tagsBounds: "每个标签最多 40 个字符，每件作品最多 20 个标签。",
  saveTags: "保存标签",
  deleteCapture: "删除作品",
  deleteTitle: (title) => `删除“${title}”？`,
  deleteBody: "作品及其文件将从你的空间中删除。",
  publishTitle: "公开这件作品？",
  publishIntro: "它将出现在公开图库中，并附带：",
  publishImage: "图像",
  publishTarget: (designation) => `目标：${designation}`,
  publishEquipment: "器材",
  publishMonth: (month) => `拍摄月份：${month}`,
  publishMonths: (months) => `拍摄月份：${months}`,
  publishSky: "天空质量",
  publishNoPlace: "不含地点及其坐标：发布的文件中也会移除位置信息。",
  // A server with no team: its owner decides alone (the three lines of the
  // tab).
  ruleDecide: "只有你能决定哪些内容公开，并且可以随时将作品改回私密。",
  rulePublic: "Une capture publique est visible de tous, sans connexion.",
  ruleResponsible: "此服务器上没有其他人审核你发布的内容，责任由你承担。",
  publishConfirm: "公开",
  cancel: "取消",
  close: "关闭",
  loading: "正在加载你的作品…",
  loadFailed: "无法读取你的作品列表。请稍后再试。",
  notFound: "这件作品已不在你的空间中。",
  retry: "重试",
  changeFailed: "无法修改这件作品。请稍后再试。",
  syncNothing: "没有可取回的新内容。",
  syncDone: "已更新各行。",
  viewLabel: "显示方式",
  listView: "列表",
  mapView: "星图",
  allChip: "全部",
  searchTarget: "搜索目标",
  reverseSort: "反转日期排序",
  newestFirst: "最新优先",
  oldestFirst: "最早优先",
  counter: (captures, targets) => `${captures} 件作品 · ${targets} 个目标`,
  noMatch: "没有符合此筛选的作品。",
  storageUsed: (used, quota) => `已使用 ${used}，共 ${quota}`,
  storageUsedAlone: (used) => `已使用 ${used}`,
  storageIncluded: "已包含",
  storageLeft: (left) => `剩余 ${left}`,
  storageInfo: "图库中显示的副本和缩略图不计入，只计入你的原始文件。",
  storageInfoLabel: "已用空间：这会带来什么变化",
  variantsInfoLabel: "作品的变体：这会带来什么变化",
  messageInfoLabel: "原主图与新主图的可见性",
  storageFull: "你的空间已满：无法再放入新作品。",
  integration: (duration) => `累计曝光 ${duration}`,
  integrationUnknown: "累计曝光 未记录",
  stageDraft: "草稿",
  archived: "已归档",
  stageFinalized: "已定稿",
  personal: "个人目标",
  fileZone: "文件",
  downloadOriginal: (kind, size) =>
    `下载原始文件（${[kind, size].filter(Boolean).join("，")}）`,
  fileSent: "你发送的文件，未作任何改动。",
  fileMain: "主图的文件，未作任何改动。",
  fileInfo:
    "这是发送时的原始文件，含其元数据。图库只显示去除位置信息的副本，从不提供下载。",
  addVariant: "添加变体",
  stateZone: "状态",
  draftLine: "草稿：作品尚未定稿。",
  finalize: "将此作品定稿",
  draftBanner: "草稿：此作品尚未显示在你的私人图库中。",
  draftBannerHint:
    "准备好后请定稿，之后它会出现在你的私人图库中，你也可以将其公开。",
  finalized: "已定稿。",
  finalizedOn: (day) => `已于${day}定稿。`,
  finalizeFirst: "请先将作品定稿，才能公开。",
  makePublic: "公开",
  draftInfo:
    "手机或 Astro Sync 发送的作品以草稿形式到达。准备好后请定稿，之后即可公开。",
  skyZone: "星图解算",
  skyProvenance: {
    "astro-sync": (date) => `天区解算结果：${date}由 Astro Sync 计算。`,
    "astrometry-net": (date) => `天区解算结果：${date}用 astrometry.net 计算。`,
    import: (date) => `天区解算结果：${date}沿用自旧门户。`,
  },
  skyShow: "显示星图解算",
  skyOn: "图库会提供这件作品的星空标注。",
  skyOff: "图库不会提供这件作品的星空标注。",
  skyNone: "这张图像没有天区解算结果，无法绘制星空标注。",
  skyInfoLabel: "星图解算：有什么影响",
  skyInfo:
    "天区解算结果说明图像位于天空的哪个位置。有了它，图库可以在图像上绘制目标名称、附近天体和恒星，访客可以显示或隐藏。关闭此选项会让图库不再提供这些标注；解算结果仍会保存。",
  skyInfoNone:
    "天区解算结果说明图像位于天空的哪个位置；没有它，就无法绘制星空标注。桌面应用 Astro Sync 会在你的电脑上根据图像计算并发送到这里：请从网站的下载页面获取应用，然后打开“标注”并解算这件作品。",
  skyAstroSync: "在 Astro Sync 中解算",
  skyServer: "在此服务器上解算",
  skyRunning: "正在解算…",
  skyFailed: {
    not_solved: "识别出的恒星太少，或视场超出已安装的索引。",
    unreadable_solution: "无法读取解算结果。",
    not_started: "服务器的解算工具无法启动。",
    image_changed: "解算期间图像发生了变化。",
    sky_solution_aspect_mismatch: "结果与图像的宽高比不符。",
    other: "解算未成功。",
  },
  deleteBodyImages: (count) =>
    `作品及其 ${count} 张图像将连同文件一起从你的空间中删除。`,
  freed: (size) => `将释放 ${size}。`,
  variantsZone: "变体",
  variantsPending: "收到一个新变体：它是私密的，主图没有改变。",
  variantsCount: (count) =>
    `${count} 张图像：私人图库显示全部；公开图库先显示主图，再显示公开的变体。`,
  variantsInfo:
    "为同一作品发送的新图像会作为私密变体加到这里。只有你选择另一张图像时，主图才会改变。只有作品公开时，变体才能公开。所有图像都计入已用空间。",
  mainPill: "主图",
  variantPill: "变体",
  progressionZone: "当晚的叠加进展",
  progressionLine:
    "Astro Sync 在夜间叠加的各个节点，从第一帧到全部帧。它们会随拍摄一起显示在图库中，不计入变体。",
  progressionFrames: (count) => `${count} 帧`,
  progressionStep: (index, count) =>
    count ? `节点 ${index} — ${count} 帧` : `节点 ${index}`,
  // The image of a multi-night plan: its stacked image after each night.
  progressionPlanZone: "叠加进展",
  progressionPlanLine:
    "每个夜晚之后叠加出的图像，从第一晚到最终图像。它们会随拍摄一起显示在图库中，不计入变体。",
  progressionPlanStep: (index, count) =>
    count ? `第 ${index} 晚之后 — ${count} 帧` : `第 ${index} 晚之后`,
  editNames: "编辑标题和说明",
  titleLabel: "标题",
  titleHelp: (fallback) => `可选。默认为“${fallback}”。`,
  descriptionLabel: "说明",
  descriptionHelp: "可选。变体公开时，显示在图库中的图像下方。",
  mainDescriptionHelp: "可选。作品公开时，显示在图库中的图像下方。",
  textCount: (count, max) => `${count} / ${max}`,
  textTooLong: (max) => `最多 ${max} 个字符。`,
  saveTitle: "保存标题",
  saveDescription: "保存说明",
  sources: {
    phone: "手机",
    web: "网页",
    "astro-sync": "Astro Sync",
    stacking: "Astro Sync · 叠加",
  },
  digest: (short) => `SHA-256 ${short}`,
  makeVariantPublic: "公开此变体",
  deleteVariant: "删除此变体",
  useAsMain: "设为主图",
  deleteMain: "删除主图",
  deleteMainRefused: "请先选择另一张主图：主图不能单独删除。",
  useAsMainTitle: "设为主图？",
  useAsMainBody: (name, file, size, target) =>
    `变体“${name}”（${file}，${size}）将成为 ${target} 的主图：图库会首先显示它。`,
  becomesPublic: "此变体是私密的：作为主图，它将和作品一样公开。",
  becomesPublicInfo: (name, file) =>
    `当前主图（“${name}”，${file}）将变为变体并保持公开。主图的可见性始终与作品相同。`,
  mainChosenPublic: (chosen, former) =>
    `${chosen} 已成为主图，因此和作品一样公开；${former} 作为变体保持公开。`,
  mainChosen: (chosen, former, isPublic) =>
    `${chosen} 已成为主图；${former} 作为变体保持${isPublic ? "公开" : "私密"}。`,
  deleteVariantTitle: "删除此变体？",
  deleteVariantBody: (name, file, source, when, size) =>
    `变体“${name}”（${[file, source, when, size].filter(Boolean).join("，")}）将连同其文件从你的空间中删除。`,
  deleteVariantPublic: "它也会从公开图库中消失。",
  deleteVariantKeeps: (size) => `主图和作品不变。将释放 ${size}。`,
  addTitle: "添加作品",
  addTo: (designation) => `添加到 ${designation}`,
  steps: { night: "夜晚", target: "目标", image: "图像" },
  stepsLabel: "步骤",
  nightTargets: (place, count) =>
    [place, `已观测 ${count} 个目标`].filter(Boolean).join(" · "),
  outcomes: { done: "已完成", partial: "部分完成" },
  captureCount: (count) => `${count} 件作品`,
  notInCatalogue: "不在星表中的目标",
  searchNoResult: "没有符合的星表目标。",
  back: "返回",
  dropHere: "将图像拖放到这里",
  chooseFile: "选择文件",
  addedAsDraft: "将作为私密草稿添加。",
  nightLabel: "夜晚",
  integrationLabel: "累计曝光",
  newTarget: "新目标",
  nameLabel: "名称",
  nameFromFile: "根据文件名建议。",
  placeLabel: "地点",
  placeNearest: "离照片最近的已保存地点。",
  dateLabel: "日期",
  alreadyPresent: (file) => `${file} 已在你的空间中：没有发送任何内容。`,
  checking: "正在检查文件…",
  targetFailed: "无法创建目标。请稍后再试。",
  nightsLoading: "正在加载你的夜晚…",
  // The add box's step « Rangement ».
  stepFiling: "归档",
  filingChange: "更换",
  filingEdit: "修改",
  filingTitle: (count) =>
    count > 1 ? "这些作品将归入各自的观测记录" : "此作品将归入一次观测记录",
  filingFromPhoto: (date, time) => `来自照片 · ${date} ${time}`,
  filingNoExif: "此图像不含日期和位置；如果是另一个夜晚，请修改。",
  filingNightAssumed: (date) => `${date}之夜（假定）`,
  filingPlace: (name) => `地点：${name}`,
  filingPlaceCurrent: "当前地点",
  filingPlacePhoto: "照片的位置",
  filingTarget: (name) => `目标：${name}`,
  filingTargetNone: "目标：待补充",
  filingTargetFromFile: "根据文件名",
  filingTargetClear: "稍后再指定目标",
  filingNewTargetUse: "使用此名称",
  filingExistsTitle: "这一夜已有观测记录",
  filingAttachAsk: (day) => `归入${day}之夜？`,
  filingAttachChoice: (date) => `归入${date}的观测记录`,
  filingCreateChoice: "创建新的观测记录",
  filingCreateAndSend: "创建观测记录并发送",
  filingCreateManyAndSend: (n) => `创建 ${n} 条观测记录并发送`,
  filingAttachAndSend: (day) => `归入${day}之夜并发送`,
  filingSendAll: "归入并发送",
  filingPickExisting: "选择已有的观测记录",
  // A public capture also leaves the public gallery when deleted.
  deletePublicNote: "它也会从公开图库中移除。",
};

const zhHant = {
  title: "影像",
  help: "私密：只在你的私人圖庫中。公開：也會出現在公開圖庫中。",
  infoLabel: "私密與公開：有何不同",
  usage: (count, limit) => `${count}/${limit} 張影像`,
  // The free space says it is a limit.
  add: "新增影像",
  open: "開啟影像",
  // The title of a capture that has no target.
  noTarget: "未命名影像",
  night: (date) => `${date}之夜`,
  added: (date) => `新增於${date}`,
  visibility: "可見性",
  private: "私密",
  public: "公開",
  publicSince: (date) => `自${date}起公開`,
  publicSinceUnknown: "公開，日期不明",
  noImageShort: "無影像",
  noImage: "尚無影像：請從 Astro Sync 傳送，或在此新增。",
  addImage: "新增影像",
  publishNoImage: "沒有影像的拍攝無法公開：請先新增影像。",
  targetZone: "目標",
  targetNone: "尚無目標。",
  targetAdd: "新增目標",
  targetChoose: "選擇目標",
  targetChange: (d) => `變更 ${d}`,
  targetRemove: (d) => `移除 ${d}`,
  targetCancel: "取消",
  createWithoutImage: "建立無影像的拍攝",
  definitionFailed: "無法建立該拍攝。請稍後再試。",
  definitionName: "該拍攝",
  notShowable: "此檔案無法在公開圖庫中顯示：只有圖像才能公開。",
  quotaTitle: (file) => `${file} 未新增：你的空間已沒有足夠位置。`,
  tooLargeTitle: (file) => `${file} 未新增：檔案對你的空間來說太大。`,
  contentRefusedTitle: (file) => `${file} 未新增：不接受此類檔案。`,
  uploadFailedTitle: (file) => `${file} 未新增。`,
  tryLater: "請稍後再試。",
  emptyTitle: "目前沒有影像",
  emptyBody: "影像可透過電腦上的 Astro Sync、手機上的 PlanAstro 或本頁面新增。",
  retired: "已從公開圖庫中移除。",
  allCaptures: "所有影像",
  captureLabel: (title) => `影像 ${title}`,
  alreadyVisible: "已在公開圖庫中顯示。",
  equipment: "器材",
  month: "拍攝月份",
  monthPlan: "拍攝月份",
  sky: "天空品質",
  place: "地點",
  placeValue: (name) => `${name}（從不公開）`,
  bortle: (value) => `波特爾 ${value}`,
  tags: "標籤",
  tagsHelp: "以逗號分隔。只在你的私人圖庫中顯示。",
  tagsBounds: "每個標籤最多 40 個字元，每張影像最多 20 個標籤。",
  saveTags: "儲存標籤",
  deleteCapture: "刪除影像",
  deleteTitle: (title) => `刪除「${title}」？`,
  deleteBody: "影像及其檔案將從你的空間中刪除。",
  publishTitle: "公開這張影像？",
  publishIntro: "它將出現在公開圖庫中，並附帶：",
  publishImage: "影像",
  publishTarget: (designation) => `目標：${designation}`,
  publishEquipment: "器材",
  publishMonth: (month) => `拍攝月份：${month}`,
  publishMonths: (months) => `拍攝月份：${months}`,
  publishSky: "天空品質",
  publishNoPlace: "不含地點及其座標：發布的檔案中也會移除位置資訊。",
  // A server with no team: its owner decides alone (the three lines of the
  // tab).
  ruleDecide: "只有你能決定哪些內容公開，並且可以隨時將影像改回私密。",
  rulePublic: "A public capture can be seen by anyone, without signing in.",
  ruleResponsible: "此伺服器上沒有其他人審核你發布的內容，責任由你承擔。",
  publishConfirm: "公開",
  cancel: "取消",
  close: "關閉",
  loading: "正在載入你的影像…",
  loadFailed: "無法讀取你的影像列表。請稍後再試。",
  notFound: "這張影像已不在你的空間中。",
  retry: "重試",
  changeFailed: "無法修改這張影像。請稍後再試。",
  syncNothing: "沒有可取回的新內容。",
  syncDone: "已更新各行。",
  viewLabel: "顯示方式",
  listView: "列表",
  mapView: "星圖",
  allChip: "全部",
  searchTarget: "搜尋目標",
  reverseSort: "反轉日期排序",
  newestFirst: "最新優先",
  oldestFirst: "最舊優先",
  counter: (captures, targets) => `${captures} 張影像 · ${targets} 個目標`,
  noMatch: "沒有符合此篩選的影像。",
  storageUsed: (used, quota) => `已使用 ${used}，共 ${quota}`,
  storageUsedAlone: (used) => `已使用 ${used}`,
  storageIncluded: "已包含",
  storageLeft: (left) => `剩餘 ${left}`,
  storageInfo: "圖庫中顯示的副本與縮圖不計入，只計入你的原始檔案。",
  storageInfoLabel: "已用空間：這會帶來什麼改變",
  variantsInfoLabel: "影像的變體：這會帶來什麼改變",
  messageInfoLabel: "原主圖與新主圖的可見性",
  storageFull: "你的空間已滿：無法再放入新影像。",
  integration: (duration) => `累計曝光 ${duration}`,
  integrationUnknown: "累計曝光 未記錄",
  stageDraft: "草稿",
  archived: "已封存",
  stageFinalized: "已定稿",
  personal: "個人目標",
  fileZone: "檔案",
  downloadOriginal: (kind, size) =>
    `下載原始檔案（${[kind, size].filter(Boolean).join("，")}）`,
  fileSent: "你傳送的檔案，未作任何更動。",
  fileMain: "主圖的檔案，未作任何更動。",
  fileInfo:
    "這是傳送時的原始檔案，含其中繼資料。圖庫只顯示去除位置資訊的副本，從不提供下載。",
  addVariant: "新增變體",
  stateZone: "狀態",
  draftLine: "草稿：影像尚未定稿。",
  finalize: "將此影像定稿",
  draftBanner: "草稿：此影像尚未顯示在你的私人圖庫中。",
  draftBannerHint:
    "準備好後請定稿，之後它會出現在你的私人圖庫中，你也可以將其公開。",
  finalized: "已定稿。",
  finalizedOn: (day) => `已於${day}定稿。`,
  finalizeFirst: "請先將影像定稿，才能公開。",
  makePublic: "公開",
  draftInfo:
    "手機或 Astro Sync 傳送的影像以草稿形式到達。準備好後請定稿，之後即可公開。",
  skyZone: "星場解析",
  skyProvenance: {
    "astro-sync": (date) => `天區解析結果：${date}由 Astro Sync 計算。`,
    "astrometry-net": (date) => `天區解析結果：${date}以 astrometry.net 計算。`,
    import: (date) => `天區解析結果：${date}沿用自舊入口網站。`,
  },
  skyShow: "顯示星場解析",
  skyOn: "圖庫會提供這件作品的星空標註。",
  skyOff: "圖庫不會提供這件作品的星空標註。",
  skyNone: "這張影像沒有天區解析結果，無法繪製星空標註。",
  skyInfoLabel: "星場解析：有什麼影響",
  skyInfo:
    "天區解析結果說明影像位於天空的哪個位置。有了它，圖庫可以在影像上繪製目標名稱、附近天體與恆星，訪客可以顯示或隱藏。關閉此選項會讓圖庫不再提供這些標註；解析結果仍會保存。",
  skyInfoNone:
    "天區解析結果說明影像位於天空的哪個位置；沒有它，就無法繪製星空標註。桌面應用程式 Astro Sync 會在你的電腦上根據影像計算並傳送到這裡：請從網站的下載頁面取得應用程式，然後開啟「標註」並解析這件作品。",
  skyAstroSync: "在 Astro Sync 中解析",
  skyServer: "在此伺服器上解析",
  skyRunning: "解析中…",
  skyFailed: {
    not_solved: "辨識出的恆星太少，或視場超出已安裝的索引。",
    unreadable_solution: "無法讀取解析結果。",
    not_started: "伺服器的解析工具無法啟動。",
    image_changed: "解析期間影像發生了變化。",
    sky_solution_aspect_mismatch: "結果與影像的長寬比不符。",
    other: "解析未成功。",
  },
  deleteBodyImages: (count) =>
    `影像及其 ${count} 張圖像將連同檔案一起從你的空間中刪除。`,
  freed: (size) => `將釋放 ${size}。`,
  variantsZone: "變體",
  variantsPending: "收到一個新變體：它是私密的，主圖沒有改變。",
  variantsCount: (count) =>
    `${count} 張圖像：私人圖庫顯示全部；公開圖庫先顯示主圖，再顯示公開的變體。`,
  variantsInfo:
    "為同一影像傳送的新圖像會作為私密變體加到這裡。只有你選擇另一張圖像時，主圖才會改變。只有影像公開時，變體才能公開。所有圖像都計入已用空間。",
  mainPill: "主圖",
  variantPill: "變體",
  progressionZone: "當晚的疊圖進展",
  progressionLine:
    "Astro Sync 在夜間疊合的各個里程碑，從第一張到全部影像。它們會隨拍攝一起顯示在圖庫中，不計入變體。",
  progressionFrames: (count) => `${count} 張影像`,
  progressionStep: (index, count) =>
    count ? `里程碑 ${index}——${count} 張影像` : `里程碑 ${index}`,
  // The image of a multi-night plan: its stacked image after each night.
  progressionPlanZone: "疊圖進展",
  progressionPlanLine:
    "每個夜晚之後疊合出的影像，從第一晚到最終影像。它們會隨拍攝一起顯示在圖庫中，不計入變體。",
  progressionPlanStep: (index, count) =>
    count ? `第 ${index} 晚之後——${count} 張影像` : `第 ${index} 晚之後`,
  editNames: "編輯標題與說明",
  titleLabel: "標題",
  titleHelp: (fallback) => `選填。預設為「${fallback}」。`,
  descriptionLabel: "說明",
  descriptionHelp: "選填。變體公開時，顯示在圖庫中的圖像下方。",
  mainDescriptionHelp: "選填。影像公開時，顯示在圖庫中的圖像下方。",
  textCount: (count, max) => `${count} / ${max}`,
  textTooLong: (max) => `最多 ${max} 個字元。`,
  saveTitle: "儲存標題",
  saveDescription: "儲存說明",
  sources: {
    phone: "手機",
    web: "網頁",
    "astro-sync": "Astro Sync",
    stacking: "Astro Sync · 疊加",
  },
  digest: (short) => `SHA-256 ${short}`,
  makeVariantPublic: "公開此變體",
  deleteVariant: "刪除此變體",
  useAsMain: "設為主圖",
  deleteMain: "刪除主圖",
  deleteMainRefused: "請先選擇另一張主圖：主圖不能單獨刪除。",
  useAsMainTitle: "設為主圖？",
  useAsMainBody: (name, file, size, target) =>
    `變體「${name}」（${file}，${size}）將成為 ${target} 的主圖：圖庫會先顯示它。`,
  becomesPublic: "此變體是私密的：作為主圖，它將和影像一樣公開。",
  becomesPublicInfo: (name, file) =>
    `目前的主圖（「${name}」，${file}）將變為變體並保持公開。主圖的可見性始終與影像相同。`,
  mainChosenPublic: (chosen, former) =>
    `${chosen} 已成為主圖，因此和影像一樣公開；${former} 作為變體保持公開。`,
  mainChosen: (chosen, former, isPublic) =>
    `${chosen} 已成為主圖；${former} 作為變體保持${isPublic ? "公開" : "私密"}。`,
  deleteVariantTitle: "刪除此變體？",
  deleteVariantBody: (name, file, source, when, size) =>
    `變體「${name}」（${[file, source, when, size].filter(Boolean).join("，")}）將連同其檔案從你的空間中刪除。`,
  deleteVariantPublic: "它也會從公開圖庫中消失。",
  deleteVariantKeeps: (size) => `主圖與影像不變。將釋放 ${size}。`,
  addTitle: "新增影像",
  addTo: (designation) => `新增到 ${designation}`,
  steps: { night: "夜晚", target: "目標", image: "圖像" },
  stepsLabel: "步驟",
  nightTargets: (place, count) =>
    [place, `已觀測 ${count} 個目標`].filter(Boolean).join(" · "),
  outcomes: { done: "已完成", partial: "部分完成" },
  captureCount: (count) => `${count} 張影像`,
  notInCatalogue: "不在星表中的目標",
  searchNoResult: "沒有符合的星表目標。",
  back: "返回",
  dropHere: "將圖像拖放到這裡",
  chooseFile: "選擇檔案",
  addedAsDraft: "將作為私密草稿新增。",
  nightLabel: "夜晚",
  integrationLabel: "累計曝光",
  newTarget: "新目標",
  nameLabel: "名稱",
  nameFromFile: "依檔名建議。",
  placeLabel: "地點",
  placeNearest: "離照片最近的已儲存地點。",
  dateLabel: "日期",
  alreadyPresent: (file) => `${file} 已在你的空間中：沒有傳送任何內容。`,
  checking: "正在檢查檔案…",
  targetFailed: "無法建立目標。請稍後再試。",
  nightsLoading: "正在載入你的夜晚…",
  // The add box's step « Rangement ».
  stepFiling: "歸檔",
  filingChange: "更換",
  filingEdit: "修改",
  filingTitle: (count) =>
    count > 1 ? "這些影像將歸入各自的觀測記錄" : "此影像將歸入一筆觀測記錄",
  filingFromPhoto: (date, time) => `來自照片 · ${date} ${time}`,
  filingNoExif: "此影像不含日期與位置；如果是另一個夜晚，請修改。",
  filingNightAssumed: (date) => `${date}之夜（假定）`,
  filingPlace: (name) => `地點：${name}`,
  filingPlaceCurrent: "目前地點",
  filingPlacePhoto: "照片的位置",
  filingTarget: (name) => `目標：${name}`,
  filingTargetNone: "目標：待補充",
  filingTargetFromFile: "根據檔名",
  filingTargetClear: "稍後再指定目標",
  filingNewTargetUse: "使用此名稱",
  filingExistsTitle: "這一夜已有觀測記錄",
  filingAttachAsk: (day) => `歸入${day}之夜？`,
  filingAttachChoice: (date) => `歸入${date}的觀測記錄`,
  filingCreateChoice: "建立新的觀測記錄",
  filingCreateAndSend: "建立觀測記錄並傳送",
  filingCreateManyAndSend: (n) => `建立 ${n} 筆觀測記錄並傳送`,
  filingAttachAndSend: (day) => `歸入${day}之夜並傳送`,
  filingSendAll: "歸入並傳送",
  filingPickExisting: "選擇既有的觀測記錄",
  // A public capture also leaves the public gallery when deleted.
  deletePublicNote: "它也會從公開圖庫中移除。",
};

const ru = {
  title: "Снимки",
  help: "Закрытый: только в вашей закрытой галерее. Публичный: также в публичной галерее.",
  infoLabel: "Закрытый, публичный: что меняется",
  usage: (count, limit) => `Снимков: ${count} из ${limit}`,
  // The free space says it is a limit.
  add: "Добавить снимок",
  open: "Открыть снимок",
  // The title of a capture that has no target.
  noTarget: "Снимок без названия",
  night: (date) => `Ночь на ${date}`,
  added: (date) => `Добавлен ${date}`,
  visibility: "Видимость",
  private: "Закрытый",
  public: "Публичный",
  publicSince: (date) => `Публичный с ${date}`,
  publicSinceUnknown: "Публичный, дата неизвестна",
  noImageShort: "Без изображения",
  noImage:
    "Изображений пока нет: отправьте их из Astro Sync или добавьте здесь.",
  addImage: "Добавить изображение",
  publishNoImage:
    "Снимок без изображения нельзя сделать публичным: сначала добавьте изображение.",
  targetZone: "Цель",
  targetNone: "Цели пока нет.",
  targetAdd: "Добавить цель",
  targetChoose: "Выбрать цель",
  targetChange: (d) => `Изменить ${d}`,
  targetRemove: (d) => `Убрать ${d}`,
  targetCancel: "Отмена",
  createWithoutImage: "Создать снимок без изображения",
  definitionFailed: "Не удалось создать снимок. Повторите попытку позже.",
  definitionName: "Снимок",
  notShowable:
    "Этот файл нельзя показать в публичной галерее: публичными могут быть только изображения.",
  quotaTitle: (file) =>
    `${file} не добавлен: в вашем пространстве нет для него места.`,
  tooLargeTitle: (file) =>
    `${file} не добавлен: файл слишком велик для вашего пространства.`,
  contentRefusedTitle: (file) =>
    `${file} не добавлен: такой тип файла не принимается.`,
  uploadFailedTitle: (file) => `${file} не добавлен.`,
  tryLater: "Повторите попытку чуть позже.",
  emptyTitle: "Снимков пока нет",
  emptyBody:
    "Они приходят через Astro Sync с вашего компьютера, через PlanAstro на телефоне или через эту страницу.",
  retired: "Убран из публичной галереи.",
  allCaptures: "Все снимки",
  captureLabel: (title) => `Снимок ${title}`,
  alreadyVisible: "Уже виден в публичной галерее.",
  equipment: "Оборудование",
  month: "Месяц ночи",
  monthPlan: "Месяцы ночей",
  sky: "Качество неба",
  place: "Место",
  placeValue: (name) => `${name} (никогда не публикуется)`,
  bortle: (value) => `Бортль ${value}`,
  tags: "Теги",
  tagsHelp: "Через запятую. Видны только в вашей закрытой галерее.",
  tagsBounds: "Не более 40 символов в теге и не более 20 тегов у снимка.",
  saveTags: "Сохранить теги",
  deleteCapture: "Удалить снимок",
  deleteTitle: (title) => `Удалить «${title}»?`,
  deleteBody: "Снимок и его файл стираются из вашего пространства.",
  publishTitle: "Сделать этот снимок публичным?",
  publishIntro: "Он появится в публичной галерее вместе с:",
  publishImage: "изображением",
  publishTarget: (designation) => `объектом: ${designation}`,
  publishEquipment: "оборудованием",
  publishMonth: (month) => `месяцем ночи: ${month}`,
  publishMonths: (months) => `месяцами ночей: ${months}`,
  publishSky: "качеством неба",
  publishNoPlace:
    "Ни места, ни его координат: положение удаляется и из опубликованного файла.",
  // A server with no team: its owner decides alone (the three lines of the
  // tab).
  ruleDecide:
    "Только вы решаете, что публично, и в любой момент можете снова сделать снимок закрытым.",
  rulePublic: "公开的作品任何人无需登录即可查看。",
  ruleResponsible:
    "Больше никто на этом сервере не проверяет то, что вы публикуете. Ответственность за это лежит на вас.",
  publishConfirm: "Сделать публичным",
  cancel: "Отмена",
  close: "Закрыть",
  loading: "Загрузка ваших снимков…",
  loadFailed:
    "Не удалось прочитать список ваших снимков. Повторите попытку позже.",
  notFound: "Этого снимка больше нет в вашем пространстве.",
  retry: "Повторить",
  changeFailed: "Не удалось изменить снимок. Повторите попытку позже.",
  syncNothing: "Нового, что можно забрать, нет.",
  syncDone: "Строки обновлены.",
  viewLabel: "Вид",
  listView: "Список",
  mapView: "Карта",
  allChip: "Все",
  searchTarget: "Найти объект",
  reverseSort: "Обратить сортировку по дате",
  newestFirst: "Сначала новые",
  oldestFirst: "Сначала старые",
  counter: (captures, targets) => `Снимков: ${captures} · объектов: ${targets}`,
  noMatch: "Ни один снимок не подходит под этот фильтр.",
  storageUsed: (used, quota) => `Занято ${used} из ${quota}`,
  storageUsedAlone: (used) => `Занято ${used}`,
  storageIncluded: "Включено",
  storageLeft: (left) => `Осталось ${left}`,
  storageInfo:
    "Копии в галереях и миниатюры не учитываются: учитываются только ваши оригиналы.",
  storageInfoLabel: "Занятое место: что это меняет",
  variantsInfoLabel: "Варианты снимка: что это меняет",
  messageInfoLabel: "Видимость прежнего и нового основного изображения",
  storageFull:
    "Ваше пространство заполнено: новый снимок в него не поместится.",
  integration: (duration) => `Накопление ${duration}`,
  integrationUnknown: "Накопление не указано",
  stageDraft: "Черновик",
  archived: "В архиве",
  stageFinalized: "Завершён",
  personal: "Личный объект",
  fileZone: "Файл",
  downloadOriginal: (kind, size) =>
    `Скачать оригинал (${[kind, size].filter(Boolean).join(", ")})`,
  fileSent: "Файл, который вы отправили, без изменений.",
  fileMain: "Файл основного изображения, без изменений.",
  fileInfo:
    "Это файл в том виде, в каком он был отправлен, с метаданными. Галереи показывают только его копию без местоположения и никогда не предлагают скачивание.",
  addVariant: "Добавить вариант",
  stateZone: "Состояние",
  draftLine: "Черновик: снимок ещё не завершён.",
  finalize: "Завершить этот снимок",
  draftBanner: "Черновик: этого снимка пока нет в вашей закрытой галерее.",
  draftBannerHint:
    "Завершите его, когда он готов: тогда он появится в вашей закрытой галерее, и его можно будет сделать публичным.",
  finalized: "Завершён.",
  finalizedOn: (day) => `Завершён ${day}.`,
  finalizeFirst: "Завершите снимок, чтобы сделать его публичным.",
  makePublic: "Сделать публичным",
  draftInfo:
    "Снимок, отправленный с телефона или из Astro Sync, приходит черновиком. Завершите его, когда он готов: тогда его можно будет сделать публичным.",
  skyZone: "Плейт-солвинг",
  skyProvenance: {
    "astro-sync": (date) =>
      `Астрометрическое решение: рассчитано в Astro Sync, ${date}.`,
    "astrometry-net": (date) =>
      `Астрометрическое решение: рассчитано с помощью astrometry.net, ${date}.`,
    import: (date) =>
      `Астрометрическое решение: перенесено из старого портала, ${date}.`,
  },
  skyShow: "Показать плейт-солвинг",
  skyOn: "Галерея предлагает аннотации этого снимка.",
  skyOff: "Галерея не предлагает аннотации этого снимка.",
  skyNone:
    "У этого изображения нет астрометрического решения: аннотации нельзя нарисовать.",
  skyInfoLabel: "Плейт-солвинг: что это меняет",
  skyInfo:
    "Астрометрическое решение говорит, где изображение находится на небе. С ним галерея может нарисовать на изображении название объекта, ближайшие объекты и звёзды, которые посетитель показывает или скрывает. Если отключить, аннотации исчезнут из галереи; решение останется сохранённым.",
  skyInfoNone:
    "Астрометрическое решение говорит, где изображение находится на небе; без него аннотации нельзя нарисовать. Astro Sync, настольное приложение, рассчитывает его на вашем компьютере по изображению и отправляет сюда: скачайте приложение на странице загрузки сайта, затем откройте «Аннотации» и решите этот снимок.",
  skyAstroSync: "Решить в Astro Sync",
  skyServer: "Решить на этом сервере",
  skyRunning: "Идёт решение…",
  skyFailed: {
    not_solved:
      "Распознано слишком мало звёзд, или поле вне установленных индексов.",
    unreadable_solution: "Не удалось прочитать результат решения.",
    not_started: "Инструмент решения на сервере не запускается.",
    image_changed: "Изображение изменилось во время решения.",
    sky_solution_aspect_mismatch:
      "Результат не соответствует пропорциям изображения.",
    other: "Решить не удалось.",
  },
  deleteBodyImages: (count) =>
    `Снимок и его изображения (${count}) удаляются из вашего пространства вместе с файлами.`,
  freed: (size) => `Освободится ${size}.`,
  variantsZone: "Варианты",
  variantsPending:
    "Пришёл новый вариант: он закрытый, основное изображение не изменилось.",
  variantsCount: (count) =>
    `Изображений: ${count}. Закрытая галерея показывает все; публичная — основное изображение, затем публичные варианты.`,
  variantsInfo:
    "Новое изображение, отправленное для того же снимка, добавляется сюда как закрытый вариант. Основное изображение меняется, только если вы выберете другое. Вариант публичен, только если публичен снимок. Все изображения учитываются в занятом месте.",
  mainPill: "Основное",
  variantPill: "Вариант",
  progressionZone: "Накопление за ночь",
  progressionLine:
    "Контрольные точки, которые Astro Sync сложил за ночь, от первого кадра до всех. Они показываются вместе со снимком в галереях и не считаются вариантами.",
  progressionFrames: (count) => `кадров: ${count}`,
  progressionStep: (index, count) =>
    count
      ? `Контрольная точка ${index} — кадров: ${count}`
      : `Контрольная точка ${index}`,
  // The image of a multi-night plan: its stacked image after each night.
  progressionPlanZone: "Ход накопления",
  progressionPlanLine:
    "Изображение, накопленное после каждой ночи, от первой ночи до итогового. Они показываются вместе со снимком в галереях и не считаются вариантами.",
  progressionPlanStep: (index, count) =>
    count ? `После ночи ${index} — кадров: ${count}` : `После ночи ${index}`,
  editNames: "Изменить название и описание",
  titleLabel: "Название",
  titleHelp: (fallback) => `Необязательно. По умолчанию: «${fallback}».`,
  descriptionLabel: "Описание",
  descriptionHelp:
    "Необязательно. Показывается под изображением в галерее, если вариант публичный.",
  mainDescriptionHelp:
    "Необязательно. Показывается под изображением в галерее, если снимок публичный.",
  textCount: (count, max) => `${count} / ${max}`,
  textTooLong: (max) => `Не более ${max} символов.`,
  saveTitle: "Сохранить название",
  saveDescription: "Сохранить описание",
  sources: {
    phone: "Телефон",
    web: "Веб",
    "astro-sync": "Astro Sync",
    stacking: "Astro Sync · стекинг",
  },
  digest: (short) => `SHA-256 ${short}`,
  makeVariantPublic: "Сделать этот вариант публичным",
  deleteVariant: "Удалить этот вариант",
  useAsMain: "Сделать основным изображением",
  deleteMain: "Удалить основное изображение",
  deleteMainRefused:
    "Сначала выберите другое основное изображение: основное изображение не удаляется отдельно.",
  useAsMainTitle: "Сделать основным изображением?",
  useAsMainBody: (name, file, size, target) =>
    `Вариант «${name}» (${file}, ${size}) станет основным изображением ${target}: галерея покажет его первым.`,
  becomesPublic:
    "Этот вариант закрытый: став основным изображением, он будет публичным, как снимок.",
  becomesPublicInfo: (name, file) =>
    `Текущее основное изображение («${name}», ${file}) становится вариантом и остаётся публичным. Видимость основного изображения всегда совпадает с видимостью снимка.`,
  mainChosenPublic: (chosen, former) =>
    `${chosen} теперь основное изображение и поэтому публично, как снимок; ${former} остаётся публичным, как вариант.`,
  mainChosen: (chosen, former, isPublic) =>
    `${chosen} теперь основное изображение; ${former} остаётся ${isPublic ? "публичным" : "закрытым"}, как вариант.`,
  deleteVariantTitle: "Удалить этот вариант?",
  deleteVariantBody: (name, file, source, when, size) =>
    `Вариант «${name}» (${[file, source, when, size].filter(Boolean).join(", ")}) будет удалён из вашего пространства вместе с файлом.`,
  deleteVariantPublic: "Он также исчезнет из публичной галереи.",
  deleteVariantKeeps: (size) =>
    `Основное изображение и снимок не изменятся. Освободится ${size}.`,
  addTitle: "Добавить снимок",
  addTo: (designation) => `Добавить к ${designation}`,
  steps: { night: "Ночь", target: "Объект", image: "Изображение" },
  stepsLabel: "Шаги",
  nightTargets: (place, count) =>
    [place, `объектов наблюдалось: ${count}`].filter(Boolean).join(" · "),
  outcomes: { done: "Выполнен", partial: "Частично" },
  captureCount: (count) => `Снимков: ${count}`,
  notInCatalogue: "Объект, которого нет в каталоге",
  searchNoResult: "Ни один объект каталога не подходит.",
  back: "Назад",
  dropHere: "Перетащите изображение сюда",
  chooseFile: "Выбрать файл",
  addedAsDraft: "Он будет добавлен закрытым черновиком.",
  nightLabel: "Ночь",
  integrationLabel: "Накопление",
  newTarget: "Новый объект",
  nameLabel: "Название",
  nameFromFile: "Предложено по имени файла.",
  placeLabel: "Место",
  placeNearest: "Сохранённое место, ближайшее к снимку.",
  dateLabel: "Дата",
  alreadyPresent: (file) =>
    `${file} уже есть в вашем пространстве: ничего не отправлено.`,
  checking: "Проверка файла…",
  targetFailed: "Не удалось создать объект. Попробуйте позже.",
  nightsLoading: "Загрузка ваших ночей…",
  // The add box's step « Rangement ».
  stepFiling: "Размещение",
  filingChange: "Заменить",
  filingEdit: "Изменить",
  filingTitle: (count) =>
    count > 1
      ? "Эти снимки будут сохранены в своих сеансах"
      : "Этот снимок будет сохранён в сеансе",
  filingFromPhoto: (date, time) => `По фото · ${date}, ${time}`,
  filingNoExif:
    "В этом изображении нет ни даты, ни положения: измените ночь, если это другая.",
  filingNightAssumed: (date) => `Ночь на ${date} · предполагаемая`,
  filingPlace: (name) => `Место: ${name}`,
  filingPlaceCurrent: "Текущее место",
  filingPlacePhoto: "Положение снимка",
  filingTarget: (name) => `Цель: ${name}`,
  filingTargetNone: "Цель: уточнить позже",
  filingTargetFromFile: "По имени файла",
  filingTargetClear: "Уточнить цель позже",
  filingNewTargetUse: "Использовать это имя",
  filingExistsTitle: "У этой ночи уже есть сеанс",
  filingAttachAsk: (day) => `Прикрепить к ночи на ${day}?`,
  filingAttachChoice: (date) => `Прикрепить к сеансу на ${date}`,
  filingCreateChoice: "Создать новый сеанс",
  filingCreateAndSend: "Создать сеанс и отправить",
  filingCreateManyAndSend: (n) => {
    const last = n % 10;
    const tens = n % 100;
    const word =
      last === 1 && tens !== 11
        ? "сеанс"
        : last >= 2 && last <= 4 && (tens < 12 || tens > 14)
          ? "сеанса"
          : "сеансов";
    return `Создать ${n} ${word} и отправить`;
  },
  filingAttachAndSend: (day) => `Прикрепить к ночи на ${day} и отправить`,
  filingSendAll: "Сохранить и отправить",
  filingPickExisting: "Выбрать существующий сеанс",
  // A public capture also leaves the public gallery when deleted.
  deletePublicNote: "Он также исчезнет из публичной галереи.",
};

export const capturesCopy = {
  en: en,
  fr: fr,
  ja: ja,
  de: de,
  es: es,
  it: it,
  "pt-BR": ptBR,
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
  ru: ru,
};

/**
 * The tab's words in `locale` (English where a language lacks them), with
 * those a service's composition registered (`hosted-copy.js`).
 */
export const capturesCopyFor = (locale) => ({
  ...copyFor(capturesCopy, locale, "captures-copy"),
  ...hostedCopy("captures", locale),
});
