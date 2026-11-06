import { copyFor } from "portal/locales.js";
// The multi-night plans ("plans multi-nuits") as the open planner sees them:
// a point every shell registers (`planner.projects`,
// `portal/planner/extensions.js`) with the open core's views
// (`projects/components/extension.js`). The core only knows where they
// belong, and what to draw when they are held back.
//
// Who sees what (the server never restricts the multi-night plans; a service
// that sells them does):
//
//  - nothing registered: nothing at all; a plan whose items carry a
//    `projectId` reads as a normal plan;
//  - registered, signed out: "visitor", the views explain that a
//    multi-night plan lives in a space;
//  - registered, signed in, on a private server (the open-source
//    composition, or any page that is not a service that sells them): "open",
//    always — nothing is sold there, nothing is held back;
//  - registered, signed in, on a service that sells them, without `planner.mosaic`
//    (the capability that sells them): "heldBack", every entry is
//    drawn with the badge "Planification avancée" and leads to the words
//    of the offers (`planner.offers`), the way the greyed "Mosaïque"
//    section does;
//  - the same, in the read-only window of an ended subscription,
//    holding multi-night plans: "readOnly" -- the plans the person created
//    stay visible and open, nothing is created nor changed, and the line says
//    why (`windowLine`). After the window nothing changes: "heldBack";
//  - registered, signed in, on a service that sells them, with `planner.mosaic`:
//    "open".
//
// The screen is never the only barrier: such a service refuses the
// writes by itself (`403 capability_required` on `PUT /api/v1/projects/{id}`).

/** The planner extension point the multi-night plans are registered at. */
export const MULTI_NIGHT_POINT = "planner.projects";

export const MULTI_NIGHT_ACCESS = Object.freeze([
  "absent",
  "readOnly",
  "visitor",
  "heldBack",
  "open",
]);

/**
 * What the planner shows of the multi-night plans: `absent`, `readOnly`,
 * `visitor`, `heldBack` or `open` (see the file comment). `registered` says
 * whether a shell registered `planner.projects`; `hosted` whether the page
 * is a service that sells them (`isHostedService`); `capabilities` the person's
 * profile; `stored` how many multi-night plans (not archived) the space
 * holds, read in the read-only window.
 */
export function multiNightAccess({
  registered = false,
  hosted = false,
  signedIn = false,
  capabilities = null,
  stored = 0,
  readOnlyWindow = false,
} = {}) {
  if (!registered) return "absent";
  if (!signedIn) return "visitor";
  // A private server never restricts them.
  if (!hosted) return "open";
  if (capabilities?.["planner.mosaic"] === true) return "open";
  // In the read-only window of an ended subscription the multi-night plans
  // the person created stay visible, read only. After the window nothing
  // changes: the side is held back.
  return readOnlyWindow && stored > 0 ? "readOnly" : "heldBack";
}

/**
 * Whether the planner reads the space's multi-night plans of a service
 * that sells them to show them read-only: signed in, a shell registered at
 * `planner.projects`, `planner.mosaic` missing, in the read-only window of an
 * ended subscription.
 */
export function multiNightWindowReads({
  registered = false,
  hosted = false,
  signedIn = false,
  capabilities = null,
  readOnlyWindow = false,
} = {}) {
  return (
    hosted &&
    registered &&
    Boolean(signedIn) &&
    readOnlyWindow &&
    capabilities?.["planner.mosaic"] !== true
  );
}

/**
 * What a choice on the switch "Une nuit | Multi-nuits" does: `"offers"`
 * for "Multi-nuits" while the purchase is missing (`heldBack`) — the tab
 * itself leads to the offers, the one guard of every multi-night entry —
 * else the side asked for, which opens as before (owned, signed out,
 * read-only in the window of an ended subscription).
 */
export function planKindChoiceOutcome(access, kind) {
  return kind === "multi" && access === "heldBack" ? "offers" : kind;
}

/**
 * The chip "Planification avancée" of a multi-night entry (the switch's
 * "Multi-nuits" segment, the choice of "Nouveau plan"): the label the
 * shell registered, while the purchase is missing (`heldBack`) and nothing in
 * every other profile, whatever the shell offers — one capability, one answer
 * for every entry.
 */
export function multiNightBadgeFor(access, label) {
  return access === "heldBack" && label ? label : null;
}

/**
 * The side of the library shown: while the purchase is missing the
 * multi-night side is never shown locked, whatever kept a `"multi"` (a link,
 * a side left from before).
 */
export function shownPlanKindFor(access, kind) {
  return access === "heldBack" ? "one" : kind;
}

/** The words the open planner says of the multi-night plans itself. */
export const MULTI_NIGHT_CORE_COPY = {
  fr: {
    switchLabel: "Afficher vos plans d’une nuit ou vos plans multi-nuits",
    oneNight: "Une nuit",
    multiNight: "Multi-nuits",
    inProgress: "En cours",
    chip: "Multi-nuits",
    band: "plan multi-nuits {target}",
    entryTitle: "Que voulez-vous préparer ?",
    entryOneNight: "Un plan d’une nuit",
    entryOneNightHelp: "Un plan pour une date et un lieu",
    entryMulti: "Un plan multi-nuits",
    entryMultiHelp:
      "Une cible ou un cadrage, avec un objectif d’heures à atteindre",
    continue: "Continuer",
    close: "Fermer",
    follow: "Suivre sur plusieurs nuits",
    planActions: "Actions du plan",
    turnInto: "Transformer en plan multi-nuits",
    attach: "Rattacher à un plan multi-nuits",
    windowLine:
      "Votre abonnement est terminé : vos plans multi-nuits restent visibles, mais ne peuvent plus être modifiés.",
    newMultiNight: "Nouveau plan multi-nuits",
    noneInProgress: "Aucun plan multi-nuits en cours.",
    eyebrow: "Plan multi-nuits",
    goal: "Objectif",
    place: "Lieu",
    upcoming: "À venir",
    sessionsDone: "Sessions faites",
    seeSession: "Voir la session",
    noNights: "Aucune nuit pour l’instant.",
    back: "Retour aux plans multi-nuits",
  },
  en: {
    switchLabel: "Show your one-night plans or your multi-night plans",
    oneNight: "One night",
    multiNight: "Multi-night",
    inProgress: "In progress",
    chip: "Multi-night",
    band: "multi-night plan {target}",
    entryTitle: "What would you like to prepare?",
    entryOneNight: "A one-night plan",
    entryOneNightHelp: "A plan for one date and one place",
    entryMulti: "A multi-night plan",
    entryMultiHelp: "One target or framing, with a goal of hours to reach",
    continue: "Continue",
    close: "Close",
    follow: "Follow over several nights",
    planActions: "Plan actions",
    turnInto: "Turn into a multi-night plan",
    attach: "Attach to a multi-night plan",
    windowLine:
      "Your subscription has ended: your multi-night plans stay visible, but can no longer be changed.",
    newMultiNight: "New multi-night plan",
    noneInProgress: "No multi-night plan in progress.",
    eyebrow: "Multi-night plan",
    goal: "Goal",
    place: "Place",
    upcoming: "Upcoming",
    sessionsDone: "Sessions done",
    seeSession: "See the session",
    noNights: "No night yet.",
    back: "Back to the multi-night plans",
  },
  ja: {
    switchLabel: "1夜のプランと複数夜のプランを切り替えて表示",
    oneNight: "1夜",
    multiNight: "複数夜",
    inProgress: "進行中",
    chip: "複数夜",
    band: "複数夜のプラン {target}",
    entryTitle: "何を準備しますか？",
    entryOneNight: "1夜のプラン",
    entryOneNightHelp: "日付と場所を決めたプラン",
    entryMulti: "複数夜のプラン",
    entryMultiHelp: "1つの対象またはフレーミングと、達成したい時間の目標",
    continue: "続ける",
    close: "閉じる",
    follow: "複数夜で追う",
    planActions: "プランの操作",
    turnInto: "複数夜のプランにする",
    attach: "複数夜のプランに加える",
    windowLine:
      "ご利用のサブスクリプションは終了しました。複数夜のプランは引き続き表示されますが、変更はできません。",
    newMultiNight: "新しい複数夜のプラン",
    noneInProgress: "進行中の複数夜のプランはありません。",
    eyebrow: "複数夜のプラン",
    goal: "目標",
    place: "場所",
    upcoming: "これから",
    sessionsDone: "完了したセッション",
    seeSession: "セッションを見る",
    noNights: "まだ夜はありません。",
    back: "複数夜のプランに戻る",
  },
  de: {
    switchLabel:
      "Deine Pläne für eine Nacht oder deine Mehrnachtpläne anzeigen",
    oneNight: "Eine Nacht",
    multiNight: "Mehrere Nächte",
    inProgress: "Läuft",
    chip: "Mehrere Nächte",
    band: "Mehrnachtplan {target}",
    entryTitle: "Was möchtest du vorbereiten?",
    entryOneNight: "Ein Plan für eine Nacht",
    entryOneNightHelp: "Ein Plan für ein Datum und einen Ort",
    entryMulti: "Ein Mehrnachtplan",
    entryMultiHelp:
      "Ein Ziel oder ein Bildausschnitt, mit einer zu erreichenden Zielvorgabe an Stunden",
    continue: "Weiter",
    close: "Schließen",
    follow: "Über mehrere Nächte verfolgen",
    planActions: "Aktionen für den Plan",
    turnInto: "In einen Mehrnachtplan umwandeln",
    attach: "Einem Mehrnachtplan zuordnen",
    windowLine:
      "Dein Abonnement ist beendet: Deine Mehrnachtpläne bleiben sichtbar, lassen sich aber nicht mehr ändern.",
    newMultiNight: "Neuer Mehrnachtplan",
    noneInProgress: "Kein Mehrnachtplan in Arbeit.",
    eyebrow: "Mehrnachtplan",
    goal: "Zielvorgabe",
    place: "Ort",
    upcoming: "Bevorstehend",
    sessionsDone: "Durchgeführte Sitzungen",
    seeSession: "Sitzung ansehen",
    noNights: "Noch keine Nacht.",
    back: "Zurück zu den Mehrnachtplänen",
  },
  es: {
    switchLabel:
      "Mostrar tus planes de una noche o tus planes de varias noches",
    oneNight: "Una noche",
    multiNight: "Varias noches",
    inProgress: "En curso",
    chip: "Varias noches",
    band: "plan de varias noches {target}",
    entryTitle: "¿Qué quieres preparar?",
    entryOneNight: "Un plan de una noche",
    entryOneNightHelp: "Un plan para una fecha y un lugar",
    entryMulti: "Un plan de varias noches",
    entryMultiHelp:
      "Un objetivo o un encuadre, con una meta de horas por alcanzar",
    continue: "Continuar",
    close: "Cerrar",
    follow: "Seguir a lo largo de varias noches",
    planActions: "Acciones del plan",
    turnInto: "Convertir en plan de varias noches",
    attach: "Vincular a un plan de varias noches",
    windowLine:
      "Tu suscripción ha terminado: tus planes de varias noches siguen visibles, pero ya no se pueden modificar.",
    newMultiNight: "Nuevo plan de varias noches",
    noneInProgress: "No hay ningún plan de varias noches en curso.",
    eyebrow: "Plan de varias noches",
    goal: "Meta",
    place: "Lugar",
    upcoming: "Próximas",
    sessionsDone: "Sesiones realizadas",
    seeSession: "Ver la sesión",
    noNights: "Aún no hay ninguna noche.",
    back: "Volver a los planes de varias noches",
  },
  it: {
    switchLabel: "Mostrare i piani di una notte o i piani su più notti",
    oneNight: "Piano di una notte",
    multiNight: "Piano su più notti",
    inProgress: "In corso",
    chip: "Più notti",
    band: "piano su più notti {target}",
    entryTitle: "Che cosa vuoi preparare?",
    entryOneNight: "Un piano di una notte",
    entryOneNightHelp: "Un piano per una data e un luogo",
    entryMulti: "Un piano su più notti",
    entryMultiHelp:
      "Un target o un’inquadratura, con un obiettivo di ore da raggiungere",
    continue: "Continuare",
    close: "Chiudere",
    follow: "Seguire su più notti",
    planActions: "Azioni del piano",
    turnInto: "Trasformare in piano su più notti",
    attach: "Associare a un piano su più notti",
    windowLine:
      "Il tuo abbonamento è terminato: i tuoi piani su più notti restano visibili, ma non si possono più modificare.",
    newMultiNight: "Nuovo piano su più notti",
    noneInProgress: "Nessun piano su più notti in corso.",
    eyebrow: "Piano su più notti",
    goal: "Obiettivo",
    place: "Luogo",
    upcoming: "In arrivo",
    sessionsDone: "Sessioni svolte",
    seeSession: "Vedere la sessione",
    noNights: "Ancora nessuna notte.",
    back: "Tornare ai piani su più notti",
  },
  "pt-BR": {
    switchLabel:
      "Mostrar seus planos de uma noite ou seus planos de várias noites",
    oneNight: "Uma noite",
    multiNight: "Várias noites",
    inProgress: "Em andamento",
    chip: "Várias noites",
    band: "plano de várias noites {target}",
    entryTitle: "O que você quer preparar?",
    entryOneNight: "Um plano de uma noite",
    entryOneNightHelp: "Um plano para uma data e um local",
    entryMulti: "Um plano de várias noites",
    entryMultiHelp:
      "Um alvo ou um enquadramento, com uma meta de horas a atingir",
    continue: "Continuar",
    close: "Fechar",
    follow: "Acompanhar ao longo de várias noites",
    planActions: "Ações do plano",
    turnInto: "Transformar em plano de várias noites",
    attach: "Vincular a um plano de várias noites",
    windowLine:
      "Sua assinatura terminou: seus planos de várias noites continuam visíveis, mas não podem mais ser alterados.",
    newMultiNight: "Novo plano de várias noites",
    noneInProgress: "Nenhum plano de várias noites em andamento.",
    eyebrow: "Plano de várias noites",
    goal: "Meta",
    place: "Local",
    upcoming: "Próximas",
    sessionsDone: "Sessões realizadas",
    seeSession: "Ver a sessão",
    noNights: "Nenhuma noite ainda.",
    back: "Voltar aos planos de várias noites",
  },
  "zh-Hans": {
    switchLabel: "显示你的单夜计划或多夜计划",
    oneNight: "单夜",
    multiNight: "多夜",
    inProgress: "进行中",
    chip: "多夜",
    band: "多夜计划{target}",
    entryTitle: "要准备什么？",
    entryOneNight: "单夜计划",
    entryOneNightHelp: "针对某个日期和地点的计划",
    entryMulti: "多夜计划",
    entryMultiHelp: "针对一个目标或构图，设定要累积的小时数目标",
    continue: "继续",
    close: "关闭",
    follow: "跨多夜跟进",
    planActions: "计划操作",
    turnInto: "转为多夜计划",
    attach: "加入多夜计划",
    windowLine: "你的订阅已结束：你的多夜计划仍可查看，但无法再修改。",
    newMultiNight: "新建多夜计划",
    noneInProgress: "没有进行中的多夜计划。",
    eyebrow: "多夜计划",
    goal: "目标时长",
    place: "地点",
    upcoming: "即将进行",
    sessionsDone: "已完成的观测记录",
    seeSession: "查看观测记录",
    noNights: "尚无夜晚。",
    back: "返回多夜计划列表",
  },
  "zh-Hant": {
    switchLabel: "顯示你的單夜計畫或多夜計畫",
    oneNight: "單夜",
    multiNight: "多夜",
    inProgress: "進行中",
    chip: "多夜",
    band: "多夜計畫 {target}",
    entryTitle: "要準備什麼？",
    entryOneNight: "單夜計畫",
    entryOneNightHelp: "針對某個日期與地點的計畫",
    entryMulti: "多夜計畫",
    entryMultiHelp: "針對一個目標或構圖，設定要累積的小時數目標",
    continue: "繼續",
    close: "關閉",
    follow: "跨多夜追蹤",
    planActions: "計畫操作",
    turnInto: "轉為多夜計畫",
    attach: "加入多夜計畫",
    windowLine: "你的訂閱已結束：你的多夜計畫仍可檢視，但無法再修改。",
    newMultiNight: "新增多夜計畫",
    noneInProgress: "沒有進行中的多夜計畫。",
    eyebrow: "多夜計畫",
    goal: "時數目標",
    place: "地點",
    upcoming: "即將進行",
    sessionsDone: "已完成的觀測記錄",
    seeSession: "查看觀測記錄",
    noNights: "尚無夜晚。",
    back: "返回多夜計畫",
  },
  ru: {
    switchLabel: "Показать планы на одну ночь или на несколько ночей",
    oneNight: "Одна ночь",
    multiNight: "Несколько ночей",
    inProgress: "Выполняется",
    chip: "Несколько ночей",
    band: "план на несколько ночей {target}",
    entryTitle: "Что вы хотите подготовить?",
    entryOneNight: "План на одну ночь",
    entryOneNightHelp: "План на одну дату и одно место",
    entryMulti: "План на несколько ночей",
    entryMultiHelp: "Одна цель или кадрирование и цель по часам накопления",
    continue: "Продолжить",
    close: "Закрыть",
    follow: "Вести в течение нескольких ночей",
    planActions: "Действия с планом",
    turnInto: "Сделать планом на несколько ночей",
    attach: "Прикрепить к плану на несколько ночей",
    windowLine:
      "Ваша подписка закончилась: ваши планы на несколько ночей остаются видимыми, но изменить их больше нельзя.",
    newMultiNight: "Новый план на несколько ночей",
    noneInProgress: "Планов на несколько ночей в работе нет.",
    eyebrow: "План на несколько ночей",
    goal: "Цель",
    place: "Место",
    upcoming: "Предстоящие",
    sessionsDone: "Выполненные сеансы",
    seeSession: "Открыть сеанс",
    noNights: "Ночей пока нет.",
    back: "К планам на несколько ночей",
  },
};

export const multiNightCoreCopy = (locale) =>
  copyFor(MULTI_NIGHT_CORE_COPY, locale, "MULTI_NIGHT_CORE_COPY");

const text = (value) => (typeof value === "string" ? value.trim() : "");

/** The multi-night plans a plan's items follow, in the items' order. */
export function planProjectIds(plan) {
  const ids = [];
  for (const item of Array.isArray(plan?.items) ? plan.items : []) {
    const id = item && typeof item === "object" ? item.projectId : null;
    if (typeof id === "string" && id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** "NGC 7000": the name a plan item's target is shown under. */
export function planItemTargetName(item) {
  const target =
    item?.target && typeof item.target === "object" ? item.target : {};
  return (
    text(target.designation) ||
    text(target.title) ||
    text(item?.name) ||
    text(item?.id)
  );
}

/**
 * The band of a plan card that holds a night of a multi-night plan:
 * "plan multi-nuits NGC 7000" (the first followed target), or `null`.
 */
export function planBandText(locale, plan) {
  const item = (Array.isArray(plan?.items) ? plan.items : []).find(
    (entry) => typeof entry?.projectId === "string" && entry.projectId,
  );
  if (!item) return null;
  return multiNightCoreCopy(locale).band.replace(
    "{target}",
    planItemTargetName(item),
  );
}
