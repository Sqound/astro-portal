// The words of attaching existing nights to a multi-night plan on the web.
// "Projet" is the internal name and is never shown: the observer reads "plan
// multi-nuits", "nuit", "rattacher" and "détacher". Merged into
// `MULTI_NIGHT_COPY` (`copy.js`) language by language, so `say(locale, key)`
// reads them with the others.
//
// A plural is `{ one, other, zero? }` (Russian: `one`, `few`, `many`).

const plural = (one, other, zero = null) => ({ one, other, zero });
const pluralRu = ({ one, few, many, zero = null }) => ({
  one,
  few,
  many,
  other: many,
  zero,
});

export const NIGHTS_COPY = {
  fr: {
    newBlank: "Un plan multi-nuits vierge",
    newBlankBody:
      "Vous choisissez la cible, le lieu et l’objectif d’heures ; les nuits viennent ensuite.",
    newFromExisting: "À partir de plans déjà existants",
    newFromExistingBody:
      "Vous regroupez des plans d’une nuit et des nuits du journal de la même cible.",
    newFromExistingDetail:
      "Rien n’est copié : les nuits sont rattachées au plan.",
    fromExistingIntro:
      "À partir de plans déjà existants : choisissez la cible, puis cochez les nuits à rattacher.",
    fromExistingNights: "Nuits à rattacher",
    fromExistingSummary:
      "{ticked} sur {total} nuits cochées. Les plans d’une nuit et les nuits du journal de cette cible sont montrés ensemble.",
    fromExistingSummaryAcquired:
      "{ticked} sur {total} nuits cochées · {acquired} intégrées par Astro Sync. Les plans d’une nuit et les nuits du journal de cette cible sont montrés ensemble.",
    tickAll: "Tout cocher",
    untickAll: "Tout décocher",
    noNightsForTarget: "Aucune nuit de cette cible.",
    noNightsBlankNote:
      "Le plan sera créé vierge ; vous y rattacherez des nuits du journal plus tard, depuis la page du plan.",
    nightInOtherPlan: "Déjà dans le plan multi-nuits « {name} »",
    nightSync: "Astro Sync · {duration}",
    nightNotRun: "Plan d’une nuit, pas encore exécuté",
    createWithNights: plural(
      "Créer le plan avec 1 nuit",
      "Créer le plan avec {count} nuits",
      "Créer le plan multi-nuits",
    ),
    stepBack: "Retour",
    addJournalNight: "Ajouter une nuit du journal",
    addSheetSub: "Nuits de {target} qui ne sont pas encore dans ce plan.",
    addSheetEmpty:
      "Aucune autre nuit de {target} dans votre journal : toutes sont déjà dans ce plan ou dans un autre plan multi-nuits.",
    addSheetEmptyNote: "Une nuit d’une autre cible ne peut pas y entrer.",
    addNights: plural(
      "Ajouter 1 nuit",
      "Ajouter {count} nuits",
      "Ajouter des nuits",
    ),
    nightsAdded: plural(
      "1 nuit ajoutée au plan.",
      "{count} nuits ajoutées au plan.",
    ),
    nightAttached: "Nuit rattachée au plan {name}.",
    nightDetached: "Nuit détachée du plan {name}.",
    undo: "Annuler",
    ownLink: "Rattachée à ce plan par elle-même",
    detachNight: "Détacher de ce plan",
    blockTitle: "Plan multi-nuits",
    blockNoneValue: "Aucun",
    blockAdds: "cette nuit ajoute {duration}",
    blockGoal: "objectif {duration}",
    attachNightSub: "{night}",
    attachPlansHeading: "Plans multi-nuits",
    attachNoPlans: "Aucun plan multi-nuits pour {targets}.",
    attachNoPlansAny: "Aucun plan multi-nuits pour l’instant.",
    attachNoTarget:
      "Cette nuit n’a pas de cible renseignée : ajoutez-la dans « Cibles » pour la rattacher à un plan multi-nuits.",
    createCardTitle: "Créer un plan multi-nuits",
    createCardBody: "Avec cette nuit dedans.",
    searchPlan: "Chercher un plan multi-nuits par cible ou par nom",
    searchNoResult: "Aucun plan multi-nuits ne correspond.",
    linkRefusedProjectGone:
      "Rattachement annulé : ce plan multi-nuits n’existe plus.",
    linkRefusedTargetMismatch:
      "Rattachement annulé : cette nuit n’a pas la cible de ce plan multi-nuits.",
    attachMismatch: "Cette nuit n’est pas de la cible de ce plan multi-nuits.",
    writeFailed: "Le service n’a pas pu enregistrer ce changement. Réessayez.",
    nightsReadFailed: "Impossible de lire vos nuits pour l’instant.",
    lockHeadline: "Vos nuits réunies en un plan multi-nuits",
  },
  en: {
    newBlank: "A blank multi-night plan",
    newBlankBody:
      "You choose the target, the place and the hours goal; the nights come later.",
    newFromExisting: "From plans that already exist",
    newFromExistingBody:
      "You group one-night plans and journal nights for the same target.",
    newFromExistingDetail:
      "Nothing is copied: the nights are attached to the plan.",
    fromExistingIntro:
      "From existing plans: choose the target, then tick the nights to attach.",
    fromExistingNights: "Nights to attach",
    fromExistingSummary:
      "{ticked} of {total} nights ticked. One-night plans and journal nights of this target are shown together.",
    fromExistingSummaryAcquired:
      "{ticked} of {total} nights ticked · {acquired} integrated by Astro Sync. One-night plans and journal nights of this target are shown together.",
    tickAll: "Tick all",
    untickAll: "Untick all",
    noNightsForTarget: "No night for this target.",
    noNightsBlankNote:
      "The plan will be created blank; you can attach journal nights later, from the plan’s page.",
    nightInOtherPlan: "Already in the multi-night plan “{name}”",
    nightSync: "Astro Sync · {duration}",
    nightNotRun: "One-night plan, not run yet",
    createWithNights: plural(
      "Create the plan with 1 night",
      "Create the plan with {count} nights",
      "Create the multi-night plan",
    ),
    stepBack: "Back",
    addJournalNight: "Add a night from the journal",
    addSheetSub: "Nights of {target} that are not yet in this plan.",
    addSheetEmpty:
      "No other night of {target} in your journal: all of them are already in this plan or in another multi-night plan.",
    addSheetEmptyNote: "A night of another target cannot be added.",
    addNights: plural("Add 1 night", "Add {count} nights", "Add nights"),
    nightsAdded: plural(
      "1 night added to the plan.",
      "{count} nights added to the plan.",
    ),
    nightAttached: "Night attached to the plan {name}.",
    nightDetached: "Night detached from the plan {name}.",
    undo: "Undo",
    ownLink: "Attached to this plan on its own",
    detachNight: "Detach from this plan",
    blockTitle: "Multi-night plan",
    blockNoneValue: "None",
    blockAdds: "this night adds {duration}",
    blockGoal: "goal {duration}",
    attachNightSub: "{night}",
    attachPlansHeading: "Multi-night plans",
    attachNoPlans: "No multi-night plan for {targets}.",
    attachNoPlansAny: "No multi-night plan yet.",
    attachNoTarget:
      "This night has no target recorded: add it in “Targets” to attach it to a multi-night plan.",
    createCardTitle: "Create a multi-night plan",
    createCardBody: "With this night in it.",
    searchPlan: "Search a multi-night plan by target or by name",
    searchNoResult: "No multi-night plan matches.",
    linkRefusedProjectGone:
      "Attachment cancelled: this multi-night plan no longer exists.",
    linkRefusedTargetMismatch:
      "Attachment cancelled: this night does not have the target of this multi-night plan.",
    attachMismatch: "This night is not of the target of this multi-night plan.",
    writeFailed: "The service could not save this change. Try again.",
    nightsReadFailed: "Your nights cannot be read right now.",
    lockHeadline: "Your nights brought together in a multi-night plan",
  },
  ja: {
    newBlank: "空の複数夜のプラン",
    newBlankBody: "天体・場所・目標時間を選びます。夜は後から加わります。",
    newFromExisting: "既存のプランから",
    newFromExistingBody: "同じ天体の1夜のプランと記録の夜をまとめます。",
    newFromExistingDetail: "コピーはされません。夜はプランに紐づけられます。",
    fromExistingIntro:
      "既存のプランから：天体を選び、紐づける夜にチェックを入れます。",
    fromExistingNights: "紐づける夜",
    fromExistingSummary:
      "{total}夜中{ticked}夜を選択。この天体の1夜のプランと記録の夜をまとめて表示します。",
    fromExistingSummaryAcquired:
      "{total}夜中{ticked}夜を選択 · Astro Sync で積算 {acquired}。この天体の1夜のプランと記録の夜をまとめて表示します。",
    tickAll: "すべて選択",
    untickAll: "すべて解除",
    noNightsForTarget: "この天体の夜はありません。",
    noNightsBlankNote:
      "プランは空で作成されます。記録の夜は後でプランのページから追加できます。",
    nightInOtherPlan: "すでに複数夜のプラン「{name}」に入っています",
    nightSync: "Astro Sync · {duration}",
    nightNotRun: "1夜のプラン（未実行）",
    createWithNights: plural(
      "1夜でプランを作成",
      "{count}夜でプランを作成",
      "複数夜のプランを作成",
    ),
    stepBack: "戻る",
    addJournalNight: "記録から夜を追加",
    addSheetSub: "このプランにまだ入っていない{target}の夜。",
    addSheetEmpty:
      "記録に{target}の他の夜はありません。すべてこのプランまたは別の複数夜のプランに入っています。",
    addSheetEmptyNote: "別の天体の夜は追加できません。",
    addNights: plural("1夜を追加", "{count}夜を追加", "夜を追加"),
    nightsAdded: plural(
      "1夜をプランに追加しました。",
      "{count}夜をプランに追加しました。",
    ),
    nightAttached: "夜をプラン{name}に紐づけました。",
    nightDetached: "夜をプラン{name}から外しました。",
    undo: "元に戻す",
    ownLink: "この夜自体がこのプランに紐づいています",
    detachNight: "このプランから外す",
    blockTitle: "複数夜のプラン",
    blockNoneValue: "なし",
    blockAdds: "この夜は{duration}を加えます",
    blockGoal: "目標 {duration}",
    attachNightSub: "{night}",
    attachPlansHeading: "複数夜のプラン",
    attachNoPlans: "{targets}の複数夜のプランはありません。",
    attachNoPlansAny: "複数夜のプランはまだありません。",
    attachNoTarget:
      "この夜には天体が記録されていません。「天体」で追加すると、複数夜のプランに紐づけられます。",
    createCardTitle: "複数夜のプランを作成",
    createCardBody: "この夜を含めて作成します。",
    searchPlan: "天体名またはプラン名で複数夜のプランを検索",
    searchNoResult: "一致する複数夜のプランはありません。",
    linkRefusedProjectGone:
      "紐づけを取り消しました。この複数夜のプランはもう存在しません。",
    linkRefusedTargetMismatch:
      "紐づけを取り消しました。この夜には、この複数夜のプランの天体がありません。",
    attachMismatch: "この夜は、この複数夜のプランの天体ではありません。",
    writeFailed:
      "サービスがこの変更を保存できませんでした。もう一度お試しください。",
    nightsReadFailed: "いまは夜を読み込めません。",
    lockHeadline: "夜を複数夜のプランにまとめる",
  },
  de: {
    newBlank: "Ein leerer Mehrnachtplan",
    newBlankBody:
      "Du wählst das Ziel, den Ort und die Zielvorgabe an Stunden; die Nächte kommen danach.",
    newFromExisting: "Aus bereits vorhandenen Plänen",
    newFromExistingBody:
      "Du fasst Pläne für eine Nacht und Nächte aus dem Journal desselben Ziels zusammen.",
    newFromExistingDetail:
      "Nichts wird kopiert: Die Nächte werden dem Plan zugeordnet.",
    fromExistingIntro:
      "Aus vorhandenen Plänen: Wähle das Ziel und hake die zuzuordnenden Nächte an.",
    fromExistingNights: "Zuzuordnende Nächte",
    fromExistingSummary:
      "{ticked} von {total} Nächten angehakt. Pläne für eine Nacht und Nächte aus dem Journal dieses Ziels werden zusammen angezeigt.",
    fromExistingSummaryAcquired:
      "{ticked} von {total} Nächten angehakt · {acquired} von Astro Sync integriert. Pläne für eine Nacht und Nächte aus dem Journal dieses Ziels werden zusammen angezeigt.",
    tickAll: "Alle anhaken",
    untickAll: "Alle abwählen",
    noNightsForTarget: "Keine Nacht für dieses Ziel.",
    noNightsBlankNote:
      "Der Plan wird leer angelegt; Nächte aus dem Journal ordnest du später auf der Seite des Plans zu.",
    nightInOtherPlan: "Bereits im Mehrnachtplan „{name}“",
    nightSync: "Astro Sync · {duration}",
    nightNotRun: "Plan für eine Nacht, noch nicht ausgeführt",
    createWithNights: plural(
      "Plan mit 1 Nacht erstellen",
      "Plan mit {count} Nächten erstellen",
      "Mehrnachtplan erstellen",
    ),
    stepBack: "Zurück",
    addJournalNight: "Eine Nacht aus dem Journal hinzufügen",
    addSheetSub: "Nächte von {target}, die noch nicht in diesem Plan sind.",
    addSheetEmpty:
      "Keine weitere Nacht von {target} in deinem Journal: Alle sind schon in diesem oder in einem anderen Mehrnachtplan.",
    addSheetEmptyNote:
      "Eine Nacht eines anderen Ziels kann nicht hinzugefügt werden.",
    addNights: plural(
      "1 Nacht hinzufügen",
      "{count} Nächte hinzufügen",
      "Nächte hinzufügen",
    ),
    nightsAdded: plural(
      "1 Nacht zum Plan hinzugefügt.",
      "{count} Nächte zum Plan hinzugefügt.",
    ),
    nightAttached: "Nacht dem Plan {name} zugeordnet.",
    nightDetached: "Nacht vom Plan {name} gelöst.",
    undo: "Rückgängig",
    ownLink: "Diesem Plan für sich zugeordnet",
    detachNight: "Von diesem Plan lösen",
    blockTitle: "Mehrnachtplan",
    blockNoneValue: "Keiner",
    blockAdds: "diese Nacht fügt {duration} hinzu",
    blockGoal: "Zielvorgabe {duration}",
    attachNightSub: "{night}",
    attachPlansHeading: "Mehrnachtpläne",
    attachNoPlans: "Kein Mehrnachtplan für {targets}.",
    attachNoPlansAny: "Noch kein Mehrnachtplan.",
    attachNoTarget:
      "Für diese Nacht ist kein Ziel eingetragen: Trage es unter „Ziele“ ein, um sie einem Mehrnachtplan zuzuordnen.",
    createCardTitle: "Einen Mehrnachtplan erstellen",
    createCardBody: "Mit dieser Nacht darin.",
    searchPlan: "Mehrnachtplan nach Ziel oder Name suchen",
    searchNoResult: "Kein Mehrnachtplan passt.",
    linkRefusedProjectGone:
      "Zuordnung abgebrochen: Dieser Mehrnachtplan existiert nicht mehr.",
    linkRefusedTargetMismatch:
      "Zuordnung abgebrochen: Diese Nacht hat nicht das Ziel dieses Mehrnachtplans.",
    attachMismatch: "Diese Nacht gehört nicht zum Ziel dieses Mehrnachtplans.",
    writeFailed:
      "Der Dienst konnte diese Änderung nicht speichern. Versuche es erneut.",
    nightsReadFailed: "Deine Nächte können gerade nicht gelesen werden.",
    lockHeadline: "Deine Nächte in einem Mehrnachtplan vereint",
  },
  es: {
    newBlank: "Un plan de varias noches en blanco",
    newBlankBody:
      "Usted elige el objetivo, el lugar y la meta de horas; las noches vienen después.",
    newFromExisting: "A partir de planes que ya existen",
    newFromExistingBody:
      "Usted agrupa planes de una noche y noches del diario del mismo objetivo.",
    newFromExistingDetail: "No se copia nada: las noches se vinculan al plan.",
    fromExistingIntro:
      "A partir de planes existentes: elige el objetivo y marca las noches que quieres vincular.",
    fromExistingNights: "Noches por vincular",
    fromExistingSummary:
      "{ticked} de {total} noches marcadas. Se muestran juntos los planes de una noche y las noches del diario de este objetivo.",
    fromExistingSummaryAcquired:
      "{ticked} de {total} noches marcadas · {acquired} integradas por Astro Sync. Se muestran juntos los planes de una noche y las noches del diario de este objetivo.",
    tickAll: "Marcar todas",
    untickAll: "Desmarcar todas",
    noNightsForTarget: "Ninguna noche de este objetivo.",
    noNightsBlankNote:
      "El plan se creará en blanco; vincularás noches del diario más tarde, desde la página del plan.",
    nightInOtherPlan: "Ya está en el plan de varias noches «{name}»",
    nightSync: "Astro Sync · {duration}",
    nightNotRun: "Plan de una noche, aún no ejecutado",
    createWithNights: plural(
      "Crear el plan con 1 noche",
      "Crear el plan con {count} noches",
      "Crear el plan de varias noches",
    ),
    stepBack: "Volver",
    addJournalNight: "Añadir una noche del diario",
    addSheetSub: "Noches de {target} que aún no están en este plan.",
    addSheetEmpty:
      "No hay otra noche de {target} en tu diario: todas están ya en este plan o en otro plan de varias noches.",
    addSheetEmptyNote: "Una noche de otro objetivo no puede añadirse.",
    addNights: plural(
      "Añadir 1 noche",
      "Añadir {count} noches",
      "Añadir noches",
    ),
    nightsAdded: plural(
      "1 noche añadida al plan.",
      "{count} noches añadidas al plan.",
    ),
    nightAttached: "Noche vinculada al plan {name}.",
    nightDetached: "Noche desvinculada del plan {name}.",
    undo: "Deshacer",
    ownLink: "Vinculada a este plan por sí misma",
    detachNight: "Desasociar de este plan",
    blockTitle: "Plan de varias noches",
    blockNoneValue: "Ninguno",
    blockAdds: "esta noche añade {duration}",
    blockGoal: "meta {duration}",
    attachNightSub: "{night}",
    attachPlansHeading: "Planes de varias noches",
    attachNoPlans: "Ningún plan de varias noches para {targets}.",
    attachNoPlansAny: "Aún no hay ningún plan de varias noches.",
    attachNoTarget:
      "Esta noche no tiene objetivo registrado: agrégalo en «Objetivos» para vincularla a un plan de varias noches.",
    createCardTitle: "Crear un plan de varias noches",
    createCardBody: "Con esta noche dentro.",
    searchPlan: "Buscar un plan de varias noches por objetivo o por nombre",
    searchNoResult: "Ningún plan de varias noches coincide.",
    linkRefusedProjectGone:
      "Vinculación cancelada: este plan de varias noches ya no existe.",
    linkRefusedTargetMismatch:
      "Vinculación cancelada: esta noche no tiene el objetivo de este plan de varias noches.",
    attachMismatch:
      "Esta noche no es del objetivo de este plan de varias noches.",
    writeFailed: "El servicio no pudo guardar este cambio. Inténtalo de nuevo.",
    nightsReadFailed: "No se pueden leer tus noches por ahora.",
    lockHeadline: "Tus noches reunidas en un plan de varias noches",
  },
  it: {
    newBlank: "Un piano su più notti vuoto",
    newBlankBody:
      "Scegli il target, il luogo e l’obiettivo di ore; le notti arrivano dopo.",
    newFromExisting: "A partire da piani già esistenti",
    newFromExistingBody:
      "Raggruppa piani di una notte e notti del diario dello stesso target.",
    newFromExistingDetail:
      "Nulla viene copiato: le notti sono collegate al piano.",
    fromExistingIntro:
      "A partire da piani esistenti: scegli il target, poi spunta le notti da collegare.",
    fromExistingNights: "Notti da collegare",
    fromExistingSummary:
      "{ticked} notti su {total} spuntate. I piani di una notte e le notti del diario di questo target sono mostrati insieme.",
    fromExistingSummaryAcquired:
      "{ticked} notti su {total} spuntate · {acquired} integrate da Astro Sync. I piani di una notte e le notti del diario di questo target sono mostrati insieme.",
    tickAll: "Spunta tutte",
    untickAll: "Deseleziona tutte",
    noNightsForTarget: "Nessuna notte di questo target.",
    noNightsBlankNote:
      "Il piano sarà creato vuoto; le notti del diario le collegherai più tardi, dalla pagina del piano.",
    nightInOtherPlan: "Già nel piano su più notti «{name}»",
    nightSync: "Astro Sync · {duration}",
    nightNotRun: "Piano di una notte, non ancora eseguito",
    createWithNights: plural(
      "Creare il piano con 1 notte",
      "Creare il piano con {count} notti",
      "Creare il piano su più notti",
    ),
    stepBack: "Indietro",
    addJournalNight: "Aggiungere una notte dal diario",
    addSheetSub: "Notti di {target} non ancora in questo piano.",
    addSheetEmpty:
      "Nessun’altra notte di {target} nel diario: tutte sono già in questo piano o in un altro piano su più notti.",
    addSheetEmptyNote: "Una notte di un altro target non può essere aggiunta.",
    addNights: plural(
      "Aggiungere 1 notte",
      "Aggiungere {count} notti",
      "Aggiungere notti",
    ),
    nightsAdded: plural(
      "1 notte aggiunta al piano.",
      "{count} notti aggiunte al piano.",
    ),
    nightAttached: "Notte collegata al piano {name}.",
    nightDetached: "Notte scollegata dal piano {name}.",
    undo: "Annulla",
    ownLink: "Collegata a questo piano da sola",
    detachNight: "Scollegare da questo piano",
    blockTitle: "Piano su più notti",
    blockNoneValue: "Nessuno",
    blockAdds: "questa notte aggiunge {duration}",
    blockGoal: "obiettivo {duration}",
    attachNightSub: "{night}",
    attachPlansHeading: "Piani su più notti",
    attachNoPlans: "Nessun piano su più notti per {targets}.",
    attachNoPlansAny: "Ancora nessun piano su più notti.",
    attachNoTarget:
      "Questa notte non ha un target registrato: aggiungilo in «Target» per collegarla a un piano su più notti.",
    createCardTitle: "Creare un piano su più notti",
    createCardBody: "Con questa notte dentro.",
    searchPlan: "Cercare un piano su più notti per target o per nome",
    searchNoResult: "Nessun piano su più notti corrisponde.",
    linkRefusedProjectGone:
      "Collegamento annullato: questo piano su più notti non esiste più.",
    linkRefusedTargetMismatch:
      "Collegamento annullato: questa notte non ha il target di questo piano su più notti.",
    attachMismatch:
      "Questa notte non è del target di questo piano su più notti.",
    writeFailed: "Il servizio non ha potuto salvare questa modifica. Riprova.",
    nightsReadFailed: "Al momento non è possibile leggere le notti.",
    lockHeadline: "Le notti riunite in un piano su più notti",
  },
  "pt-BR": {
    newBlank: "Um plano de várias noites em branco",
    newBlankBody:
      "Você escolhe o alvo, o local e a meta de horas; as noites vêm depois.",
    newFromExisting: "A partir de planos já existentes",
    newFromExistingBody:
      "Você agrupa planos de uma noite e noites do diário do mesmo alvo.",
    newFromExistingDetail: "Nada é copiado: as noites são associadas ao plano.",
    fromExistingIntro:
      "A partir de planos existentes: escolha o alvo e marque as noites a associar.",
    fromExistingNights: "Noites a associar",
    fromExistingSummary:
      "{ticked} de {total} noites marcadas. Os planos de uma noite e as noites do diário deste alvo são mostrados juntos.",
    fromExistingSummaryAcquired:
      "{ticked} de {total} noites marcadas · {acquired} integradas pelo Astro Sync. Os planos de uma noite e as noites do diário deste alvo são mostrados juntos.",
    tickAll: "Marcar todas",
    untickAll: "Desmarcar todas",
    noNightsForTarget: "Nenhuma noite deste alvo.",
    noNightsBlankNote:
      "O plano será criado em branco; você associará noites do diário depois, pela página do plano.",
    nightInOtherPlan: "Já está no plano de várias noites “{name}”",
    nightSync: "Astro Sync · {duration}",
    nightNotRun: "Plano de uma noite, ainda não executado",
    createWithNights: plural(
      "Criar o plano com 1 noite",
      "Criar o plano com {count} noites",
      "Criar o plano de várias noites",
    ),
    stepBack: "Voltar",
    addJournalNight: "Adicionar uma noite do diário",
    addSheetSub: "Noites de {target} que ainda não estão neste plano.",
    addSheetEmpty:
      "Nenhuma outra noite de {target} no seu diário: todas já estão neste plano ou em outro plano de várias noites.",
    addSheetEmptyNote: "Uma noite de outro alvo não pode ser adicionada.",
    addNights: plural(
      "Adicionar 1 noite",
      "Adicionar {count} noites",
      "Adicionar noites",
    ),
    nightsAdded: plural(
      "1 noite adicionada ao plano.",
      "{count} noites adicionadas ao plano.",
    ),
    nightAttached: "Noite associada ao plano {name}.",
    nightDetached: "Noite desassociada do plano {name}.",
    undo: "Desfazer",
    ownLink: "Associada a este plano por si mesma",
    detachNight: "Desassociar deste plano",
    blockTitle: "Plano de várias noites",
    blockNoneValue: "Nenhum",
    blockAdds: "esta noite soma {duration}",
    blockGoal: "meta {duration}",
    attachNightSub: "{night}",
    attachPlansHeading: "Planos de várias noites",
    attachNoPlans: "Nenhum plano de várias noites para {targets}.",
    attachNoPlansAny: "Ainda não há plano de várias noites.",
    attachNoTarget:
      "Esta noite não tem alvo registrado: adicione-o em “Alvos” para associá-la a um plano de várias noites.",
    createCardTitle: "Criar um plano de várias noites",
    createCardBody: "Com esta noite dentro.",
    searchPlan: "Buscar um plano de várias noites por alvo ou por nome",
    searchNoResult: "Nenhum plano de várias noites corresponde.",
    linkRefusedProjectGone:
      "Associação cancelada: este plano de várias noites não existe mais.",
    linkRefusedTargetMismatch:
      "Associação cancelada: esta noite não tem o alvo deste plano de várias noites.",
    attachMismatch: "Esta noite não é do alvo deste plano de várias noites.",
    writeFailed:
      "O serviço não conseguiu salvar esta alteração. Tente novamente.",
    nightsReadFailed: "Não é possível ler suas noites agora.",
    lockHeadline: "Suas noites reunidas em um plano de várias noites",
  },
  "zh-Hans": {
    newBlank: "空白的多夜计划",
    newBlankBody: "你选择目标、地点和累计小时数目标；夜晚稍后再加入。",
    newFromExisting: "基于已有的计划",
    newFromExistingBody: "你将同一目标的单夜计划和日志中的夜晚归入同一个计划。",
    newFromExistingDetail: "不会复制任何内容：夜晚会关联到该计划。",
    fromExistingIntro: "基于已有的计划：先选择目标，再勾选要关联的夜晚。",
    fromExistingNights: "要关联的夜晚",
    fromExistingSummary:
      "已勾选 {ticked}/{total} 夜。此目标的单夜计划和日志中的夜晚一并显示。",
    fromExistingSummaryAcquired:
      "已勾选 {ticked}/{total} 夜 · Astro Sync 已积分 {acquired}。此目标的单夜计划和日志中的夜晚一并显示。",
    tickAll: "全选",
    untickAll: "全部取消",
    noNightsForTarget: "此目标没有夜晚。",
    noNightsBlankNote: "将创建空白计划；之后可在计划页面关联日志中的夜晚。",
    nightInOtherPlan: "已在多夜计划“{name}”中",
    nightSync: "Astro Sync · {duration}",
    nightNotRun: "单夜计划，尚未执行",
    createWithNights: plural(
      "用1夜创建计划",
      "用{count}夜创建计划",
      "创建多夜计划",
    ),
    stepBack: "返回",
    addJournalNight: "添加日志中的一夜",
    addSheetSub: "{target} 尚未加入此计划的夜晚。",
    addSheetEmpty:
      "日志中没有 {target} 的其他夜晚：它们都已在此计划或其他多夜计划中。",
    addSheetEmptyNote: "其他目标的夜晚无法加入。",
    addNights: plural("添加1夜", "添加{count}夜", "添加夜晚"),
    nightsAdded: plural("已将1夜加入计划。", "已将{count}夜加入计划。"),
    nightAttached: "已将此夜关联到计划 {name}。",
    nightDetached: "已将此夜从计划 {name} 中取消关联。",
    undo: "撤销",
    ownLink: "此夜单独关联到本计划",
    detachNight: "从此计划中取消关联",
    blockTitle: "多夜计划",
    blockNoneValue: "无",
    blockAdds: "此夜增加 {duration}",
    blockGoal: "目标 {duration}",
    attachNightSub: "{night}",
    attachPlansHeading: "多夜计划",
    attachNoPlans: "没有适用于 {targets} 的多夜计划。",
    attachNoPlansAny: "暂时没有多夜计划。",
    attachNoTarget: "此夜未记录目标：请先在“目标”中添加，才能关联到多夜计划。",
    createCardTitle: "创建多夜计划",
    createCardBody: "包含此夜。",
    searchPlan: "按目标或名称搜索多夜计划",
    searchNoResult: "没有匹配的多夜计划。",
    linkRefusedProjectGone: "已取消关联：该多夜计划已不存在。",
    linkRefusedTargetMismatch: "已取消关联：此夜没有该多夜计划的目标。",
    attachMismatch: "此夜不属于该多夜计划的目标。",
    writeFailed: "服务无法保存此更改。请重试。",
    nightsReadFailed: "暂时无法读取你的夜晚。",
    lockHeadline: "将你的夜晚汇集到一个多夜计划",
  },
  "zh-Hant": {
    newBlank: "空白的多夜計畫",
    newBlankBody: "你選擇目標、地點與累計時數目標；夜晚稍後再加入。",
    newFromExisting: "根據既有的計畫",
    newFromExistingBody: "你將同一目標的單夜計畫與日誌中的夜晚歸入同一個計畫。",
    newFromExistingDetail: "不會複製任何內容：夜晚會關聯到該計畫。",
    fromExistingIntro: "根據既有的計畫：先選擇目標，再勾選要關聯的夜晚。",
    fromExistingNights: "要關聯的夜晚",
    fromExistingSummary:
      "已勾選 {ticked}/{total} 夜。此目標的單夜計畫與日誌中的夜晚一併顯示。",
    fromExistingSummaryAcquired:
      "已勾選 {ticked}/{total} 夜 · Astro Sync 已積分 {acquired}。此目標的單夜計畫與日誌中的夜晚一併顯示。",
    tickAll: "全選",
    untickAll: "全部取消",
    noNightsForTarget: "此目標沒有夜晚。",
    noNightsBlankNote: "將建立空白計畫；之後可在計畫頁面關聯日誌中的夜晚。",
    nightInOtherPlan: "已在多夜計畫「{name}」中",
    nightSync: "Astro Sync · {duration}",
    nightNotRun: "單夜計畫，尚未執行",
    createWithNights: plural(
      "以1夜建立計畫",
      "以{count}夜建立計畫",
      "建立多夜計畫",
    ),
    stepBack: "返回",
    addJournalNight: "新增日誌中的一夜",
    addSheetSub: "{target} 尚未加入此計畫的夜晚。",
    addSheetEmpty:
      "日誌中沒有 {target} 的其他夜晚：它們都已在此計畫或其他多夜計畫中。",
    addSheetEmptyNote: "其他目標的夜晚無法加入。",
    addNights: plural("新增1夜", "新增{count}夜", "新增夜晚"),
    nightsAdded: plural("已將1夜加入計畫。", "已將{count}夜加入計畫。"),
    nightAttached: "已將此夜關聯到計畫 {name}。",
    nightDetached: "已將此夜從計畫 {name} 取消關聯。",
    undo: "復原",
    ownLink: "此夜單獨關聯到本計畫",
    detachNight: "從此計畫取消關聯",
    blockTitle: "多夜計畫",
    blockNoneValue: "無",
    blockAdds: "此夜增加 {duration}",
    blockGoal: "目標 {duration}",
    attachNightSub: "{night}",
    attachPlansHeading: "多夜計畫",
    attachNoPlans: "沒有適用於 {targets} 的多夜計畫。",
    attachNoPlansAny: "目前沒有多夜計畫。",
    attachNoTarget:
      "此夜未記錄目標：請先在「目標」中新增，才能關聯到多夜計畫。",
    createCardTitle: "建立多夜計畫",
    createCardBody: "包含此夜。",
    searchPlan: "依目標或名稱搜尋多夜計畫",
    searchNoResult: "沒有符合的多夜計畫。",
    linkRefusedProjectGone: "已取消關聯：該多夜計畫已不存在。",
    linkRefusedTargetMismatch: "已取消關聯：此夜沒有該多夜計畫的目標。",
    attachMismatch: "此夜不屬於該多夜計畫的目標。",
    writeFailed: "服務無法儲存此變更。請再試一次。",
    nightsReadFailed: "目前無法讀取你的夜晚。",
    lockHeadline: "將你的夜晚彙整到一個多夜計畫",
  },
  ru: {
    newBlank: "Пустой план на несколько ночей",
    newBlankBody:
      "Вы выбираете цель, место и цель по часам; ночи добавятся позже.",
    newFromExisting: "На основе уже существующих планов",
    newFromExistingBody:
      "Вы объединяете планы на одну ночь и ночи из журнала по одной цели.",
    newFromExistingDetail: "Ничего не копируется: ночи прикрепляются к плану.",
    fromExistingIntro:
      "На основе существующих планов: выберите цель, затем отметьте ночи для прикрепления.",
    fromExistingNights: "Ночи для прикрепления",
    fromExistingSummary:
      "Отмечено ночей: {ticked} из {total}. Планы на одну ночь и ночи из журнала по этой цели показаны вместе.",
    fromExistingSummaryAcquired:
      "Отмечено ночей: {ticked} из {total} · накоплено в Astro Sync: {acquired}. Планы на одну ночь и ночи из журнала по этой цели показаны вместе.",
    tickAll: "Отметить все",
    untickAll: "Снять все",
    noNightsForTarget: "Нет ночей по этой цели.",
    noNightsBlankNote:
      "План будет создан пустым; ночи из журнала вы прикрепите позже со страницы плана.",
    nightInOtherPlan: "Уже в плане на несколько ночей «{name}»",
    nightSync: "Astro Sync · {duration}",
    nightNotRun: "План на одну ночь, ещё не выполнен",
    createWithNights: pluralRu({
      one: "Создать план с {count} ночью",
      few: "Создать план с {count} ночами",
      many: "Создать план с {count} ночами",
      zero: "Создать план на несколько ночей",
    }),
    stepBack: "Назад",
    addJournalNight: "Добавить ночь из журнала",
    addSheetSub: "Ночи по цели {target}, которых ещё нет в этом плане.",
    addSheetEmpty:
      "В журнале нет других ночей по цели {target}: все они уже в этом плане или в другом плане на несколько ночей.",
    addSheetEmptyNote: "Ночь по другой цели добавить нельзя.",
    addNights: pluralRu({
      one: "Добавить {count} ночь",
      few: "Добавить {count} ночи",
      many: "Добавить ночей: {count}",
      zero: "Добавить ночи",
    }),
    nightsAdded: pluralRu({
      one: "{count} ночь добавлена в план.",
      few: "{count} ночи добавлены в план.",
      many: "Ночей добавлено в план: {count}.",
    }),
    nightAttached: "Ночь прикреплена к плану {name}.",
    nightDetached: "Ночь откреплена от плана {name}.",
    undo: "Отменить",
    ownLink: "Прикреплена к этому плану сама по себе",
    detachNight: "Отвязать от этого плана",
    blockTitle: "План на несколько ночей",
    blockNoneValue: "Нет",
    blockAdds: "эта ночь добавляет {duration}",
    blockGoal: "цель {duration}",
    attachNightSub: "{night}",
    attachPlansHeading: "Планы на несколько ночей",
    attachNoPlans: "Нет плана на несколько ночей для {targets}.",
    attachNoPlansAny: "Планов на несколько ночей пока нет.",
    attachNoTarget:
      "У этой ночи не указана цель: добавьте её в «Цели», чтобы прикрепить ночь к плану на несколько ночей.",
    createCardTitle: "Создать план на несколько ночей",
    createCardBody: "С этой ночью внутри.",
    searchPlan: "Найти план на несколько ночей по цели или названию",
    searchNoResult: "Подходящих планов на несколько ночей нет.",
    linkRefusedProjectGone:
      "Привязка отменена: этого плана на несколько ночей больше нет.",
    linkRefusedTargetMismatch:
      "Привязка отменена: у этой ночи нет цели этого плана на несколько ночей.",
    attachMismatch:
      "Эта ночь относится не к цели этого плана на несколько ночей.",
    writeFailed: "Сервис не смог сохранить это изменение. Повторите попытку.",
    nightsReadFailed: "Сейчас не удаётся прочитать ваши ночи.",
    lockHeadline: "Ваши ночи, собранные в план на несколько ночей",
  },
};
