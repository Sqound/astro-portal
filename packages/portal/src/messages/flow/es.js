export const flowMessagesEs = {
  weatherUnavailable:
    "Los pronósticos del tiempo no están disponibles temporalmente.",
  weatherCached: "Pronóstico guardado en caché; puede estar desactualizado.",
  weatherStale:
    "Los servicios meteorológicos no están disponibles temporalmente. Último pronóstico recibido a las {time}; estos datos pueden estar desactualizados.",
  weatherRateLimited:
    "Los servicios meteorológicos están limitando las solicitudes. Espera antes de volver a intentarlo.",
  weatherBeyondRangeTitle: "Pronóstico del tiempo aún no disponible",
  weatherBeyondRangeHelp:
    "Esta noche queda fuera del período de pronóstico meteorológico disponible. El pronóstico aparecerá automáticamente a medida que se acerque la fecha. Los cálculos astronómicos siguen disponibles.",
  viewHorizon: "Ver el horizonte de este lugar",
  close: "Cerrar",
  horizonReset: "Restablecer el horizonte",
  distantPlace:
    "Atención: el lugar que estás actualizando se encuentra a más de {distance} km de la posición elegida.",
  farTitle: "¿Cambiar a un lugar muy lejano?",
  farBody:
    "Atención: vas a sustituir el lugar actual por uno totalmente distinto. Los planes existentes se trasladarán a este lugar, pero es posible que los objetivos elegidos ya no sean adecuados.",
  farReplace: "Mover la noche a este lugar",
  farPlanLine:
    "El plan «{plan}» ya no está en {from}: pasa a {to}. No se borra nada, «{from}» sigue en Mis lugares.",
  farDistance: "≈ {distance} km",
  farCurrent: "Actual",
  farNew: "Nuevo",
  farMapLabel:
    "Dos lugares lejanos unidos por una línea curva: unos {distance} kilómetros",
  modifyTitle: "¿Modificar «{name}»?",
  modifyBody:
    "La posición elegida está a {distance} km de este lugar. ¿Es este el lugar que quieres mover? Si no, crea un lugar nuevo y conserva el anterior.",
  modifyConfirm: "Modificar este lugar",
  leaveTitle: "¿Descartar tus cambios?",
  leaveKeep: "Seguir editando",
  leaveConfirm: "Descartar",
  leaveNewBody:
    "El lugar que estás introduciendo aún no está guardado: si sales ahora, lo perderás.",
  leaveEditBody:
    "Los cambios de este lugar aún no están guardados: si sales ahora, los perderás.",
  horizonTimeHint:
    "Desliza sobre el mapa: a la izquierda, más temprano; a la derecha, más tarde.",
  horizonRotateHint: "Desliza hacia arriba o hacia abajo: el mapa gira.",
  horizonRotateHintInfo:
    "Las dos franjas a los lados del mapa no lo giran: desliza sobre ellas para desplazar la página.",
  belowMinimum: "Por debajo de la altitud mínima ({altitude})",
  behindHorizon: "Detrás de la máscara de horizonte",
  horizonMapHelp:
    "Esta vista usa el horizonte guardado para el lugar de observación seleccionado.",
  review_zenith: "límite de seguridad cerca del cenit",
  review_meridian: "límite de seguridad en el meridiano",
  review_cables: "límite de acimut de la montura",
  "review_wind-over-tolerance":
    "ráfagas por encima de la tolerancia de tu montura",
  "review_wind-near-tolerance": "ráfagas cercanas al límite de tu montura",
  "review_outside-night-span": "fuera del tramo elegido de la noche",
  "review_outside-usable-window": "fuera de la ventana útil",
  where: "Lugar y fecha",
  stageCrumbLabel: "Ir al inicio de la sección {title}.",
  whereHelp:
    "Un lugar y una noche, comunes a estos planes; la duración de la noche es propia de cada plan.",
  forecast: "Pronóstico astronómico",
  nightQuality: "Calidad del tiempo de la noche",
  newPlace: "Agregar un lugar…",
  editPlace: "Editar este lugar",
  pickPlace: "Elegir un lugar",
  noPlace: "Agrega un lugar para calcular esta noche.",
  planPrerequisite:
    "Elige primero una fecha y un lugar de observación para preparar tu plan.",
  noPlans:
    "Aún no hay ningún plan para esta noche. Agrega uno para empezar a prepararla.",
  newPlaceTitle: "Nuevo lugar de observación",
  editPlaceTitle: "Editar lugar de observación",
  locationStep: "Ubicación",
  horizonStep: "Horizonte",
  saveStep: "Guardar",
  locate: "Usar mi posición",
  locating: "Buscando tu posición…",
  located: "Posición propuesta. Comprueba el marcador antes de continuar.",
  gpsFailed:
    "Posición no disponible. Busca una dirección o elige un punto en el mapa.",
  gpsDenied:
    "Se denegó el acceso a tu ubicación. Permítelo en la configuración del navegador y vuelve a intentarlo, o elige un punto en el mapa.",
  gpsUnavailable:
    "No se pudo determinar tu posición. Comprueba que los servicios de ubicación estén activados, o elige un punto en el mapa.",
  gpsTimeout:
    "La ubicación tardó demasiado. Vuelve a intentarlo o elige un punto en el mapa.",
  locationKept:
    "Se conserva la posición guardada. Vuelve a ubicarte solo si deseas moverla.",
  address: "Dirección o lugar",
  search: "Buscar",
  searching: "Buscando…",
  noResults:
    "Sin resultados. Prueba con una localidad cercana o elige un punto en el mapa.",
  searchError:
    "La búsqueda de direcciones no está disponible. Se conserva tu posición actual; aún puedes usar el mapa o las coordenadas.",
  mapHelp:
    "Haz clic en el mapa o mantenlo pulsado, o arrastra el marcador, para afinar la posición.",
  mapLoading: "Cargando el mapa…",
  mapError:
    "Mapa no disponible. La búsqueda de direcciones y las coordenadas siguen disponibles.",
  coords: "Coordenadas y elevación",
  coordsInfo: "Fuentes de la búsqueda y de la elevación",
  mapDark: "Mapa oscuro del mundo, marcador dorado",
  latitude: "Latitud (°)",
  longitude: "Longitud (°)",
  elevation: "Elevación (m)",
  applyCoords: "Usar estas coordenadas",
  invalidCoords:
    "Indica una latitud entre −90° y 90° y una longitud entre −180° y 180°.",
  timezone: "Zona horaria deducida del lugar",
  timezoneBusy: "Determinando la zona horaria y la elevación…",
  elevationUnavailable:
    "No se pudo estimar la elevación automáticamente. Escríbela manualmente en «Coordenadas y elevación».",
  timezoneError:
    "No se pudo determinar la zona horaria. Vuelve a intentarlo antes de guardar.",
  retry: "Reintentar",
  horizonHelp:
    "Usa los puntos de control violetas para dibujar los árboles, edificios y relieves que tapan tu cielo. Aquí no se muestra ningún objetivo.",
  horizonCloseToMount: "Regístralo lo más cerca posible de la montura.",
  horizonWhy:
    "Definir el horizonte permitirá excluir los objetivos que no son visibles y mejorar la ayuda para poner en estación tu telescopio.",
  horizonClear: "Sin máscara de horizonte",
  horizonEnable: "Aplicar esta máscara de horizonte",
  horizonConfirm: "Confirmar este horizonte",
  horizonNeeded:
    "Dibuja o confirma tu horizonte, o elige un horizonte despejado.",
  horizonMoved: "El punto cambió. Revisa el horizonte de esta nueva posición.",
  horizonUnknown: "Horizonte por registrar",
  horizonNone: "Horizonte por registrar",
  horizonSaved: "Máscara de horizonte activa",
  horizonDisabled: "Máscara desactivada",
  direction: "Dirección / acimut",
  obstacle: "Altitud del obstáculo (°)",
  horizonLower: "Bajar este punto 1°",
  horizonRaise: "Subir este punto 1°",
  horizonSurveyed: "Registrado",
  horizonToSurvey: "Por registrar",
  horizonSurveyedOn: "Registrado el {date}",
  horizonSectorsLegend: "Sectores del horizonte",
  oldMasks: "Asociar una máscara anterior",
  oldMasksHelp:
    "Estas máscaras no tenían coordenadas fiables. Elige una solo si corresponde a este lugar.",
  name: "Nombre del lugar",
  destination: "Lugar que modificar",
  placeModeLabel: "Modo del lugar",
  placeModeModify: "Modificar un lugar",
  placeModeCreate: "Crear un lugar",
  newEntry: "Crear un lugar nuevo",
  updateEntry: "Actualizar",
  savePlace: "Guardar este lugar",
  nameNeeded: "Da un nombre a este lugar.",
  historicalPlace:
    "Las noches anteriores conservan su ubicación y su horizonte guardados.",
  back: "Volver",
  nextHorizon: "Definir el horizonte",
  nextName: "Elegir un nombre",
  cancel: "Cancelar",
  position: "Posición seleccionada",
  positionPrivacy:
    "Las coordenadas del lugar van a este servidor. Este averigua por sí mismo la zona horaria; si faltan la elevación o el nombre, los pide a Open-Meteo (Copernicus DEM) y a Photon (OpenStreetMap). Una búsqueda de direcciones sigue el mismo camino, solo cuando la confirmas. Los proveedores ven este servidor, no tu navegador.",
  plans: "Tus planes para esta noche",
  mode: "¿Cómo va a observar?",
  equipment: "¿Con qué equipo?",
  materialTitle: "Equipo",
  constraints: "¿Qué objetivos conviene sugerir?",
  constraintsTitle: "Restricciones",
  horizonConstraintInfo:
    "El despeje del horizonte se define en el lugar de observación y se aplica a todos los planes que usan ese lugar.",
  schedule: "Organizar la noche",
  targets: "Elegir objetivos",
  imageHelp: "Preparar las capturas.",
  visualHelp: "Explorar con el ocular.",
  advanced: "Restricciones avanzadas",
  advancedSummary: "Restricciones avanzadas:",
  available: "objetivos adecuados para este plan",
  showTargets: "Elegir objetivos",
  showSchedule: "Ver la cronología",
  list: "Lista",
  map: "Mapa",
  added: "Objetivo agregado a este plan.",
  filterHelp:
    "Se puede elegir más de uno. Sin selección, no se restringe por filtro.",
  filterActive:
    "Con la restricción de equipo activada, un objetivo puede coincidir con cualquiera de los filtros seleccionados.",
  filterUnknown: "Compatibilidad de filtro no documentada",
  review:
    "Algunos elementos de la configuración guardada requieren revisión. No se eliminó ningún objetivo ni intervalo.",
  reviewDone: "Configuración revisada",
  review_altitude: "altitud mínima",
  review_moon: "distancia a la Luna",
  review_visual: "idoneidad para la observación visual",
  review_horizon: "máscara de horizonte",
  review_equipment: "compatibilidad del equipo",
  review_selection: "selección editorial",
  unresolvedTargets:
    "Objetivos guardados a la espera de cálculo o de datos del catálogo (se conservan sin cambios)",
  overlapPair: "{first} y {second} se solapan de {start} a {end}.",
  overlapLaunch:
    "El plan se guarda tal cual, pero no se podrá iniciar mientras estos objetivos se solapen.",
  overlapTitle: "Hay objetivos que se solapan",
  overlapBodyOne: "Dos objetivos de este plan comparten una parte de la noche.",
  overlapBodyOther:
    "Varios objetivos de este plan comparten una parte de la noche.",
  overlapBodySpread:
    "Varios objetivos de este plan se reparten una parte de la noche: «Repartir» los coloca uno tras otro, cada uno en su ventana de visibilidad. No se borra nada.",
  overlapDetailShow: "Ver el detalle",
  overlapDetailHide: "Ocultar el detalle",
  overlapSpread: "Repartir los objetivos",
  overlapKeep: "Validar sin poder iniciar",
  otherNight: "Otros lugares en esta fecha",
  readOnly:
    "Este plan es de solo lectura. Aún puede cambiar de noche o de plan.",
};
