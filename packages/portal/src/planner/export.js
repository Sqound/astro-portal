import { copyFor } from "astro-contracts/locales";

// The words an export writes itself, in the language of the person who
// exports: the name of a plan that has none, the line of a plan without a
// target, the title and the description of the calendar's weather reminder.
// A plan's own name, a target's title and the file names stay as the person
// wrote them. Read through `copyFor` (English, said, for a locale without its
// words); the fixtures `ics-export`, `weather-reminder-ics` and `share-summary` take
// a `locale`. `weatherCheck` is followed by the plan's name.
const exportCopy = {
  en: {
    observationPlan: "Observation plan",
    noTargetSelected: "No target selected",
    weatherCheck: "Weather check — ",
    weatherDescription:
      "Recheck the local astronomy forecast before this observing night.",
  },
  fr: {
    observationPlan: "Plan d’observation",
    noTargetSelected: "Aucune cible sélectionnée",
    weatherCheck: "Vérification météo — ",
    weatherDescription:
      "Vérifiez de nouveau les prévisions astronomiques locales avant cette nuit d’observation.",
  },
  ja: {
    observationPlan: "観測プラン",
    noTargetSelected: "対象が選択されていません",
    weatherCheck: "天気の確認 — ",
    weatherDescription:
      "この観測の夜の前に、現地の天体観測向け予報を再確認してください。",
  },
  de: {
    observationPlan: "Beobachtungsplan",
    noTargetSelected: "Kein Ziel ausgewählt",
    weatherCheck: "Wetterprüfung — ",
    weatherDescription:
      "Prüfe vor dieser Beobachtungsnacht noch einmal die lokale astronomische Vorhersage.",
  },
  es: {
    observationPlan: "Plan de observación",
    noTargetSelected: "Ningún objetivo seleccionado",
    weatherCheck: "Revisión meteorológica — ",
    weatherDescription:
      "Vuelve a consultar el pronóstico astronómico local antes de esta noche de observación.",
  },
  it: {
    observationPlan: "Piano di osservazione",
    noTargetSelected: "Nessun target selezionato",
    weatherCheck: "Controllo meteo — ",
    weatherDescription:
      "Ricontrolla le previsioni astronomiche locali prima di questa notte di osservazione.",
  },
  "pt-BR": {
    observationPlan: "Plano de observação",
    noTargetSelected: "Nenhum alvo selecionado",
    weatherCheck: "Verificação meteorológica — ",
    weatherDescription:
      "Verifique novamente a previsão astronômica local antes desta noite de observação.",
  },
  "zh-Hans": {
    observationPlan: "观测计划",
    noTargetSelected: "未选择目标",
    weatherCheck: "天气检查：",
    weatherDescription: "请在这一夜开始前，再次查看当地的天文预报。",
  },
  "zh-Hant": {
    observationPlan: "觀測計畫",
    noTargetSelected: "未選擇目標",
    weatherCheck: "天氣檢查：",
    weatherDescription: "請在這一夜開始前，再次查看當地的天文預報。",
  },
  ru: {
    observationPlan: "План наблюдений",
    noTargetSelected: "Цель не выбрана",
    weatherCheck: "Проверка погоды — ",
    weatherDescription:
      "Перед этой ночью наблюдений ещё раз проверьте местный астрономический прогноз.",
  },
};

/** The words of the exports in `locale` (English, said, when it has none). */
export function exportWords(locale = "en") {
  return copyFor(exportCopy, locale, "planner/export.exportCopy");
}

function icalEscape(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n");
}

function icalDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString().replaceAll(/[-:]/g, "").replace(".000", "");
}

// `acquisitionText` is `{ [itemId]: "120 s · gain 100 · UV/IR-cut · …" }`
// (`acquisitionTextByItem`, « Prise de vue par cible »): the effective
// shooting line of a target in photo mode. A target that has one is
// written with it (its filter is part of it); the others are as they were.
export function planTargetSummary(plan, cards = [], acquisitionText = {}) {
  const byId = new Map(cards.map((card) => [card.target.id, card]));
  return (plan?.items || []).map((item) => {
    const card = byId.get(item.id);
    return {
      id: item.id,
      title:
        card?.target.title ||
        card?.target.designation ||
        card?.target.objects?.[0] ||
        item.id,
      filter: item.filter || card?.filter || "",
      ...(acquisitionText?.[item.id]
        ? { acquisition: acquisitionText[item.id] }
        : {}),
    };
  });
}

export function planCalendarIcs({
  plan,
  night,
  targets,
  reminderMinutes = 15,
  // Injected so an exported calendar file is reproducible in a test; the
  // browser passes nothing and keeps the current instant.
  now = new Date(),
  locale = "en",
  acquisitionText = {},
}) {
  const start = icalDate(night?.start),
    end = icalDate(night?.end);
  if (!start || !end || !plan?.id) return null;
  const title = plan.name || exportWords(locale).observationPlan;
  const targetLines = planTargetSummary(plan, targets, acquisitionText)
    .map((target) =>
      [target.title, target.acquisition || target.filter]
        .filter(Boolean)
        .join(" · "),
    )
    .join("\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sqound//PlanAstro Observation planner//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${icalEscape(`astro-portal-${plan.id}`)}`,
    `DTSTAMP:${icalDate(now) || start}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${icalEscape(title)}`,
    `DESCRIPTION:${icalEscape(targetLines || title)}`,
    "BEGIN:VALARM",
    `TRIGGER:-PT${Math.max(0, Math.round(reminderMinutes))}M`,
    "ACTION:DISPLAY",
    `DESCRIPTION:${icalEscape(title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function weatherReminderIcs({
  plan,
  night,
  now = new Date(),
  locale = "en",
}) {
  const words = exportWords(locale);
  const sessionStart = new Date(night?.start);
  if (Number.isNaN(sessionStart.getTime()) || !plan?.id) return null;
  const start = new Date(sessionStart.getTime() - 18 * 60 * 60 * 1000),
    end = new Date(start.getTime() + 15 * 60 * 1000),
    title = `${words.weatherCheck}${plan.name || words.observationPlan}`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sqound//PlanAstro Weather reminder//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${icalEscape(`astro-portal-weather-${plan.id}`)}`,
    `DTSTAMP:${icalDate(now) || icalDate(start)}`,
    `DTSTART:${icalDate(start)}`,
    `DTEND:${icalDate(end)}`,
    `SUMMARY:${icalEscape(title)}`,
    `DESCRIPTION:${icalEscape(words.weatherDescription)}`,
    "BEGIN:VALARM",
    "TRIGGER:PT0M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icalEscape(title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function planShareText({ plan, targets, locale = "en" }) {
  const words = exportWords(locale);
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${plan.date}T12:00:00Z`));
  return [
    plan.name || words.observationPlan,
    date,
    planTargetSummary(plan, targets)
      .map((target) => target.title)
      .join(", ") || words.noTargetSelected,
  ].join("\n");
}

// The portable "Astro Portal archive": the whole plan in a format/version
// envelope. Extracted from the planner's `exportPlan` handler so the same
// envelope can be produced without a DOM.
export function planArchive({ plan, exportedAt = new Date() }) {
  if (!plan) return null;
  const stamp = exportedAt instanceof Date ? exportedAt : new Date(exportedAt);
  return {
    format: "astro-portal-observation-plan",
    version: 1,
    exportedAt: Number.isNaN(stamp.getTime()) ? null : stamp.toISOString(),
    plan,
  };
}

// The archive exactly as it is written to disk: pretty-printed with a final
// newline, so the bytes are identical on every platform.
export function planArchiveDocument({ plan, exportedAt = new Date() }) {
  const archive = planArchive({ plan, exportedAt });
  return archive ? `${JSON.stringify(archive, null, 2)}\n` : null;
}
