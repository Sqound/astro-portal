import { copyFor } from "portal/locales.js";
export const quickPlanMessages = {
  fr: {
    quickNightName: "Nuit du {date}",
    quickLaunchNightName: "Lancement rapide du {date}",
    planExistsTitle: "Un plan existe déjà pour ce soir",
    planExistsIntro: "Un seul plan par nuit.",
    planExistsMergeTitle: "Fusionner avec le plan de ce soir",
    planExistsMergeBody:
      "Les cibles cochées vont dans le temps libre de « {name} » ({free}) ; rien de ce qui est placé ne bouge.",
    planExistsMergePlace:
      "Lieu de ce plan : {place} ; les cibles sont placées pour ce lieu.",
    planExistsMergeShort:
      "Il ne reste que {free} libres dans la nuit : une cible demande {minimum} au moins.",
    planExistsMergeAction: "Fusionner avec ce plan",
    planExistsEraseTitle: "Effacer le plan de ce soir et recommencer",
    planExistsTitleNight: "Un plan existe déjà pour la nuit du {date}",
    planExistsMergeTitleNight: "Fusionner avec le plan de la nuit du {date}",
    planExistsEraseTitleNight:
      "Effacer le plan de la nuit du {date} et recommencer",
    planCreatedOtherNight: "Le plan de la nuit du {date} est prêt.",
    planExistsSummary: "{name} · {date} · {count} cibles",
    planExistsJournal:
      "Les sessions déjà faites avec ce plan restent dans le Journal.",
    planExistsEraseAction: "Effacer et recommencer",
    planExistsRunning:
      "Ce plan est en cours d’exécution : il ne peut pas être effacé d’ici.",
    planExistsDebrief:
      "Ce plan attend d’être débriefé : il ne peut pas être effacé d’ici.",
    planExistsConfirmTitle: "Effacer « {name} » ?",
    planExistsConfirmLocal:
      "Le plan du {date} et ses {count} cibles sont effacés de cet appareil. Les sessions déjà faites restent dans le Journal.",
    planExistsConfirmSync:
      "Le plan du {date} et ses {count} cibles sont effacés de cet appareil et de vos autres appareils. Les sessions déjà faites restent dans le Journal.",
    planExistsConfirmAction: "Effacer ce plan",
    planExistsConfirmLabel: "Effacer le plan",
    planExistsNothingPlaced:
      "Aucune des cibles cochées n’a pu être placée sur cette nuit.",
    cancel: "Annuler",
    plannerFlowClose: "Fermer",
  },
  en: {
    quickNightName: "Night of {date}",
    quickLaunchNightName: "Quick launch of {date}",
    planExistsTitle: "A plan already exists for tonight",
    planExistsIntro: "One plan per night.",
    planExistsMergeTitle: "Merge with tonight’s plan",
    planExistsMergeBody:
      "The ticked targets go into the free time in “{name}” ({free}); nothing already placed moves.",
    planExistsMergePlace:
      "This plan’s place: {place}; targets are placed for this place.",
    planExistsMergeShort:
      "Only {free} free remain in the night: a target needs at least {minimum}.",
    planExistsMergeAction: "Merge with this plan",
    planExistsEraseTitle: "Erase tonight’s plan and start again",
    planExistsTitleNight: "A plan already exists for the night of {date}",
    planExistsMergeTitleNight: "Merge with the plan for the night of {date}",
    planExistsEraseTitleNight:
      "Erase the plan for the night of {date} and start again",
    planCreatedOtherNight: "The plan for the night of {date} is ready.",
    planExistsSummary: "{name} · {date} · {count} targets",
    planExistsJournal:
      "The sessions already done with this plan stay in the Journal.",
    planExistsEraseAction: "Erase and start again",
    planExistsRunning: "This plan is being executed: it cannot be erased here.",
    planExistsDebrief: "This plan awaits debriefing: it cannot be erased here.",
    planExistsConfirmTitle: "Erase “{name}”?",
    planExistsConfirmLocal:
      "The plan for {date} and its {count} targets are erased from this device. The sessions already done stay in the Journal.",
    planExistsConfirmSync:
      "The plan for {date} and its {count} targets are erased from this device and your other devices. The sessions already done stay in the Journal.",
    planExistsConfirmAction: "Erase this plan",
    planExistsConfirmLabel: "Erase the plan",
    planExistsNothingPlaced:
      "None of the ticked targets could be placed in this night.",
    cancel: "Cancel",
    plannerFlowClose: "Close",
  },
  ja: {
    quickNightName: "{date}の夜",
    quickLaunchNightName: "{date}のクイック開始",
    planExistsTitle: "今夜のプランがすでにあります",
    planExistsIntro: "1つの夜につき1つのプランです。",
    planExistsMergeTitle: "今夜のプランに統合",
    planExistsMergeBody:
      "チェックした対象を「{name}」の空き時間（{free}）に配置します。配置済みの対象は移動しません。",
    planExistsMergePlace:
      "このプランの場所：{place}。この場所に合わせて対象を配置します。",
    planExistsMergeShort:
      "夜の空き時間は{free}のみです。対象1つに少なくとも{minimum}必要です。",
    planExistsMergeAction: "このプランに統合",
    planExistsEraseTitle: "今夜のプランを消去して作り直す",
    planExistsTitleNight: "{date}の夜のプランがすでにあります",
    planExistsMergeTitleNight: "{date}の夜のプランに統合",
    planExistsEraseTitleNight: "{date}の夜のプランを消去して作り直す",
    planCreatedOtherNight: "{date}の夜のプランの準備ができました。",
    planExistsSummary: "{name} · {date} · 対象{count}件",
    planExistsJournal: "このプランで実行済みのセッションは、記録に残ります。",
    planExistsEraseAction: "消去して作り直す",
    planExistsRunning: "このプランは実行中のため、ここでは消去できません。",
    planExistsDebrief:
      "このプランは振り返り待ちのため、ここでは消去できません。",
    planExistsConfirmTitle: "「{name}」を消去しますか？",
    planExistsConfirmLocal:
      "{date}のプランと対象{count}件をこの端末から消去します。実行済みのセッションは記録に残ります。",
    planExistsConfirmSync:
      "{date}のプランと対象{count}件をこの端末と他の端末から消去します。実行済みのセッションは記録に残ります。",
    planExistsConfirmAction: "このプランを消去",
    planExistsConfirmLabel: "プランを消去",
    planExistsNothingPlaced:
      "選択した対象は、どれもこの夜に配置できませんでした。",
    cancel: "キャンセル",
    plannerFlowClose: "閉じる",
  },
  de: {
    quickNightName: "Nacht am {date}",
    quickLaunchNightName: "Schnellstart am {date}",
    planExistsTitle: "Für heute Nacht besteht bereits ein Plan",
    planExistsIntro: "Ein Plan pro Nacht.",
    planExistsMergeTitle: "Mit dem Plan für heute Nacht zusammenführen",
    planExistsMergeBody:
      "Die markierten Ziele werden in die freie Zeit von „{name}“ ({free}) eingefügt; bereits platzierte Ziele bleiben unverändert.",
    planExistsMergePlace:
      "Ort dieses Plans: {place}; die Ziele werden für diesen Ort platziert.",
    planExistsMergeShort:
      "Nur {free} frei in der Nacht: Ein Ziel braucht mindestens {minimum}.",
    planExistsMergeAction: "Mit diesem Plan zusammenführen",
    planExistsEraseTitle: "Den Plan für heute Nacht löschen und neu beginnen",
    planExistsTitleNight: "Für die Nacht vom {date} besteht bereits ein Plan",
    planExistsMergeTitleNight:
      "Mit dem Plan für die Nacht vom {date} zusammenführen",
    planExistsEraseTitleNight:
      "Den Plan für die Nacht vom {date} löschen und neu beginnen",
    planCreatedOtherNight: "Der Plan für die Nacht vom {date} ist bereit.",
    planExistsSummary: "{name} · {date} · {count} Ziele",
    planExistsJournal:
      "Die mit diesem Plan bereits durchgeführten Sitzungen bleiben im Journal.",
    planExistsEraseAction: "Löschen und neu beginnen",
    planExistsRunning:
      "Dieser Plan wird gerade ausgeführt: Er kann hier nicht gelöscht werden.",
    planExistsDebrief:
      "Dieser Plan wartet auf die Nachbereitung: Er kann hier nicht gelöscht werden.",
    planExistsConfirmTitle: "„{name}“ löschen?",
    planExistsConfirmLocal:
      "Der Plan für {date} und seine {count} Ziele werden von diesem Gerät gelöscht. Die bereits durchgeführten Sitzungen bleiben im Journal.",
    planExistsConfirmSync:
      "Der Plan für {date} und seine {count} Ziele werden von diesem und deinen anderen Geräten gelöscht. Die bereits durchgeführten Sitzungen bleiben im Journal.",
    planExistsConfirmAction: "Diesen Plan löschen",
    planExistsConfirmLabel: "Plan löschen",
    planExistsNothingPlaced:
      "Keines der markierten Ziele konnte in dieser Nacht eingeplant werden.",
    cancel: "Abbrechen",
    plannerFlowClose: "Schließen",
  },
  es: {
    quickNightName: "Noche del {date}",
    quickLaunchNightName: "Inicio rápido del {date}",
    planExistsTitle: "Ya existe un plan para esta noche",
    planExistsIntro: "Un plan por noche.",
    planExistsMergeTitle: "Fusionar con el plan de esta noche",
    planExistsMergeBody:
      "Los objetivos marcados se añaden al tiempo libre de «{name}» ({free}); nada de lo ya colocado se mueve.",
    planExistsMergePlace:
      "Lugar de este plan: {place}; los objetivos se colocan para este lugar.",
    planExistsMergeShort:
      "Solo quedan {free} libres en la noche: un objetivo necesita al menos {minimum}.",
    planExistsMergeAction: "Fusionar con este plan",
    planExistsEraseTitle: "Borrar el plan de esta noche y empezar de nuevo",
    planExistsTitleNight: "Ya existe un plan para la noche del {date}",
    planExistsMergeTitleNight: "Fusionar con el plan de la noche del {date}",
    planExistsEraseTitleNight:
      "Borrar el plan de la noche del {date} y empezar de nuevo",
    planCreatedOtherNight: "El plan de la noche del {date} está listo.",
    planExistsSummary: "{name} · {date} · {count} objetivos",
    planExistsJournal:
      "Las sesiones ya hechas con este plan se conservan en el Diario.",
    planExistsEraseAction: "Borrar y empezar de nuevo",
    planExistsRunning:
      "Este plan está en ejecución: no se puede borrar desde aquí.",
    planExistsDebrief:
      "Este plan espera su revisión: no se puede borrar desde aquí.",
    planExistsConfirmTitle: "¿Borrar «{name}»?",
    planExistsConfirmLocal:
      "El plan del {date} y sus {count} objetivos se borran de este dispositivo. Las sesiones ya hechas se conservan en el Diario.",
    planExistsConfirmSync:
      "El plan del {date} y sus {count} objetivos se borran de este dispositivo y de tus otros dispositivos. Las sesiones ya hechas se conservan en el Diario.",
    planExistsConfirmAction: "Borrar este plan",
    planExistsConfirmLabel: "Borrar el plan",
    planExistsNothingPlaced:
      "Ninguno de los objetivos marcados pudo colocarse en esta noche.",
    cancel: "Cancelar",
    plannerFlowClose: "Cerrar",
  },
  it: {
    quickNightName: "Notte del {date}",
    quickLaunchNightName: "Avvio rapido del {date}",
    planExistsTitle: "Esiste già un piano per questa notte",
    planExistsIntro: "Un piano per notte.",
    planExistsMergeTitle: "Unire al piano di questa notte",
    planExistsMergeBody:
      "I target selezionati vanno nel tempo libero di «{name}» ({free}); quelli già posizionati non si spostano.",
    planExistsMergePlace:
      "Luogo di questo piano: {place}; i target sono posizionati per questo luogo.",
    planExistsMergeShort:
      "Restano solo {free} liberi nella notte: un target richiede almeno {minimum}.",
    planExistsMergeAction: "Unire a questo piano",
    planExistsEraseTitle: "Cancellare il piano di questa notte e ricominciare",
    planExistsTitleNight: "Esiste già un piano per la notte del {date}",
    planExistsMergeTitleNight: "Unire al piano della notte del {date}",
    planExistsEraseTitleNight:
      "Cancellare il piano della notte del {date} e ricominciare",
    planCreatedOtherNight: "Il piano della notte del {date} è pronto.",
    planExistsSummary: "{name} · {date} · {count} target",
    planExistsJournal:
      "Le sessioni già svolte con questo piano restano nel Diario.",
    planExistsEraseAction: "Cancellare e ricominciare",
    planExistsRunning:
      "Questo piano è in esecuzione: non può essere cancellato da qui.",
    planExistsDebrief:
      "Questo piano attende il debriefing: non può essere cancellato da qui.",
    planExistsConfirmTitle: "Cancellare «{name}»?",
    planExistsConfirmLocal:
      "Il piano del {date} e i suoi {count} target vengono cancellati da questo dispositivo. Le sessioni già svolte restano nel Diario.",
    planExistsConfirmSync:
      "Il piano del {date} e i suoi {count} target vengono cancellati da questo e dagli altri tuoi dispositivi. Le sessioni già svolte restano nel Diario.",
    planExistsConfirmAction: "Cancellare questo piano",
    planExistsConfirmLabel: "Cancellare il piano",
    planExistsNothingPlaced:
      "Nessuno dei target selezionati ha potuto essere collocato in questa notte.",
    cancel: "Annullare",
    plannerFlowClose: "Chiudere",
  },
  "pt-BR": {
    quickNightName: "Noite de {date}",
    quickLaunchNightName: "Início rápido de {date}",
    planExistsTitle: "Já existe um plano para esta noite",
    planExistsIntro: "Um plano por noite.",
    planExistsMergeTitle: "Mesclar com o plano desta noite",
    planExistsMergeBody:
      "Os alvos marcados entram no tempo livre de “{name}” ({free}); nada já posicionado se move.",
    planExistsMergePlace:
      "Local deste plano: {place}; os alvos são posicionados para este local.",
    planExistsMergeShort:
      "Restam apenas {free} livres na noite: um alvo precisa de pelo menos {minimum}.",
    planExistsMergeAction: "Mesclar com este plano",
    planExistsEraseTitle: "Apagar o plano desta noite e recomeçar",
    planExistsTitleNight: "Já existe um plano para a noite de {date}",
    planExistsMergeTitleNight: "Mesclar com o plano da noite de {date}",
    planExistsEraseTitleNight: "Apagar o plano da noite de {date} e recomeçar",
    planCreatedOtherNight: "O plano da noite de {date} está pronto.",
    planExistsSummary: "{name} · {date} · {count} alvos",
    planExistsJournal:
      "As sessões já feitas com este plano continuam no Diário.",
    planExistsEraseAction: "Apagar e recomeçar",
    planExistsRunning:
      "Este plano está em execução: não pode ser apagado aqui.",
    planExistsDebrief:
      "Este plano aguarda o balanço: não pode ser apagado aqui.",
    planExistsConfirmTitle: "Apagar “{name}”?",
    planExistsConfirmLocal:
      "O plano de {date} e seus {count} alvos são apagados deste dispositivo. As sessões já feitas continuam no Diário.",
    planExistsConfirmSync:
      "O plano de {date} e seus {count} alvos são apagados deste dispositivo e de seus outros dispositivos. As sessões já feitas continuam no Diário.",
    planExistsConfirmAction: "Apagar este plano",
    planExistsConfirmLabel: "Apagar o plano",
    planExistsNothingPlaced:
      "Nenhum dos alvos marcados pôde ser colocado nesta noite.",
    cancel: "Cancelar",
    plannerFlowClose: "Fechar",
  },
  "zh-Hans": {
    quickNightName: "{date}的夜晚",
    quickLaunchNightName: "{date}的快速开始",
    planExistsTitle: "今晚已有计划",
    planExistsIntro: "每晚只能有一个计划。",
    planExistsMergeTitle: "合并到今晚的计划",
    planExistsMergeBody:
      "勾选的目标会安排到“{name}”的空闲时间（{free}）；已安排的目标不会移动。",
    planExistsMergePlace: "此计划的地点：{place}；目标将按此地点安排。",
    planExistsMergeShort: "夜晚只剩{free}空闲时间：一个目标至少需要{minimum}。",
    planExistsMergeAction: "合并到此计划",
    planExistsEraseTitle: "删除今晚的计划并重新开始",
    planExistsTitleNight: "{date}夜间已有计划",
    planExistsMergeTitleNight: "合并到{date}夜间的计划",
    planExistsEraseTitleNight: "删除{date}夜间的计划并重新开始",
    planCreatedOtherNight: "{date}夜间的计划已就绪。",
    planExistsSummary: "{name} · {date} · {count}个目标",
    planExistsJournal: "用此计划完成的观测记录会保留在日志中。",
    planExistsEraseAction: "删除并重新开始",
    planExistsRunning: "此计划正在执行，无法在此删除。",
    planExistsDebrief: "此计划等待复盘，无法在此删除。",
    planExistsConfirmTitle: "删除“{name}”？",
    planExistsConfirmLocal:
      "{date}的计划及其{count}个目标将从此设备删除。已完成的观测记录会保留在日志中。",
    planExistsConfirmSync:
      "{date}的计划及其{count}个目标将从此设备及你的其他设备删除。已完成的观测记录会保留在日志中。",
    planExistsConfirmAction: "删除此计划",
    planExistsConfirmLabel: "删除计划",
    planExistsNothingPlaced: "勾选的目标都无法安排在这一夜。",
    cancel: "取消",
    plannerFlowClose: "关闭",
  },
  "zh-Hant": {
    quickNightName: "{date}的夜晚",
    quickLaunchNightName: "{date}的快速開始",
    planExistsTitle: "今晚已有計畫",
    planExistsIntro: "每晚只能有一個計畫。",
    planExistsMergeTitle: "合併到今晚的計畫",
    planExistsMergeBody:
      "勾選的目標會安排到「{name}」的空閒時間（{free}）；已安排的目標不會移動。",
    planExistsMergePlace: "此計畫的地點：{place}；目標將按此地點安排。",
    planExistsMergeShort: "夜晚只剩{free}空閒時間：一個目標至少需要{minimum}。",
    planExistsMergeAction: "合併到此計畫",
    planExistsEraseTitle: "刪除今晚的計畫並重新開始",
    planExistsTitleNight: "{date}夜間已有計畫",
    planExistsMergeTitleNight: "合併到{date}夜間的計畫",
    planExistsEraseTitleNight: "刪除{date}夜間的計畫並重新開始",
    planCreatedOtherNight: "{date}夜間的計畫已就緒。",
    planExistsSummary: "{name} · {date} · {count}個目標",
    planExistsJournal: "用此計畫完成的觀測記錄會保留在日誌中。",
    planExistsEraseAction: "刪除並重新開始",
    planExistsRunning: "此計畫正在執行，無法在此刪除。",
    planExistsDebrief: "此計畫等待回顧，無法在此刪除。",
    planExistsConfirmTitle: "刪除「{name}」？",
    planExistsConfirmLocal:
      "{date}的計畫及其{count}個目標將從此裝置刪除。已完成的觀測記錄會保留在日誌中。",
    planExistsConfirmSync:
      "{date}的計畫及其{count}個目標將從此裝置及你的其他裝置刪除。已完成的觀測記錄會保留在日誌中。",
    planExistsConfirmAction: "刪除此計畫",
    planExistsConfirmLabel: "刪除計畫",
    planExistsNothingPlaced: "勾選的目標都無法安排在這一夜。",
    cancel: "取消",
    plannerFlowClose: "關閉",
  },
  ru: {
    quickNightName: "Ночь {date}",
    quickLaunchNightName: "Быстрый запуск {date}",
    planExistsTitle: "На эту ночь уже есть план",
    planExistsIntro: "Один план на ночь.",
    planExistsMergeTitle: "Объединить с планом на эту ночь",
    planExistsMergeBody:
      "Отмеченные цели займут свободное время в «{name}» ({free}); уже размещённые цели не перемещаются.",
    planExistsMergePlace:
      "Место этого плана: {place}; цели размещаются для этого места.",
    planExistsMergeShort:
      "За ночь осталось только {free}: цели нужно не менее {minimum}.",
    planExistsMergeAction: "Объединить с этим планом",
    planExistsEraseTitle: "Стереть план на эту ночь и начать заново",
    planExistsTitleNight: "На ночь {date} уже есть план",
    planExistsMergeTitleNight: "Объединить с планом на ночь {date}",
    planExistsEraseTitleNight: "Стереть план на ночь {date} и начать заново",
    planCreatedOtherNight: "План на ночь {date} готов.",
    planExistsSummary: "{name} · {date} · {count} целей",
    planExistsJournal:
      "Сеансы, уже проведённые по этому плану, остаются в Журнале.",
    planExistsEraseAction: "Стереть и начать заново",
    planExistsRunning: "Этот план выполняется: его нельзя стереть отсюда.",
    planExistsDebrief:
      "Этот план ожидает подведения итогов: его нельзя стереть отсюда.",
    planExistsConfirmTitle: "Стереть «{name}»?",
    planExistsConfirmLocal:
      "План на {date} и его {count} целей удаляются с этого устройства. Уже проведённые сеансы остаются в Журнале.",
    planExistsConfirmSync:
      "План на {date} и его {count} целей удаляются с этого и других ваших устройств. Уже проведённые сеансы остаются в Журнале.",
    planExistsConfirmAction: "Стереть этот план",
    planExistsConfirmLabel: "Стереть план",
    planExistsNothingPlaced:
      "Ни одну из отмеченных целей не удалось разместить в эту ночь.",
    cancel: "Отмена",
    plannerFlowClose: "Закрыть",
  },
};
export const quickPlanCopy = (locale) =>
  copyFor(quickPlanMessages, locale, "quick-plan-messages.quickPlanMessages");
export function quickPlanMessage(locale, key, values = {}) {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    quickPlanCopy(locale)[key],
  );
}

/**
 * A plan's default name written in the language of the screen.
 *
 * A quick plan is named "Nuit du 18 octobre" when it is created and the name
 * is stored as text, so a plan made in French stays French when the language
 * changes. The stored name is left alone; only what is shown follows the
 * language: a name that is the default name of **any** shipped language for the
 * plan's own date reads as the default name of `locale`. A name the person
 * typed is never rewritten: the date part must carry the plan's own day.
 */
export function localizedPlanName(locale, name, date) {
  // The number added to keep two plans of a night apart ("Nuit du 22
  // octobre (2)") is kept: the default name is read without it, then
  // the number is put back.
  const numbered = /^(.*\S) \((\d+)\)$/.exec(String(name ?? "").trim());
  if (numbered) {
    const shown = localizedDefaultPlanName(locale, numbered[1], date);
    return shown === numbered[1] ? name : `${shown} (${numbered[2]})`;
  }
  return localizedDefaultPlanName(locale, name, date);
}

function localizedDefaultPlanName(locale, name, date) {
  const text = String(name ?? "");
  const day = new Date(`${date}T12:00:00Z`);
  const trimmed = text.trim();
  if (!trimmed || Number.isNaN(day.getTime())) return text;
  const dayNumber = new RegExp(`(?<![0-9])${day.getUTCDate()}(?![0-9])`);
  // The plan a quick launch becomes has its own default name.
  for (const key of ["quickNightName", "quickLaunchNightName"]) {
    for (const messages of Object.values(quickPlanMessages)) {
      const template = messages[key] ?? "";
      const at = template.indexOf("{date}");
      if (at < 0) continue;
      const head = template.slice(0, at);
      const tail = template.slice(at + "{date}".length);
      if (
        trimmed.length < head.length + tail.length ||
        !trimmed.startsWith(head) ||
        !trimmed.endsWith(tail)
      )
        continue;
      const middle = trimmed.slice(head.length, trimmed.length - tail.length);
      if (!dayNumber.test(middle)) continue;
      const monthDay = day.toLocaleDateString(locale, {
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      });
      return quickPlanMessage(locale, key, { date: monthDay });
    }
  }
  return text;
}
