export const flowMessagesIt = {
  weatherUnavailable:
    "Le previsioni meteo non sono temporaneamente disponibili.",
  weatherCached: "Previsione in cache; potrebbe non essere aggiornata.",
  weatherStale:
    "I servizi meteo non sono temporaneamente disponibili. Ultima previsione ricevuta alle {time}; questi dati potrebbero non essere aggiornati.",
  weatherRateLimited:
    "I servizi meteo stanno limitando le richieste. Attendi prima di riprovare.",
  weatherBeyondRangeTitle: "Meteo non ancora disponibile",
  weatherBeyondRangeHelp:
    "Questa notte è oltre la finestra di previsione meteo disponibile. La previsione comparirà automaticamente all’avvicinarsi della data. I calcoli astronomici restano disponibili.",
  viewHorizon: "Visualizzare l’orizzonte di questo luogo",
  close: "Chiudere",
  horizonReset: "Reimpostare l’orizzonte",
  distantPlace:
    "Attenzione: il luogo che stai aggiornando si trova a più di {distance} km dalla posizione scelta.",
  farTitle: "Passare a un luogo molto lontano?",
  farBody:
    "Attenzione: stai sostituendo il luogo attuale con uno completamente diverso. I piani esistenti saranno spostati in questo luogo, ma gli obiettivi scelti potrebbero non essere più adatti.",
  farReplace: "Sposta la notte in questo luogo",
  farPlanLine:
    "Il piano «{plan}» non è più a {from}: passa a {to}. Non viene cancellato nulla, «{from}» resta in I miei luoghi.",
  farDistance: "≈ {distance} km",
  farCurrent: "Attuale",
  farNew: "Nuovo",
  farMapLabel:
    "Due luoghi lontani uniti da una linea curva: circa {distance} chilometri",
  modifyTitle: "Modificare «{name}»?",
  modifyBody:
    "La posizione scelta si trova a {distance} km da questo luogo. È proprio questo il luogo che vuoi spostare? In caso contrario, crea un nuovo luogo e conserva quello precedente.",
  modifyConfirm: "Modifica questo luogo",
  leaveTitle: "Scartare le modifiche?",
  leaveKeep: "Continuare a modificare",
  leaveConfirm: "Scartare",
  leaveNewBody:
    "Il luogo che stai inserendo non è ancora salvato: uscendo ora lo si perde.",
  leaveEditBody:
    "Le modifiche a questo luogo non sono ancora salvate: uscendo ora si perdono.",
  horizonTimeHint:
    "Scorri sulla mappa: a sinistra per un orario precedente, a destra per uno successivo.",
  horizonRotateHint: "Scorri in alto o in basso: la mappa ruota.",
  horizonRotateHintInfo:
    "Le due fasce ai lati della mappa non la ruotano: scorri su di esse per far scorrere la pagina.",
  belowMinimum: "Sotto l’altezza minima ({altitude})",
  behindHorizon: "Dietro la maschera dell’orizzonte",
  horizonMapHelp:
    "Questa vista usa l’orizzonte salvato per il luogo di osservazione selezionato.",
  review_zenith: "limite di sicurezza vicino allo zenit",
  review_meridian: "limite di sicurezza al meridiano",
  review_cables: "limite di azimut della montatura",
  "review_wind-over-tolerance":
    "raffiche oltre la tolleranza della tua montatura",
  "review_wind-near-tolerance": "raffiche vicine al limite della tua montatura",
  "review_outside-night-span": "fuori dall’intervallo scelto della notte",
  "review_outside-usable-window": "fuori dalla finestra utilizzabile",
  where: "Luogo e data",
  stageCrumbLabel: "Andare all’inizio della sezione {title}.",
  whereHelp:
    "Un luogo e una notte, comuni a questi piani; la durata della notte è propria di ogni piano.",
  forecast: "Previsione astronomica",
  nightQuality: "Qualità meteo della notte",
  newPlace: "Aggiungere un luogo…",
  editPlace: "Modificare questo luogo",
  pickPlace: "Scegliere un luogo",
  noPlace: "Aggiungi un luogo per calcolare questa notte.",
  planPrerequisite:
    "Scegli prima una data e un luogo di osservazione per preparare il piano.",
  noPlans:
    "Nessun piano per questa notte. Aggiungine uno per iniziare a prepararla.",
  newPlaceTitle: "Nuovo luogo di osservazione",
  editPlaceTitle: "Modificare il luogo di osservazione",
  locationStep: "Posizione",
  horizonStep: "Orizzonte",
  saveStep: "Salvare",
  locate: "Usare la mia posizione",
  locating: "Ricerca della posizione in corso…",
  located: "Posizione proposta. Controlla il segnaposto prima di continuare.",
  gpsFailed:
    "Posizione non disponibile. Cerca un indirizzo o scegli un punto sulla mappa.",
  gpsDenied:
    "L’accesso alla posizione è stato negato. Consentilo nelle impostazioni del browser e riprova, oppure scegli un punto sulla mappa.",
  gpsUnavailable:
    "Non è stato possibile determinare la posizione. Verifica che i servizi di localizzazione siano attivi, oppure scegli un punto sulla mappa.",
  gpsTimeout:
    "La localizzazione ha richiesto troppo tempo. Riprova, oppure scegli un punto sulla mappa.",
  locationKept:
    "Posizione salvata mantenuta. Rileva di nuovo la posizione solo per spostarla.",
  address: "Indirizzo o luogo",
  search: "Cercare",
  searching: "Ricerca in corso…",
  noResults:
    "Nessun risultato. Prova con una località vicina o scegli un punto sulla mappa.",
  searchError:
    "La ricerca degli indirizzi non è disponibile. La posizione attuale viene mantenuta; mappa e coordinate restano utilizzabili.",
  mapHelp:
    "Fai clic sulla mappa o tienila premuta, oppure trascina il segnaposto, per precisare la posizione.",
  mapLoading: "Caricamento della mappa…",
  mapError:
    "Mappa non disponibile. La ricerca degli indirizzi e le coordinate restano utilizzabili.",
  coords: "Coordinate e quota",
  coordsInfo: "Fonti della ricerca e della quota",
  mapDark: "Mappa scura del mondo, segnaposto dorato",
  latitude: "Latitudine (°)",
  longitude: "Longitudine (°)",
  elevation: "Quota (m)",
  applyCoords: "Usare queste coordinate",
  invalidCoords:
    "Inserisci una latitudine tra −90° e 90° e una longitudine tra −180° e 180°.",
  timezone: "Fuso orario ricavato dal luogo",
  timezoneBusy: "Determinazione del fuso orario e della quota…",
  elevationUnavailable:
    "Non è stato possibile stimare automaticamente la quota. Inseriscila a mano in «Coordinate e quota».",
  timezoneError:
    "Non è stato possibile determinare il fuso orario. Riprova prima di salvare.",
  retry: "Riprovare",
  horizonHelp:
    "Usa le maniglie viola per disegnare gli alberi, gli edifici e i rilievi che nascondono il cielo. Qui non viene mostrato alcun target.",
  horizonCloseToMount: "Rilevalo il più vicino possibile alla montatura.",
  horizonWhy:
    "Definire l’orizzonte permetterà di escludere i target che non sono visibili e di migliorare l’aiuto per lo stazionamento del tuo telescopio.",
  horizonClear: "Nessuna maschera dell’orizzonte",
  horizonEnable: "Applicare questa maschera dell’orizzonte",
  horizonConfirm: "Confermare questo orizzonte",
  horizonNeeded:
    "Disegna o conferma l’orizzonte, oppure scegli un orizzonte libero.",
  horizonMoved:
    "Il punto è cambiato. Verifica l’orizzonte della nuova posizione.",
  horizonUnknown: "Orizzonte da rilevare",
  horizonNone: "Orizzonte da rilevare",
  horizonSaved: "Maschera dell’orizzonte attiva",
  horizonDisabled: "Maschera disattivata",
  direction: "Direzione / azimut",
  obstacle: "Altezza dell’ostacolo (°)",
  horizonLower: "Abbassare questo punto di 1°",
  horizonRaise: "Alzare questo punto di 1°",
  horizonSurveyed: "Rilevato",
  horizonToSurvey: "Da rilevare",
  horizonSurveyedOn: "Rilevato il {date}",
  horizonSectorsLegend: "Settori dell’orizzonte",
  oldMasks: "Associare una maschera precedente",
  oldMasksHelp:
    "Queste maschere non avevano coordinate affidabili. Scegline una solo se appartiene a questo luogo.",
  name: "Nome del luogo",
  destination: "Luogo da modificare",
  placeModeLabel: "Modalità del luogo",
  placeModeModify: "Modificare un luogo",
  placeModeCreate: "Creare un luogo",
  newEntry: "Creare un nuovo luogo",
  updateEntry: "Aggiornare",
  savePlace: "Salvare questo luogo",
  nameNeeded: "Dai un nome a questo luogo.",
  historicalPlace:
    "Le notti precedenti mantengono il luogo e l’orizzonte salvati.",
  back: "Indietro",
  nextHorizon: "Definire l’orizzonte",
  nextName: "Scegliere un nome",
  cancel: "Annullare",
  position: "Posizione selezionata",
  positionPrivacy:
    "Le coordinate del luogo vanno a questo server. Questo ricava da sé il fuso orario; se mancano la quota o il nome, li chiede a Open-Meteo (Copernicus DEM) e a Photon (OpenStreetMap). Una ricerca di indirizzi segue lo stesso percorso, solo quando la si conferma. I fornitori vedono questo server, non il browser.",
  plans: "I piani per questa notte",
  mode: "Come desidera osservare?",
  equipment: "Con quale attrezzatura?",
  materialTitle: "Attrezzatura",
  constraints: "Quali target proporre?",
  constraintsTitle: "Vincoli",
  horizonConstraintInfo:
    "La maschera dell’orizzonte è definita nel luogo di osservazione e vale per tutti i piani che usano quel luogo.",
  schedule: "Organizzare la notte",
  targets: "Scegliere i target",
  imageHelp: "Preparare le riprese.",
  visualHelp: "Esplorare all’oculare.",
  advanced: "Vincoli avanzati",
  advancedSummary: "Vincoli avanzati:",
  available: "target adatti a questo piano",
  showTargets: "Scegliere i target",
  showSchedule: "Vedere la linea del tempo",
  list: "Elenco",
  map: "Mappa",
  added: "Target aggiunto a questo piano.",
  filterHelp:
    "Sono possibili più scelte. Senza selezione, nessuna restrizione per filtro.",
  filterActive:
    "Con la restrizione dell’attrezzatura attiva, un target può corrispondere a uno qualsiasi dei filtri selezionati.",
  filterUnknown: "Compatibilità del filtro non documentata",
  review:
    "Alcune impostazioni salvate vanno verificate. Nessun target né intervallo è stato rimosso.",
  reviewDone: "Impostazioni verificate",
  review_altitude: "altezza minima",
  review_moon: "distanza dalla Luna",
  review_visual: "idoneità per l’osservazione visuale",
  review_horizon: "maschera dell’orizzonte",
  review_equipment: "compatibilità dell’attrezzatura",
  review_selection: "selezione editoriale",
  unresolvedTargets:
    "Target salvati in attesa di calcolo o di dati del catalogo (mantenuti invariati)",
  overlapPair: "{first} e {second} si sovrappongono dalle {start} alle {end}.",
  overlapLaunch:
    "Il piano viene conservato così com’è, ma non potrà essere avviato finché questi target si sovrappongono.",
  overlapTitle: "Dei target si sovrappongono",
  overlapBodyOne:
    "Due target di questo piano si dividono una parte della notte.",
  overlapBodyOther:
    "Più target di questo piano si dividono una parte della notte.",
  overlapBodySpread:
    "Diversi target di questo piano si dividono una parte della notte: «Distribuire» li colloca uno dopo l’altro, ciascuno nella sua finestra di visibilità. Non viene cancellato nulla.",
  overlapDetailShow: "Mostra i dettagli",
  overlapDetailHide: "Nascondi i dettagli",
  overlapSpread: "Distribuire i target",
  overlapKeep: "Convalidare senza poter avviare",
  otherNight: "Altri luoghi in questa data",
  readOnly:
    "Questo piano è in sola lettura. Puoi comunque cambiare notte o piano.",
};
