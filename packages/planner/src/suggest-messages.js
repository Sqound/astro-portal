// Shared suggestion copy.
import { copyFor } from "portal/locales.js";
export const suggestionMessages = {
  en: {
    suggestAction: "Suggest the best targets",
    suggestTitle: "Suggested targets",
    suggestContext: "{place} · night of {date}",
    suggestPhotoMode: "Photo mode, as in the plan",
    suggestVisualMode: "Visual mode, as in the plan",
    suggestChange: "Change",
    suggestChangeHint: "Change place or equipment",
    suggestHowMany: "How many targets?",
    suggestCountLabel: "Number of targets",
    suggestAll: "All night",
    suggestOther: "Other",
    suggestCustom: "How many?",
    suggestLess: "One fewer target",
    suggestMore: "One more target",
    suggestEstimatePhoto:
      "{count, plural, one{About {count} slot of {duration}.} other{About {count} slots of {duration}.}}",
    suggestEstimateVisual:
      "{count, plural, one{About {count} slot of 20 min.} other{About {count} slots of 20 min.}}",
    suggestEstimateHint: "How the number is estimated",
    suggestEstimateDetailPhoto:
      "{free} free in the night, about {duration} per target.",
    suggestEstimateDetailVisual:
      "{free} free during the night, 20 min per target.",
    suggestPlacement: "Placement",
    suggestPlacementLabel: "Placement of the targets",
    suggestPlacementIdeal: "Ideal",
    suggestPlacementChained: "Close together",
    suggestPlacementIdealHelp: "Each target at its best moment.",
    suggestPlacementChainedHelp: "Each target follows the one before.",
    suggestPlacementHint: "How the targets are placed",
    suggestPlacementDetail:
      "Ideal: each target is placed where it is best positioned, even if that means waiting between two. Close together: the targets follow one another from the first slot; each time, the best-rated visible target comes next, and the wait between two targets never exceeds 10 min. If none can follow, the list stops there.",
    suggestShortfall: "{requested} requested, {placed} fit in the night",
    suggestSearching: "Looking for {count} targets…",
    suggestSearchingOne: "Looking for 1 target…",
    suggestWhy: "Why not {count}",
    suggestAfterDew: "After {time}, likely dew: nothing satisfactory remains.",
    suggestAfterClouds: "After {time}, clouds: nothing satisfactory remains.",
    suggestAfterMoon: "After {time}, Moon up: nothing satisfactory remains.",
    suggestAfterNoFollower:
      "After {time}, no target follows the previous one within {minutes} min.",
    suggestNoAltitude: "No other target above the minimum altitude.",
    suggestTooShort: "The remaining free time is too short for a target.",
    suggestExhausted: "No other target to suggest tonight.",
    suggestContinue: "To continue",
    suggestNightOrder: "In night order",
    suggestProgress: "{acquired} of {goal} · multi-night plan {name}",
    suggestExcludeCaptured: "Exclude targets already done",
    suggestComfort: "Comfort",
    suggestComfortAny: "No restriction",
    suggestComfortEasy: "Comfortable viewing",
    suggestComfortLabel: "Viewing comfort",
    suggestComfortRefractor:
      "Refractor: above {max}°, the eyepiece becomes hard to reach.",
    suggestComfortRearEyepiece:
      "Eyepiece at the back: above {max}°, it becomes hard to reach.",
    suggestComfortNewtonianAltaz:
      "Newtonian on a Dobsonian: below {min}°, the eyepiece is too low.",
    suggestComfortNewtonianEquatorial:
      "Newtonian on an equatorial mount: the eyepiece stays easy to reach from {min}° to {max}°.",
    suggestComfortBinoculars:
      "Binoculars: above {max}°, your neck tires quickly.",
    suggestCapturedPhoto: "{name}, captured on {date}, is left out.",
    suggestCapturedVisual: "{name}, observed on {date}, is left out.",
    suggestCapturedManyPhoto: "{count} targets already captured are left out.",
    suggestCapturedManyVisual: "{count} targets already observed are left out.",
    suggestPreviousPhotoWorse:
      "{name}, captured on {date} under a worse sky than tonight.",
    suggestPreviousPhotoSame:
      "{name}, captured on {date} under a sky comparable to tonight’s.",
    suggestPreviousPhotoBetter:
      "{name}, captured on {date} under a better sky than tonight.",
    suggestPreviousPhotoDate: "{name}, captured on {date}.",
    suggestAlreadyInPlan:
      "Already in this plan: it is added once more to the timeline.",
    suggestPreviousVisualWorse:
      "{name}, observed on {date} under a worse sky than tonight.",
    suggestPreviousVisualSame:
      "{name}, observed on {date} under a sky comparable to tonight’s.",
    suggestPreviousVisualBetter:
      "{name}, observed on {date} under a better sky than tonight.",
    suggestPreviousVisualDate: "{name}, observed on {date}.",
    suggestPosition: "Suggestions {from} to {to}",
    suggestRank: "{rank}",
    suggestLower: "Lower score: suggestions {from} to {to}",
    suggestOthers: "More suggestions",
    suggestBest: "Back to the best",
    suggestReplacement:
      "Ticked targets stay; the others are replaced by the next in the ranking.",
    suggestAllTicked: "All are ticked: untick a target to replace it.",
    suggestApply: "Add {count} targets to the plan",
    suggestApplyOne: "Add 1 target to the plan",
    suggestNightEnding:
      "The night ends in {duration}: not enough for a target.",
    suggestNightShort:
      "This night lasts only {duration}: not enough for a target.",
    suggestNextNight: "Suggest for the night of {date}",
    suggestPlanFull: "The free time of the night is already taken.",
    suggestPlanFullDetail:
      "A target needs at least {minimum}. Remove or move a target of a plan to free some.",
    suggestOpenPlan: "Open the plan",
    suggestOpenPlans: "See the night's plans",
    suggestNoTarget: "No target suits this night.",
    suggestNoTargetDetail:
      "The Moon, the horizon or the minimum altitude leave no target visible for long enough.",
    suggestTakenByOtherPlans: "The other plans have taken every target.",
    suggestTakenByOtherPlansDetail:
      "A target already in another plan of this night, of the same kind (photo or visual), is not offered a second time. Remove it from that plan to offer it here.",
    suggestTimelineLabel: "Ticked targets placed across the night: {items}.",
    suggestUnticked: "{name} unticked",
    suggestFree: "free from {from} to {to}",
    suggestPlaceEquipment: "Place and equipment",
    autoFillLater: "You can change everything afterwards.",
    autoFillCancel: "Cancel",
    autoFillClose: "Close",
    autoFillLegendFree: "free",
  },
  fr: {
    suggestAction: "Suggérer les meilleures cibles",
    suggestTitle: "Cibles suggérées",
    suggestContext: "{place} · nuit du {date}",
    suggestPhotoMode: "Mode photo, celui du plan",
    suggestVisualMode: "Mode visuel, celui du plan",
    suggestChange: "Changer",
    suggestChangeHint: "Changer de lieu ou de matériel",
    suggestHowMany: "Combien de cibles ?",
    suggestCountLabel: "Nombre de cibles",
    suggestAll: "Toute la nuit",
    suggestOther: "Autre",
    suggestCustom: "Combien ?",
    suggestLess: "Une cible de moins",
    suggestMore: "Une cible de plus",
    suggestEstimatePhoto:
      "{count, plural, one{Environ {count} créneau de {duration}.} other{Environ {count} créneaux de {duration}.}}",
    suggestEstimateVisual:
      "{count, plural, one{Environ {count} créneau de 20 min.} other{Environ {count} créneaux de 20 min.}}",
    suggestEstimateHint: "Comment le nombre est estimé",
    suggestEstimateDetailPhoto:
      "{free} libres dans la nuit, environ {duration} par cible.",
    suggestEstimateDetailVisual:
      "{free} libres dans la nuit, 20 min par cible.",
    suggestPlacement: "Placement",
    suggestPlacementLabel: "Placement des cibles",
    suggestPlacementIdeal: "Idéal",
    suggestPlacementChained: "Rapproché",
    suggestPlacementIdealHelp: "Chaque cible à son meilleur moment.",
    suggestPlacementChainedHelp: "Chaque cible suit la précédente.",
    suggestPlacementHint: "Comment les cibles sont placées",
    suggestPlacementDetail:
      "Idéal : chaque cible est placée là où elle est la mieux placée, quitte à attendre entre deux. Rapproché : les cibles se suivent dès le premier créneau ; chaque fois, la mieux notée des cibles visibles prend la suite, et l’attente entre deux cibles ne dépasse jamais 10 min. Si aucune ne peut suivre, la liste s’arrête là.",
    suggestShortfall: "{requested} demandées, {placed} tiennent dans la nuit",
    suggestSearching: "Recherche de {count} cibles…",
    suggestSearchingOne: "Recherche de 1 cible…",
    suggestWhy: "Pourquoi pas {count}",
    suggestAfterDew:
      "Après {time}, rosée probable : rien de satisfaisant ne reste.",
    suggestAfterClouds: "Après {time}, nuages : rien de satisfaisant ne reste.",
    suggestAfterMoon:
      "Après {time}, Lune levée : rien de satisfaisant ne reste.",
    suggestAfterNoFollower:
      "Après {time}, aucune cible ne suit la précédente à moins de {minutes} min.",
    suggestNoAltitude: "Aucune autre cible au-dessus de la hauteur minimale.",
    suggestTooShort: "Le temps libre restant est trop court pour une cible.",
    suggestExhausted: "Aucune autre cible à proposer pour ce soir.",
    suggestContinue: "À poursuivre",
    suggestNightOrder: "Dans l’ordre de la nuit",
    suggestProgress: "{acquired} sur {goal} · plan multi-nuits {name}",
    suggestExcludeCaptured: "Exclure les cibles déjà faites",
    suggestComfort: "Confort",
    suggestComfortAny: "Sans restriction",
    suggestComfortEasy: "Visée confortable",
    suggestComfortLabel: "Confort de visée",
    suggestComfortRefractor:
      "Lunette : au-dessus de {max}°, l’oculaire devient difficile à atteindre.",
    suggestComfortRearEyepiece:
      "Oculaire à l’arrière : au-dessus de {max}°, il devient difficile à atteindre.",
    suggestComfortNewtonianAltaz:
      "Newton sur Dobson : sous {min}°, l’oculaire est trop bas.",
    suggestComfortNewtonianEquatorial:
      "Newton sur équatoriale : l’oculaire reste accessible de {min}° à {max}°.",
    suggestComfortBinoculars:
      "Jumelles : au-dessus de {max}°, la nuque fatigue vite.",
    suggestCapturedPhoto: "{name}, faite le {date}, est écartée.",
    suggestCapturedVisual: "{name}, observée le {date}, est écartée.",
    suggestCapturedManyPhoto: "{count} cibles déjà capturées sont écartées.",
    suggestCapturedManyVisual: "{count} cibles déjà observées sont écartées.",
    suggestPreviousPhotoWorse:
      "{name}, faite le {date} sous un ciel moins bon que ce soir.",
    suggestPreviousPhotoSame:
      "{name}, faite le {date} sous un ciel comparable à ce soir.",
    suggestPreviousPhotoBetter:
      "{name}, faite le {date} sous un ciel meilleur que ce soir.",
    suggestPreviousPhotoDate: "{name}, faite le {date}.",
    suggestAlreadyInPlan:
      "Déjà dans ce plan : elle est ajoutée une fois de plus à la frise.",
    suggestPreviousVisualWorse:
      "{name}, observée le {date} sous un ciel moins bon que ce soir.",
    suggestPreviousVisualSame:
      "{name}, observée le {date} sous un ciel comparable à ce soir.",
    suggestPreviousVisualBetter:
      "{name}, observée le {date} sous un ciel meilleur que ce soir.",
    suggestPreviousVisualDate: "{name}, observée le {date}.",
    suggestPosition: "Suggestions {from} à {to}",
    suggestRank: "{rank}",
    suggestLower: "Score plus bas : suggestions {from} à {to}",
    suggestOthers: "Autres suggestions",
    suggestBest: "Revenir aux meilleures",
    suggestReplacement:
      "Les cibles cochées restent ; les autres sont remplacées par les suivantes du classement.",
    suggestAllTicked: "Tout est coché : décochez une cible pour la remplacer.",
    suggestApply: "Ajouter {count} cibles au plan",
    suggestApplyOne: "Ajouter 1 cible au plan",
    suggestNightEnding:
      "La nuit se termine dans {duration} : pas assez pour une cible.",
    suggestNightShort:
      "Cette nuit ne dure que {duration} : pas assez pour une cible.",
    suggestNextNight: "Suggérer pour la nuit du {date}",
    suggestPlanFull: "Le temps libre de la nuit est déjà pris.",
    suggestPlanFullDetail:
      "Une cible demande {minimum} au moins. Retirez ou déplacez une cible d’un plan pour en libérer.",
    suggestOpenPlan: "Ouvrir le plan",
    suggestOpenPlans: "Voir les plans de la nuit",
    suggestNoTarget: "Aucune cible ne convient à cette nuit.",
    suggestNoTargetDetail:
      "La Lune, l’horizon ou la hauteur minimale ne laissent aucune cible visible assez longtemps.",
    suggestTakenByOtherPlans: "Les autres plans ont pris toutes les cibles.",
    suggestTakenByOtherPlansDetail:
      "Une cible déjà prévue dans un autre plan de cette nuit, du même type (photo ou visuel), n’est pas proposée une seconde fois. Retirez-la de cet autre plan pour la proposer ici.",
    suggestTimelineLabel: "Les cibles cochées placées sur la nuit : {items}.",
    suggestUnticked: "{name} décochée",
    suggestFree: "libre de {from} à {to}",
    suggestPlaceEquipment: "Lieu et matériel",
    autoFillLater: "Vous pourrez tout modifier ensuite.",
    autoFillCancel: "Annuler",
    autoFillClose: "Fermer",
    autoFillLegendFree: "libre",
  },
  ja: {
    suggestAction: "最適な対象を提案",
    suggestTitle: "提案された対象",
    suggestContext: "{place} · {date}の夜",
    suggestPhotoMode: "プランと同じ撮影モード",
    suggestVisualMode: "プランと同じ眼視モード",
    suggestChange: "変更",
    suggestChangeHint: "場所や機材を変更",
    suggestHowMany: "対象はいくつ？",
    suggestCountLabel: "対象数",
    suggestAll: "一晩中",
    suggestOther: "その他",
    suggestCustom: "いくつ？",
    suggestLess: "対象を1つ減らす",
    suggestMore: "対象を1つ増やす",
    suggestEstimatePhoto:
      "{count, plural, other{約{count}枠（各{duration}）。}}",
    suggestEstimateVisual: "{count, plural, other{約{count}枠（各20分）。}}",
    suggestEstimateHint: "対象数の推定方法",
    suggestEstimateDetailPhoto:
      "夜の空き時間は{free}、1対象あたり約{duration}です。",
    suggestEstimateDetailVisual: "夜の空き時間は{free}、1対象あたり20分です。",
    suggestPlacement: "配置",
    suggestPlacementLabel: "対象の配置",
    suggestPlacementIdeal: "最適",
    suggestPlacementChained: "連続",
    suggestPlacementIdealHelp: "各対象を最も良い時間帯に。",
    suggestPlacementChainedHelp: "各対象を前の対象の次に並べます。",
    suggestPlacementHint: "対象の配置の仕方",
    suggestPlacementDetail:
      "最適：各対象を最も条件の良い時間帯に置きます。間に待ち時間が入ることもあります。連続：最初の枠から対象を続けて並べます。毎回、見えている対象のうち評価の最も高いものを次に置き、対象の間の待ち時間は10分を超えません。続けられる対象がなければ、そこで終わります。",
    suggestShortfall: "{requested}対象の希望のうち、{placed}対象が夜に入ります",
    suggestSearching: "{count}対象を探しています…",
    suggestSearchingOne: "1対象を探しています…",
    suggestWhy: "なぜ{count}対象でないか",
    suggestAfterDew: "{time}以降は結露の見込みで、適した対象が残りません。",
    suggestAfterClouds: "{time}以降は雲があり、適した対象が残りません。",
    suggestAfterMoon: "{time}以降は月が昇り、適した対象が残りません。",
    suggestAfterNoFollower:
      "{time}以降は、前の対象から{minutes}分以内に続けられる対象がありません。",
    suggestNoAltitude: "最低高度を超える対象が他にありません。",
    suggestTooShort: "残りの空き時間が短く、対象が入りません。",
    suggestExhausted: "今夜提案できる対象は他にありません。",
    suggestContinue: "継続する対象",
    suggestNightOrder: "夜の時間順",
    suggestProgress: "{goal}中{acquired} · 複数夜プラン {name}",
    suggestExcludeCaptured: "実施済みの対象を除外する",
    suggestComfort: "快適さ",
    suggestComfortAny: "制限なし",
    suggestComfortEasy: "楽な姿勢で観望",
    suggestComfortLabel: "観望の快適さ",
    suggestComfortRefractor:
      "屈折望遠鏡：{max}°より高いと、接眼レンズに目が届きにくくなります。",
    suggestComfortRearEyepiece:
      "接眼部が後ろ：{max}°より高いと、目が届きにくくなります。",
    suggestComfortNewtonianAltaz:
      "ドブソニアンのニュートン式：{min}°より低いと、接眼レンズが低すぎます。",
    suggestComfortNewtonianEquatorial:
      "赤道儀のニュートン式：{min}°から{max}°まで接眼レンズに楽に届きます。",
    suggestComfortBinoculars: "双眼鏡：{max}°より高いと、首がすぐ疲れます。",
    suggestCapturedPhoto: "{date}に撮影した{name}を除外しています。",
    suggestCapturedVisual: "{date}に観望した{name}を除外しています。",
    suggestCapturedManyPhoto: "撮影済みの{count}対象を除外しています。",
    suggestCapturedManyVisual: "観望済みの{count}対象を除外しています。",
    suggestPreviousPhotoWorse:
      "{name}は{date}に、今夜より悪い空で撮影済みです。",
    suggestPreviousPhotoSame:
      "{name}は{date}に、今夜と同程度の空で撮影済みです。",
    suggestPreviousPhotoBetter:
      "{name}は{date}に、今夜より良い空で撮影済みです。",
    suggestPreviousPhotoDate: "{name}は{date}に撮影済みです。",
    suggestAlreadyInPlan:
      "すでにこのプランに含まれています。タイムラインにもう一度追加されます。",
    suggestPreviousVisualWorse:
      "{name}は{date}に、今夜より悪い空で観望済みです。",
    suggestPreviousVisualSame:
      "{name}は{date}に、今夜と同程度の空で観望済みです。",
    suggestPreviousVisualBetter:
      "{name}は{date}に、今夜より良い空で観望済みです。",
    suggestPreviousVisualDate: "{name}は{date}に観望済みです。",
    suggestPosition: "提案 {from}から{to}",
    suggestRank: "{rank}",
    suggestLower: "低いスコア：提案 {from}から{to}",
    suggestOthers: "他の候補",
    suggestBest: "最適な対象に戻る",
    suggestReplacement:
      "選択した対象は残り、他は順位の次の対象に置き換わります。",
    suggestAllTicked:
      "すべて選択済みです。置き換える対象の選択を外してください。",
    suggestApply: "{count}対象をプランに追加",
    suggestApplyOne: "1対象をプランに追加",
    suggestNightEnding:
      "夜はあと{duration}で終わります。対象1つには足りません。",
    suggestNightShort:
      "この夜は{duration}しかありません。対象1つには足りません。",
    suggestNextNight: "{date}の夜の候補を出す",
    suggestPlanFull: "夜の空き時間は、すでに埋まっています。",
    suggestPlanFullDetail:
      "1対象には最低{minimum}必要です。プランの対象を外すか動かして、空きを作ってください。",
    suggestOpenPlan: "プランを開く",
    suggestOpenPlans: "この夜のプランを見る",
    suggestNoTarget: "この夜に合う対象がありません。",
    suggestNoTargetDetail:
      "月、地平線、最低高度のせいで、十分な時間見える対象がありません。",
    suggestTakenByOtherPlans: "ほかのプランがすべての対象を使っています。",
    suggestTakenByOtherPlansDetail:
      "同じ夜の別のプランに入っている同じ種類（撮影または眼視観望）の対象は、重ねて提案されません。そのプランから外すと、ここで提案されます。",
    suggestTimelineLabel: "夜に配置された選択対象：{items}。",
    suggestUnticked: "{name}は選択解除",
    suggestFree: "{from}から{to}は空き",
    suggestPlaceEquipment: "場所と機材",
    autoFillLater: "追加したあとも、すべて変更できます。",
    autoFillCancel: "キャンセル",
    autoFillClose: "閉じる",
    autoFillLegendFree: "空き",
  },
  de: {
    suggestAction: "Die besten Ziele vorschlagen",
    suggestTitle: "Vorgeschlagene Ziele",
    suggestContext: "{place} · Nacht vom {date}",
    suggestPhotoMode: "Fotomodus wie im Plan",
    suggestVisualMode: "Visueller Modus wie im Plan",
    suggestChange: "Ändern",
    suggestChangeHint: "Ort oder Ausrüstung ändern",
    suggestHowMany: "Wie viele Ziele?",
    suggestCountLabel: "Anzahl der Ziele",
    suggestAll: "Die ganze Nacht",
    suggestOther: "Andere",
    suggestCustom: "Wie viele?",
    suggestLess: "Ein Ziel weniger",
    suggestMore: "Ein Ziel mehr",
    suggestEstimatePhoto:
      "{count, plural, one{Etwa {count} Zeitfenster von {duration}.} other{Etwa {count} Zeitfenster von je {duration}.}}",
    suggestEstimateVisual:
      "{count, plural, one{Etwa {count} Zeitfenster von 20 min.} other{Etwa {count} Zeitfenster von je 20 min.}}",
    suggestEstimateHint: "Wie die Anzahl geschätzt wird",
    suggestEstimateDetailPhoto:
      "{free} frei in der Nacht, etwa {duration} pro Ziel.",
    suggestEstimateDetailVisual: "{free} frei in der Nacht, 20 min pro Ziel.",
    suggestPlacement: "Platzierung",
    suggestPlacementLabel: "Platzierung der Ziele",
    suggestPlacementIdeal: "Ideal",
    suggestPlacementChained: "Dicht aufeinander",
    suggestPlacementIdealHelp: "Jedes Ziel zu seinem besten Zeitpunkt.",
    suggestPlacementChainedHelp: "Jedes Ziel folgt auf das vorherige.",
    suggestPlacementHint: "Wie die Ziele platziert werden",
    suggestPlacementDetail:
      "Ideal: Jedes Ziel steht dort, wo es am besten steht, auch wenn dazwischen gewartet werden muss. Dicht aufeinander: Die Ziele folgen ab dem ersten Zeitfenster aufeinander; jedes Mal kommt das am besten bewertete sichtbare Ziel als Nächstes, und die Wartezeit zwischen zwei Zielen beträgt nie mehr als 10 min. Kann keines folgen, endet die Liste dort.",
    suggestShortfall: "{requested} gewünscht, {placed} passen in die Nacht",
    suggestSearching: "{count} Ziele werden gesucht…",
    suggestSearchingOne: "1 Ziel wird gesucht…",
    suggestWhy: "Warum nicht {count}",
    suggestAfterDew:
      "Nach {time} ist Tau wahrscheinlich: Es bleibt nichts Geeignetes übrig.",
    suggestAfterClouds:
      "Nach {time} gibt es Wolken: Es bleibt nichts Geeignetes übrig.",
    suggestAfterMoon:
      "Nach {time} steht der Mond am Himmel: Es bleibt nichts Geeignetes übrig.",
    suggestAfterNoFollower:
      "Nach {time} folgt kein Ziel dem vorherigen innerhalb von {minutes} min.",
    suggestNoAltitude: "Kein weiteres Ziel über der Mindesthöhe.",
    suggestTooShort: "Die verbleibende freie Zeit ist zu kurz für ein Ziel.",
    suggestExhausted: "Keine weiteren Ziele für heute Abend.",
    suggestContinue: "Fortsetzen",
    suggestNightOrder: "In der Reihenfolge der Nacht",
    suggestProgress: "{acquired} von {goal} · Mehrnächteplan {name}",
    suggestExcludeCaptured: "Bereits erledigte Ziele ausschließen",
    suggestComfort: "Komfort",
    suggestComfortAny: "Ohne Einschränkung",
    suggestComfortEasy: "Bequemer Einblick",
    suggestComfortLabel: "Einblickkomfort",
    suggestComfortRefractor:
      "Refraktor: über {max}° wird das Okular schwer erreichbar.",
    suggestComfortRearEyepiece:
      "Okular hinten: über {max}° wird es schwer erreichbar.",
    suggestComfortNewtonianAltaz:
      "Newton auf Dobson: unter {min}° liegt das Okular zu tief.",
    suggestComfortNewtonianEquatorial:
      "Newton auf parallaktischer Montierung: Das Okular bleibt von {min}° bis {max}° gut erreichbar.",
    suggestComfortBinoculars:
      "Fernglas: über {max}° ermüdet der Nacken schnell.",
    suggestCapturedPhoto: "{name}, am {date} fotografiert, wird ausgelassen.",
    suggestCapturedVisual: "{name}, am {date} beobachtet, wird ausgelassen.",
    suggestCapturedManyPhoto:
      "{count} bereits fotografierte Ziele werden ausgelassen.",
    suggestCapturedManyVisual:
      "{count} bereits beobachtete Ziele werden ausgelassen.",
    suggestPreviousPhotoWorse:
      "{name}, am {date} bei schlechterem Himmel als heute Nacht fotografiert.",
    suggestPreviousPhotoSame:
      "{name}, am {date} bei einem Himmel wie heute Nacht fotografiert.",
    suggestPreviousPhotoBetter:
      "{name}, am {date} bei besserem Himmel als heute Nacht fotografiert.",
    suggestPreviousPhotoDate: "{name}, am {date} fotografiert.",
    suggestAlreadyInPlan:
      "Schon in diesem Plan: Es kommt ein weiteres Mal in die Zeitleiste.",
    suggestPreviousVisualWorse:
      "{name}, am {date} bei schlechterem Himmel als heute Nacht beobachtet.",
    suggestPreviousVisualSame:
      "{name}, am {date} bei einem Himmel wie heute Nacht beobachtet.",
    suggestPreviousVisualBetter:
      "{name}, am {date} bei besserem Himmel als heute Nacht beobachtet.",
    suggestPreviousVisualDate: "{name}, am {date} beobachtet.",
    suggestPosition: "Vorschläge {from} bis {to}",
    suggestRank: "{rank}",
    suggestLower: "Niedrigere Bewertung: Vorschläge {from} bis {to}",
    suggestOthers: "Weitere Vorschläge",
    suggestBest: "Zurück zu den besten",
    suggestReplacement:
      "Markierte Ziele bleiben; die anderen werden durch die nächsten der Rangliste ersetzt.",
    suggestAllTicked:
      "Alle sind markiert: Entferne eine Markierung, um das Ziel zu ersetzen.",
    suggestApply: "{count} Ziele zum Plan hinzufügen",
    suggestApplyOne: "1 Ziel zum Plan hinzufügen",
    suggestNightEnding: "Die Nacht endet in {duration}: zu wenig für ein Ziel.",
    suggestNightShort:
      "Diese Nacht dauert nur {duration}: zu wenig für ein Ziel.",
    suggestNextNight: "Vorschläge für die Nacht vom {date}",
    suggestPlanFull: "Die freie Zeit der Nacht ist schon vergeben.",
    suggestPlanFullDetail:
      "Ein Ziel braucht mindestens {minimum}. Ein Ziel eines Plans zu entfernen oder zu verschieben schafft Zeit.",
    suggestOpenPlan: "Plan öffnen",
    suggestOpenPlans: "Pläne der Nacht ansehen",
    suggestNoTarget: "Kein Ziel passt zu dieser Nacht.",
    suggestNoTargetDetail:
      "Mond, Horizont oder Mindesthöhe lassen kein Ziel lange genug sichtbar.",
    suggestTakenByOtherPlans: "Die anderen Pläne haben alle Ziele belegt.",
    suggestTakenByOtherPlansDetail:
      "Ein Ziel, das schon in einem anderen Plan derselben Nacht und derselben Art (Fotografie oder visuell) steht, wird nicht ein zweites Mal vorgeschlagen. Aus jenem Plan entfernt, wird es hier vorgeschlagen.",
    suggestTimelineLabel: "Markierte Ziele in der Nacht: {items}.",
    suggestUnticked: "{name} nicht markiert",
    suggestFree: "frei von {from} bis {to}",
    suggestPlaceEquipment: "Ort und Ausrüstung",
    autoFillLater: "Du kannst danach alles ändern.",
    autoFillCancel: "Abbrechen",
    autoFillClose: "Schließen",
    autoFillLegendFree: "frei",
  },
  es: {
    suggestAction: "Sugerir los mejores objetivos",
    suggestTitle: "Objetivos sugeridos",
    suggestContext: "{place} · noche del {date}",
    suggestPhotoMode: "Modo foto, el del plan",
    suggestVisualMode: "Modo visual, el del plan",
    suggestChange: "Cambiar",
    suggestChangeHint: "Cambiar lugar o equipo",
    suggestHowMany: "¿Cuántos objetivos?",
    suggestCountLabel: "Número de objetivos",
    suggestAll: "Toda la noche",
    suggestOther: "Otro",
    suggestCustom: "¿Cuántos?",
    suggestLess: "Un objetivo menos",
    suggestMore: "Un objetivo más",
    suggestEstimatePhoto:
      "{count, plural, one{Una franja de {duration}, aproximadamente.} other{Unas {count} franjas de {duration}.}}",
    suggestEstimateVisual:
      "{count, plural, one{Una franja de 20 min, aproximadamente.} other{Unas {count} franjas de 20 min.}}",
    suggestEstimateHint: "Cómo se estima el número",
    suggestEstimateDetailPhoto:
      "{free} libres en la noche, unos {duration} por objetivo.",
    suggestEstimateDetailVisual:
      "{free} libres en la noche, 20 min por objetivo.",
    suggestPlacement: "Disposición",
    suggestPlacementLabel: "Disposición de los objetivos",
    suggestPlacementIdeal: "Ideal",
    suggestPlacementChained: "Seguidos",
    suggestPlacementIdealHelp: "Cada objetivo en su mejor momento.",
    suggestPlacementChainedHelp: "Cada objetivo sigue al anterior.",
    suggestPlacementHint: "Cómo se disponen los objetivos",
    suggestPlacementDetail:
      "Ideal: cada objetivo se coloca donde mejor está situado, aunque haya que esperar entre uno y otro. Seguidos: los objetivos se suceden desde la primera franja; cada vez sigue el objetivo visible mejor valorado, y la espera entre dos objetivos nunca supera los 10 min. Si ninguno puede seguir, la lista termina ahí.",
    suggestShortfall: "{requested} solicitados, {placed} caben en la noche",
    suggestSearching: "Buscando {count} objetivos…",
    suggestSearchingOne: "Buscando 1 objetivo…",
    suggestWhy: "Por qué no {count}",
    suggestAfterDew:
      "Después de las {time}, rocío probable: no queda nada adecuado.",
    suggestAfterClouds: "Después de las {time}, nubes: no queda nada adecuado.",
    suggestAfterMoon:
      "Después de las {time}, Luna sobre el horizonte: no queda nada adecuado.",
    suggestAfterNoFollower:
      "Después de las {time}, ningún objetivo sigue al anterior en menos de {minutes} min.",
    suggestNoAltitude: "Ningún otro objetivo supera la altura mínima.",
    suggestTooShort:
      "El tiempo libre restante es demasiado corto para un objetivo.",
    suggestExhausted: "No hay más objetivos que sugerir esta noche.",
    suggestContinue: "Para continuar",
    suggestNightOrder: "En el orden de la noche",
    suggestProgress: "{acquired} de {goal} · plan de varias noches {name}",
    suggestExcludeCaptured: "Excluir los objetivos ya realizados",
    suggestComfort: "Comodidad",
    suggestComfortAny: "Sin restricción",
    suggestComfortEasy: "Visión cómoda",
    suggestComfortLabel: "Comodidad de observación",
    suggestComfortRefractor:
      "Refractor: por encima de {max}°, el ocular se vuelve difícil de alcanzar.",
    suggestComfortRearEyepiece:
      "Ocular detrás: por encima de {max}°, se vuelve difícil de alcanzar.",
    suggestComfortNewtonianAltaz:
      "Newton en Dobson: por debajo de {min}°, el ocular queda demasiado bajo.",
    suggestComfortNewtonianEquatorial:
      "Newton en montura ecuatorial: el ocular sigue accesible de {min}° a {max}°.",
    suggestComfortBinoculars:
      "Prismáticos: por encima de {max}°, el cuello se cansa rápido.",
    suggestCapturedPhoto: "{name}, capturado el {date}, queda excluido.",
    suggestCapturedVisual: "{name}, observado el {date}, queda excluido.",
    suggestCapturedManyPhoto: "Se excluyen {count} objetivos ya capturados.",
    suggestCapturedManyVisual: "Se excluyen {count} objetivos ya observados.",
    suggestPreviousPhotoWorse:
      "{name}, capturado el {date} bajo un cielo peor que esta noche.",
    suggestPreviousPhotoSame:
      "{name}, capturado el {date} bajo un cielo comparable al de esta noche.",
    suggestPreviousPhotoBetter:
      "{name}, capturado el {date} bajo un cielo mejor que esta noche.",
    suggestPreviousPhotoDate: "{name}, capturado el {date}.",
    suggestAlreadyInPlan:
      "Ya está en este plan: se añade una vez más a la cronología.",
    suggestPreviousVisualWorse:
      "{name}, observado el {date} bajo un cielo peor que esta noche.",
    suggestPreviousVisualSame:
      "{name}, observado el {date} bajo un cielo comparable al de esta noche.",
    suggestPreviousVisualBetter:
      "{name}, observado el {date} bajo un cielo mejor que esta noche.",
    suggestPreviousVisualDate: "{name}, observado el {date}.",
    suggestPosition: "Sugerencias {from} a {to}",
    suggestRank: "{rank}",
    suggestLower: "Puntuación más baja: sugerencias {from} a {to}",
    suggestOthers: "Más sugerencias",
    suggestBest: "Volver a los mejores",
    suggestReplacement:
      "Los objetivos marcados se conservan; los demás se sustituyen por los siguientes de la clasificación.",
    suggestAllTicked:
      "Todos están marcados: desmarca un objetivo para sustituirlo.",
    suggestApply: "Añadir {count} objetivos al plan",
    suggestApplyOne: "Añadir 1 objetivo al plan",
    suggestNightEnding:
      "La noche termina en {duration}: no basta para un objetivo.",
    suggestNightShort:
      "Esta noche dura solo {duration}: no basta para un objetivo.",
    suggestNextNight: "Sugerir para la noche del {date}",
    suggestPlanFull: "El tiempo libre de la noche ya está ocupado.",
    suggestPlanFullDetail:
      "Un objetivo requiere al menos {minimum}. Quitar o mover un objetivo de un plan libera tiempo.",
    suggestOpenPlan: "Abrir el plan",
    suggestOpenPlans: "Ver los planes de la noche",
    suggestNoTarget: "Ningún objetivo encaja con esta noche.",
    suggestNoTargetDetail:
      "La Luna, el horizonte o la altura mínima no dejan ningún objetivo visible el tiempo suficiente.",
    suggestTakenByOtherPlans:
      "Los otros planes han ocupado todos los objetivos.",
    suggestTakenByOtherPlansDetail:
      "Un objetivo que ya está en otro plan de esta noche, del mismo tipo (astrofotografía o visual), no se propone por segunda vez. Quitado de ese plan, se propone aquí.",
    suggestTimelineLabel: "Objetivos marcados colocados en la noche: {items}.",
    suggestUnticked: "{name} desmarcado",
    suggestFree: "libre de {from} a {to}",
    suggestPlaceEquipment: "Lugar y equipo",
    autoFillLater: "Después podrá modificarlo todo.",
    autoFillCancel: "Cancelar",
    autoFillClose: "Cerrar",
    autoFillLegendFree: "libre",
  },
  it: {
    suggestAction: "Suggerire i migliori target",
    suggestTitle: "Soggetti suggeriti",
    suggestContext: "{place} · notte del {date}",
    suggestPhotoMode: "Modalità foto, come nel piano",
    suggestVisualMode: "Modalità visuale, come nel piano",
    suggestChange: "Cambiare",
    suggestChangeHint: "Cambiare luogo o attrezzatura",
    suggestHowMany: "Quanti target?",
    suggestCountLabel: "Numero di target",
    suggestAll: "Tutta la notte",
    suggestOther: "Altro",
    suggestCustom: "Quanti?",
    suggestLess: "Un target in meno",
    suggestMore: "Un target in più",
    suggestEstimatePhoto:
      "{count, plural, one{Circa {count} slot da {duration}.} other{Circa {count} slot da {duration}.}}",
    suggestEstimateVisual:
      "{count, plural, one{Circa {count} slot da 20 min.} other{Circa {count} slot da 20 min.}}",
    suggestEstimateHint: "Come viene stimato il numero",
    suggestEstimateDetailPhoto:
      "{free} liberi nella notte, circa {duration} per target.",
    suggestEstimateDetailVisual:
      "{free} liberi nella notte, 20 min per target.",
    suggestPlacement: "Posizionamento",
    suggestPlacementLabel: "Posizionamento dei target",
    suggestPlacementIdeal: "Ideale",
    suggestPlacementChained: "Ravvicinato",
    suggestPlacementIdealHelp: "Ogni target nel suo momento migliore.",
    suggestPlacementChainedHelp: "Ogni target segue il precedente.",
    suggestPlacementHint: "Come vengono posizionati i target",
    suggestPlacementDetail:
      "Ideale: ogni target è collocato dove è meglio posizionato, anche a costo di attendere tra uno e l’altro. Ravvicinato: i target si susseguono dalla prima fascia; ogni volta segue il target visibile con il punteggio migliore, e l’attesa tra due target non supera mai 10 min. Se nessuno può seguire, l’elenco si ferma lì.",
    suggestShortfall: "{requested} richiesti, {placed} entrano nella notte",
    suggestSearching: "Ricerca di {count} target…",
    suggestSearchingOne: "Ricerca di 1 target…",
    suggestWhy: "Perché non {count}",
    suggestAfterDew:
      "Dopo le {time}, probabile rugiada: non resta nulla di adatto.",
    suggestAfterClouds: "Dopo le {time}, nuvole: non resta nulla di adatto.",
    suggestAfterMoon:
      "Dopo le {time}, Luna sopra l’orizzonte: non resta nulla di adatto.",
    suggestAfterNoFollower:
      "Dopo le {time}, nessun target segue il precedente entro {minutes} min.",
    suggestNoAltitude: "Nessun altro target sopra l’altezza minima.",
    suggestTooShort: "Il tempo libero restante è troppo breve per un target.",
    suggestExhausted: "Nessun altro target da proporre stasera.",
    suggestContinue: "Da proseguire",
    suggestNightOrder: "Nell’ordine della notte",
    suggestProgress: "{acquired} su {goal} · piano multi-notte {name}",
    suggestExcludeCaptured: "Escludere i target già fatti",
    suggestComfort: "Comodità",
    suggestComfortAny: "Senza restrizioni",
    suggestComfortEasy: "Visione comoda",
    suggestComfortLabel: "Comfort di osservazione",
    suggestComfortRefractor:
      "Rifrattore: sopra i {max}°, l’oculare diventa difficile da raggiungere.",
    suggestComfortRearEyepiece:
      "Oculare dietro: sopra i {max}°, diventa difficile da raggiungere.",
    suggestComfortNewtonianAltaz:
      "Newton su Dobson: sotto i {min}°, l’oculare è troppo in basso.",
    suggestComfortNewtonianEquatorial:
      "Newton su montatura equatoriale: l’oculare resta accessibile da {min}° a {max}°.",
    suggestComfortBinoculars:
      "Binocolo: sopra i {max}°, il collo si stanca presto.",
    suggestCapturedPhoto: "{name}, ripreso il {date}, è escluso.",
    suggestCapturedVisual: "{name}, osservato il {date}, è escluso.",
    suggestCapturedManyPhoto: "{count} target già ripresi sono esclusi.",
    suggestCapturedManyVisual: "{count} target già osservati sono esclusi.",
    suggestPreviousPhotoWorse:
      "{name}, ripreso il {date} sotto un cielo peggiore di stanotte.",
    suggestPreviousPhotoSame:
      "{name}, ripreso il {date} sotto un cielo paragonabile a quello di stanotte.",
    suggestPreviousPhotoBetter:
      "{name}, ripreso il {date} sotto un cielo migliore di stanotte.",
    suggestPreviousPhotoDate: "{name}, ripreso il {date}.",
    suggestAlreadyInPlan:
      "Già in questo piano: viene aggiunto un’altra volta alla linea del tempo.",
    suggestPreviousVisualWorse:
      "{name}, osservato il {date} sotto un cielo peggiore di stanotte.",
    suggestPreviousVisualSame:
      "{name}, osservato il {date} sotto un cielo paragonabile a quello di stanotte.",
    suggestPreviousVisualBetter:
      "{name}, osservato il {date} sotto un cielo migliore di stanotte.",
    suggestPreviousVisualDate: "{name}, osservato il {date}.",
    suggestPosition: "Suggerimenti da {from} a {to}",
    suggestRank: "{rank}",
    suggestLower: "Punteggio più basso: suggerimenti da {from} a {to}",
    suggestOthers: "Altri suggerimenti",
    suggestBest: "Tornare ai migliori",
    suggestReplacement:
      "I target selezionati restano; gli altri sono sostituiti dai successivi in classifica.",
    suggestAllTicked:
      "Tutti sono selezionati: deseleziona un target per sostituirlo.",
    suggestApply: "Aggiungere {count} target al piano",
    suggestApplyOne: "Aggiungere 1 target al piano",
    suggestNightEnding:
      "La notte finisce tra {duration}: non basta per un target.",
    suggestNightShort:
      "Questa notte dura solo {duration}: non basta per un target.",
    suggestNextNight: "Suggerire per la notte del {date}",
    suggestPlanFull: "Il tempo libero della notte è già occupato.",
    suggestPlanFullDetail:
      "Un target richiede almeno {minimum}. Togli o sposta un target di un piano per liberare tempo.",
    suggestOpenPlan: "Aprire il piano",
    suggestOpenPlans: "Vedere i piani della notte",
    suggestNoTarget: "Nessun target è adatto a questa notte.",
    suggestNoTargetDetail:
      "La Luna, l’orizzonte o l’altezza minima non lasciano nessun target visibile abbastanza a lungo.",
    suggestTakenByOtherPlans: "Gli altri piani hanno preso tutti i target.",
    suggestTakenByOtherPlansDetail:
      "Un target già presente in un altro piano di questa notte, dello stesso tipo (foto o visuale), non viene proposto una seconda volta. Tolto da quel piano, viene proposto qui.",
    suggestTimelineLabel:
      "Soggetti selezionati collocati nella notte: {items}.",
    suggestUnticked: "{name} deselezionato",
    suggestFree: "libero dalle {from} alle {to}",
    suggestPlaceEquipment: "Luogo e attrezzatura",
    autoFillLater: "Potrai modificare tutto in seguito.",
    autoFillCancel: "Annullare",
    autoFillClose: "Chiudere",
    autoFillLegendFree: "libera",
  },
  pt: {
    suggestAction: "Sugerir os melhores alvos",
    suggestTitle: "Alvos sugeridos",
    suggestContext: "{place} · noite de {date}",
    suggestPhotoMode: "Modo foto, o do plano",
    suggestVisualMode: "Modo visual, o do plano",
    suggestChange: "Alterar",
    suggestChangeHint: "Alterar local ou equipamento",
    suggestHowMany: "Quantos alvos?",
    suggestCountLabel: "Número de alvos",
    suggestAll: "Toda a noite",
    suggestOther: "Outro",
    suggestCustom: "Quantos?",
    suggestLess: "Um alvo a menos",
    suggestMore: "Um alvo a mais",
    suggestEstimatePhoto:
      "{count, plural, one{Cerca de {count} intervalo de {duration}.} other{Cerca de {count} intervalos de {duration}.}}",
    suggestEstimateVisual:
      "{count, plural, one{Cerca de {count} intervalo de 20 min.} other{Cerca de {count} intervalos de 20 min.}}",
    suggestEstimateHint: "Como se estima o número",
    suggestEstimateDetailPhoto:
      "{free} livres na noite, cerca de {duration} por alvo.",
    suggestEstimateDetailVisual: "{free} livres na noite, 20 min por alvo.",
    suggestPlacement: "Posicionamento",
    suggestPlacementLabel: "Posicionamento dos alvos",
    suggestPlacementIdeal: "Ideal",
    suggestPlacementChained: "Em sequência",
    suggestPlacementIdealHelp: "Cada alvo no seu melhor momento.",
    suggestPlacementChainedHelp: "Cada alvo segue o anterior.",
    suggestPlacementHint: "Como os alvos são posicionados",
    suggestPlacementDetail:
      "Ideal: cada alvo fica onde está melhor posicionado, mesmo que seja preciso esperar entre dois. Em sequência: os alvos vêm um após o outro desde o primeiro intervalo; a cada vez, segue o alvo visível com melhor nota, e a espera entre dois alvos nunca passa de 10 min. Se nenhum puder seguir, a lista para aí.",
    suggestShortfall: "{requested} pedidos, {placed} cabem na noite",
    suggestSearching: "A procurar {count} alvos…",
    suggestSearchingOne: "A procurar 1 alvo…",
    suggestWhy: "Por que não {count}",
    suggestAfterDew: "Após {time}, orvalho provável: nada satisfatório resta.",
    suggestAfterClouds: "Após {time}, nuvens: nada satisfatório resta.",
    suggestAfterMoon:
      "Após {time}, Lua acima do horizonte: nada satisfatório resta.",
    suggestAfterNoFollower:
      "Após {time}, nenhum alvo segue o anterior em menos de {minutes} min.",
    suggestNoAltitude: "Nenhum outro alvo acima da altura mínima.",
    suggestTooShort: "O tempo livre restante é demasiado curto para um alvo.",
    suggestExhausted: "Não há mais alvos a sugerir esta noite.",
    suggestContinue: "Para continuar",
    suggestNightOrder: "Pela ordem da noite",
    suggestProgress: "{acquired} de {goal} · plano de várias noites {name}",
    suggestExcludeCaptured: "Excluir os alvos já feitos",
    suggestComfort: "Conforto",
    suggestComfortAny: "Sem restrição",
    suggestComfortEasy: "Visão confortável",
    suggestComfortLabel: "Conforto de observação",
    suggestComfortRefractor:
      "Refrator: acima de {max}°, a ocular fica difícil de alcançar.",
    suggestComfortRearEyepiece:
      "Ocular atrás: acima de {max}°, fica difícil de alcançar.",
    suggestComfortNewtonianAltaz:
      "Newton em Dobson: abaixo de {min}°, a ocular fica baixa demais.",
    suggestComfortNewtonianEquatorial:
      "Newton em montagem equatorial: a ocular fica acessível de {min}° a {max}°.",
    suggestComfortBinoculars:
      "Binóculos: acima de {max}°, o pescoço cansa rápido.",
    suggestCapturedPhoto: "{name}, capturado em {date}, está excluído.",
    suggestCapturedVisual: "{name}, observado em {date}, está excluído.",
    suggestCapturedManyPhoto: "{count} alvos já capturados estão excluídos.",
    suggestCapturedManyVisual: "{count} alvos já observados estão excluídos.",
    suggestPreviousPhotoWorse:
      "{name}, capturado em {date} sob um céu pior do que esta noite.",
    suggestPreviousPhotoSame:
      "{name}, capturado em {date} sob um céu comparável ao desta noite.",
    suggestPreviousPhotoBetter:
      "{name}, capturado em {date} sob um céu melhor do que esta noite.",
    suggestPreviousPhotoDate: "{name}, capturado em {date}.",
    suggestAlreadyInPlan:
      "Já está neste plano: será adicionado mais uma vez à linha do tempo.",
    suggestPreviousVisualWorse:
      "{name}, observado em {date} sob um céu pior do que esta noite.",
    suggestPreviousVisualSame:
      "{name}, observado em {date} sob um céu comparável ao desta noite.",
    suggestPreviousVisualBetter:
      "{name}, observado em {date} sob um céu melhor do que esta noite.",
    suggestPreviousVisualDate: "{name}, observado em {date}.",
    suggestPosition: "Sugestões {from} a {to}",
    suggestRank: "{rank}",
    suggestLower: "Pontuação mais baixa: sugestões {from} a {to}",
    suggestOthers: "Mais sugestões",
    suggestBest: "Voltar aos melhores",
    suggestReplacement:
      "Os alvos marcados ficam; os outros são substituídos pelos seguintes da classificação.",
    suggestAllTicked:
      "Todos estão marcados: desmarque um alvo para o substituir.",
    suggestApply: "Adicionar {count} alvos ao plano",
    suggestApplyOne: "Adicionar 1 alvo ao plano",
    suggestNightEnding:
      "A noite termina em {duration}: não chega para um alvo.",
    suggestNightShort:
      "Esta noite dura apenas {duration}: não chega para um alvo.",
    suggestNextNight: "Sugerir para a noite de {date}",
    suggestPlanFull: "O tempo livre da noite já está ocupado.",
    suggestPlanFullDetail:
      "Um alvo precisa de pelo menos {minimum}. Remover ou mover um alvo de um plano liberta tempo.",
    suggestOpenPlan: "Abrir o plano",
    suggestOpenPlans: "Ver os planos da noite",
    suggestNoTarget: "Nenhum alvo serve para esta noite.",
    suggestNoTargetDetail:
      "A Lua, o horizonte ou a altura mínima não deixam nenhum alvo visível por tempo suficiente.",
    suggestTakenByOtherPlans: "Os outros planos ficaram com todos os alvos.",
    suggestTakenByOtherPlansDetail:
      "Um alvo que já está noutro plano desta noite, do mesmo tipo (imageamento ou visual), não é proposto uma segunda vez. Removido desse plano, é proposto aqui.",
    suggestTimelineLabel: "Alvos marcados colocados na noite: {items}.",
    suggestUnticked: "{name} desmarcado",
    suggestFree: "livre de {from} a {to}",
    suggestPlaceEquipment: "Local e equipamento",
    autoFillLater: "Você poderá alterar tudo depois.",
    autoFillCancel: "Cancelar",
    autoFillClose: "Fechar",
    autoFillLegendFree: "livre",
  },
  "pt-BR": {
    suggestAction: "Sugerir os melhores alvos",
    suggestTitle: "Alvos sugeridos",
    suggestContext: "{place} · noite de {date}",
    suggestPhotoMode: "Modo foto, o do plano",
    suggestVisualMode: "Modo visual, o do plano",
    suggestChange: "Alterar",
    suggestChangeHint: "Alterar local ou equipamento",
    suggestHowMany: "Quantos alvos?",
    suggestCountLabel: "Número de alvos",
    suggestAll: "Toda a noite",
    suggestOther: "Outro",
    suggestCustom: "Quantos?",
    suggestLess: "Um alvo a menos",
    suggestMore: "Um alvo a mais",
    suggestEstimatePhoto:
      "{count, plural, one{Cerca de {count} intervalo de {duration}.} other{Cerca de {count} intervalos de {duration}.}}",
    suggestEstimateVisual:
      "{count, plural, one{Cerca de {count} intervalo de 20 min.} other{Cerca de {count} intervalos de 20 min.}}",
    suggestEstimateHint: "Como se estima o número",
    suggestEstimateDetailPhoto:
      "{free} livres na noite, cerca de {duration} por alvo.",
    suggestEstimateDetailVisual: "{free} livres na noite, 20 min por alvo.",
    suggestPlacement: "Posicionamento",
    suggestPlacementLabel: "Posicionamento dos alvos",
    suggestPlacementIdeal: "Ideal",
    suggestPlacementChained: "Em sequência",
    suggestPlacementIdealHelp: "Cada alvo no seu melhor momento.",
    suggestPlacementChainedHelp: "Cada alvo segue o anterior.",
    suggestPlacementHint: "Como os alvos são posicionados",
    suggestPlacementDetail:
      "Ideal: cada alvo fica onde está melhor posicionado, mesmo que seja preciso esperar entre dois. Em sequência: os alvos vêm um após o outro desde o primeiro intervalo; a cada vez, segue o alvo visível com melhor nota, e a espera entre dois alvos nunca passa de 10 min. Se nenhum puder seguir, a lista para aí.",
    suggestShortfall: "{requested} pedidos, {placed} cabem na noite",
    suggestSearching: "Procurando {count} alvos…",
    suggestSearchingOne: "Procurando 1 alvo…",
    suggestWhy: "Por que não {count}",
    suggestAfterDew: "Após {time}, orvalho provável: nada satisfatório resta.",
    suggestAfterClouds: "Após {time}, nuvens: nada satisfatório resta.",
    suggestAfterMoon:
      "Após {time}, Lua acima do horizonte: nada satisfatório resta.",
    suggestAfterNoFollower:
      "Após {time}, nenhum alvo segue o anterior em menos de {minutes} min.",
    suggestNoAltitude: "Nenhum outro alvo acima da altura mínima.",
    suggestTooShort: "O tempo livre restante é muito curto para um alvo.",
    suggestExhausted: "Não há mais alvos a sugerir esta noite.",
    suggestContinue: "Para continuar",
    suggestNightOrder: "Pela ordem da noite",
    suggestProgress: "{acquired} de {goal} · plano de várias noites {name}",
    suggestExcludeCaptured: "Excluir os alvos já feitos",
    suggestComfort: "Conforto",
    suggestComfortAny: "Sem restrição",
    suggestComfortEasy: "Visão confortável",
    suggestComfortLabel: "Conforto de observação",
    suggestComfortRefractor:
      "Refrator: acima de {max}°, a ocular fica difícil de alcançar.",
    suggestComfortRearEyepiece:
      "Ocular atrás: acima de {max}°, fica difícil de alcançar.",
    suggestComfortNewtonianAltaz:
      "Newton em Dobson: abaixo de {min}°, a ocular fica baixa demais.",
    suggestComfortNewtonianEquatorial:
      "Newton em montagem equatorial: a ocular fica acessível de {min}° a {max}°.",
    suggestComfortBinoculars:
      "Binóculos: acima de {max}°, o pescoço cansa rápido.",
    suggestCapturedPhoto: "{name}, capturado em {date}, está excluído.",
    suggestCapturedVisual: "{name}, observado em {date}, está excluído.",
    suggestCapturedManyPhoto: "{count} alvos já capturados estão excluídos.",
    suggestCapturedManyVisual: "{count} alvos já observados estão excluídos.",
    suggestPreviousPhotoWorse:
      "{name}, capturado em {date} sob um céu pior do que esta noite.",
    suggestPreviousPhotoSame:
      "{name}, capturado em {date} sob um céu comparável ao desta noite.",
    suggestPreviousPhotoBetter:
      "{name}, capturado em {date} sob um céu melhor do que esta noite.",
    suggestPreviousPhotoDate: "{name}, capturado em {date}.",
    suggestAlreadyInPlan:
      "Já está neste plano: será adicionado mais uma vez à linha do tempo.",
    suggestPreviousVisualWorse:
      "{name}, observado em {date} sob um céu pior do que esta noite.",
    suggestPreviousVisualSame:
      "{name}, observado em {date} sob um céu comparável ao desta noite.",
    suggestPreviousVisualBetter:
      "{name}, observado em {date} sob um céu melhor do que esta noite.",
    suggestPreviousVisualDate: "{name}, observado em {date}.",
    suggestPosition: "Sugestões {from} a {to}",
    suggestRank: "{rank}",
    suggestLower: "Pontuação mais baixa: sugestões {from} a {to}",
    suggestOthers: "Mais sugestões",
    suggestBest: "Voltar aos melhores",
    suggestReplacement:
      "Os alvos marcados ficam; os outros são substituídos pelos seguintes da classificação.",
    suggestAllTicked:
      "Todos estão marcados: desmarque um alvo para substituí-lo.",
    suggestApply: "Adicionar {count} alvos ao plano",
    suggestApplyOne: "Adicionar 1 alvo ao plano",
    suggestNightEnding:
      "A noite termina em {duration}: não chega para um alvo.",
    suggestNightShort:
      "Esta noite dura apenas {duration}: não chega para um alvo.",
    suggestNextNight: "Sugerir para a noite de {date}",
    suggestPlanFull: "O tempo livre da noite já está ocupado.",
    suggestPlanFullDetail:
      "Um alvo precisa de pelo menos {minimum}. Remover ou mover um alvo de um plano libera tempo.",
    suggestOpenPlan: "Abrir o plano",
    suggestOpenPlans: "Ver os planos da noite",
    suggestNoTarget: "Nenhum alvo serve para esta noite.",
    suggestNoTargetDetail:
      "A Lua, o horizonte ou a altura mínima não deixam nenhum alvo visível por tempo suficiente.",
    suggestTakenByOtherPlans: "Os outros planos ficaram com todos os alvos.",
    suggestTakenByOtherPlansDetail:
      "Um alvo que já está em outro plano desta noite, do mesmo tipo (imageamento ou visual), não é proposto uma segunda vez. Removido desse plano, ele é proposto aqui.",
    suggestTimelineLabel: "Alvos marcados colocados na noite: {items}.",
    suggestUnticked: "{name} desmarcado",
    suggestFree: "livre de {from} a {to}",
    suggestPlaceEquipment: "Local e equipamento",
    autoFillLater: "Você poderá alterar tudo depois.",
    autoFillCancel: "Cancelar",
    autoFillClose: "Fechar",
    autoFillLegendFree: "livre",
  },
  ru: {
    suggestAction: "Предложить лучшие цели",
    suggestTitle: "Предложенные цели",
    suggestContext: "{place} · ночь {date}",
    suggestPhotoMode: "Режим съёмки, как в плане",
    suggestVisualMode: "Визуальный режим, как в плане",
    suggestChange: "Изменить",
    suggestChangeHint: "Изменить место или оборудование",
    suggestHowMany: "Сколько целей?",
    suggestCountLabel: "Количество целей",
    suggestAll: "Всю ночь",
    suggestOther: "Другое",
    suggestCustom: "Сколько?",
    suggestLess: "На одну цель меньше",
    suggestMore: "На одну цель больше",
    suggestEstimatePhoto:
      "{count, plural, one{Примерно {count} интервал по {duration}.} few{Примерно {count} интервала по {duration}.} many{Примерно {count} интервалов по {duration}.} other{Примерно {count} интервала по {duration}.}}",
    suggestEstimateVisual:
      "{count, plural, one{Примерно {count} интервал по 20 мин.} few{Примерно {count} интервала по 20 мин.} many{Примерно {count} интервалов по 20 мин.} other{Примерно {count} интервала по 20 мин.}}",
    suggestEstimateHint: "Как оценивается количество",
    suggestEstimateDetailPhoto:
      "Свободно {free} за ночь, примерно {duration} на цель.",
    suggestEstimateDetailVisual: "Свободно {free} за ночь, 20 мин на цель.",
    suggestPlacement: "Размещение",
    suggestPlacementLabel: "Размещение целей",
    suggestPlacementIdeal: "Идеальное",
    suggestPlacementChained: "Вплотную",
    suggestPlacementIdealHelp: "Каждая цель в лучший для неё момент.",
    suggestPlacementChainedHelp: "Каждая цель идёт следом за предыдущей.",
    suggestPlacementHint: "Как размещаются цели",
    suggestPlacementDetail:
      "Идеальное: каждая цель ставится там, где ей лучше всего, даже если между целями придётся ждать. Вплотную: цели идут подряд с первого слота; каждый раз следующей становится видимая цель с лучшей оценкой, а ожидание между двумя целями никогда не превышает 10 мин. Если ни одна не может последовать, список на этом заканчивается.",
    suggestShortfall: "Запрошено {requested}, в ночь помещается {placed}",
    suggestSearching: "Поиск целей: {count}…",
    suggestSearchingOne: "Поиск 1 цели…",
    suggestWhy: "Почему не {count}",
    suggestAfterDew:
      "После {time} вероятна роса: подходящих целей не остаётся.",
    suggestAfterClouds: "После {time} облака: подходящих целей не остаётся.",
    suggestAfterMoon:
      "После {time} Луна над горизонтом: подходящих целей не остаётся.",
    suggestAfterNoFollower:
      "После {time} ни одна цель не следует за предыдущей в пределах {minutes} мин.",
    suggestNoAltitude: "Больше нет целей выше минимальной высоты.",
    suggestTooShort: "Оставшееся свободное время слишком коротко для цели.",
    suggestExhausted: "На сегодня больше нет целей для предложения.",
    suggestContinue: "Продолжить",
    suggestNightOrder: "По порядку ночи",
    suggestProgress: "{acquired} из {goal} · план на несколько ночей {name}",
    suggestExcludeCaptured: "Исключить уже выполненные цели",
    suggestComfort: "Удобство",
    suggestComfortAny: "Без ограничений",
    suggestComfortEasy: "Удобный обзор",
    suggestComfortLabel: "Удобство наблюдения",
    suggestComfortRefractor:
      "Рефрактор: выше {max}° до окуляра трудно дотянуться.",
    suggestComfortRearEyepiece:
      "Окуляр сзади: выше {max}° до него трудно дотянуться.",
    suggestComfortNewtonianAltaz:
      "Ньютон на Добсоне: ниже {min}° окуляр слишком низко.",
    suggestComfortNewtonianEquatorial:
      "Ньютон на экваториальной монтировке: окуляр доступен от {min}° до {max}°.",
    suggestComfortBinoculars: "Бинокль: выше {max}° быстро устаёт шея.",
    suggestCapturedPhoto: "{name}, снятый {date}, исключён.",
    suggestCapturedVisual: "{name}, наблюдавшийся {date}, исключён.",
    suggestCapturedManyPhoto: "Исключено {count} уже снятых целей.",
    suggestCapturedManyVisual: "Исключено {count} уже наблюдавшихся целей.",
    suggestPreviousPhotoWorse:
      "{name}, снятый {date} при небе хуже, чем этой ночью.",
    suggestPreviousPhotoSame:
      "{name}, снятый {date} при небе, сравнимом с сегодняшним.",
    suggestPreviousPhotoBetter:
      "{name}, снятый {date} при небе лучше, чем этой ночью.",
    suggestPreviousPhotoDate: "{name}, снятый {date}.",
    suggestAlreadyInPlan:
      "Уже в этом плане: цель будет добавлена на шкалу ещё раз.",
    suggestPreviousVisualWorse:
      "{name}, наблюдавшийся {date} при небе хуже, чем этой ночью.",
    suggestPreviousVisualSame:
      "{name}, наблюдавшийся {date} при небе, сравнимом с сегодняшним.",
    suggestPreviousVisualBetter:
      "{name}, наблюдавшийся {date} при небе лучше, чем этой ночью.",
    suggestPreviousVisualDate: "{name}, наблюдавшийся {date}.",
    suggestPosition: "Предложения с {from} по {to}",
    suggestRank: "{rank}",
    suggestLower: "Ниже оценка: предложения с {from} по {to}",
    suggestOthers: "Другие предложения",
    suggestBest: "Вернуться к лучшим",
    suggestReplacement:
      "Отмеченные цели остаются; остальные заменяются следующими в рейтинге.",
    suggestAllTicked:
      "Все отмечены: снимите отметку с цели, чтобы заменить её.",
    suggestApply: "Добавить {count} целей в план",
    suggestApplyOne: "Добавить 1 цель в план",
    suggestNightEnding:
      "Ночь закончится через {duration}: на одну цель не хватит.",
    suggestNightShort:
      "Эта ночь длится всего {duration}: на одну цель не хватит.",
    suggestNextNight: "Подобрать цели на ночь {date}",
    suggestPlanFull: "Свободное время ночи уже занято.",
    suggestPlanFullDetail:
      "Цели нужно не менее {minimum}. Уберите или передвиньте цель в плане, чтобы освободить время.",
    suggestOpenPlan: "Открыть план",
    suggestOpenPlans: "Показать планы ночи",
    suggestNoTarget: "Ни одна цель не подходит для этой ночи.",
    suggestNoTargetDetail:
      "Луна, горизонт или минимальная высота не оставляют ни одной цели, видимой достаточно долго.",
    suggestTakenByOtherPlans: "Остальные планы заняли все цели.",
    suggestTakenByOtherPlansDetail:
      "Цель, которая уже есть в другом плане этой ночи того же вида (съёмка или визуально), не предлагается второй раз. Если убрать её из того плана, она будет предложена здесь.",
    suggestTimelineLabel: "Отмеченные цели на шкале ночи: {items}.",
    suggestUnticked: "{name} не отмечен",
    suggestFree: "свободно с {from} до {to}",
    suggestPlaceEquipment: "Место и оборудование",
    autoFillLater: "Потом всё можно изменить.",
    autoFillCancel: "Отмена",
    autoFillClose: "Закрыть",
    autoFillLegendFree: "свободно",
  },
  "zh-Hans": {
    suggestAction: "推荐最佳目标",
    suggestTitle: "推荐的目标",
    suggestContext: "{place} · {date}之夜",
    suggestPhotoMode: "与计划相同的摄影模式",
    suggestVisualMode: "与计划相同的目视模式",
    suggestChange: "更改",
    suggestChangeHint: "更改地点或设备",
    suggestHowMany: "多少个目标？",
    suggestCountLabel: "目标数量",
    suggestAll: "整夜",
    suggestOther: "其他",
    suggestCustom: "多少个？",
    suggestLess: "减少一个目标",
    suggestMore: "增加一个目标",
    suggestEstimatePhoto:
      "{count, plural, other{大约{count}个时段，每个{duration}。}}",
    suggestEstimateVisual:
      "{count, plural, other{大约{count}个时段，每个20分钟。}}",
    suggestEstimateHint: "数量如何估算",
    suggestEstimateDetailPhoto: "夜间空闲{free}，每个目标约{duration}。",
    suggestEstimateDetailVisual: "夜间空闲{free}，每个目标20分钟。",
    suggestPlacement: "安排",
    suggestPlacementLabel: "目标安排方式",
    suggestPlacementIdeal: "最佳",
    suggestPlacementChained: "紧凑",
    suggestPlacementIdealHelp: "每个目标都在最佳时刻。",
    suggestPlacementChainedHelp: "每个目标接在前一个之后。",
    suggestPlacementHint: "目标如何安排",
    suggestPlacementDetail:
      "最佳：每个目标都安排在最合适的时段，必要时中间需要等待。紧凑：从第一个时段起依次排列；每次由当前可见、评分最高的目标接上，两个目标之间的等待从不超过10分钟。若没有目标能接上，列表就此结束。",
    suggestShortfall: "请求{requested}个，夜间可容纳{placed}个",
    suggestSearching: "正在查找{count}个目标…",
    suggestSearchingOne: "正在查找1个目标…",
    suggestWhy: "为什么不是{count}个",
    suggestAfterDew: "{time}之后可能结露，没有合适的目标。",
    suggestAfterClouds: "{time}之后有云，没有合适的目标。",
    suggestAfterMoon: "{time}之后月亮升起，没有合适的目标。",
    suggestAfterNoFollower:
      "{time}之后，没有目标能在{minutes}分钟内接上前一个。",
    suggestNoAltitude: "没有其他目标高于最低高度。",
    suggestTooShort: "剩余空闲时间不足以容纳一个目标。",
    suggestExhausted: "今晚没有其他可推荐的目标。",
    suggestContinue: "待继续",
    suggestNightOrder: "按夜间顺序",
    suggestProgress: "{goal}中的{acquired} · 多夜计划 {name}",
    suggestExcludeCaptured: "排除已完成的目标",
    suggestComfort: "舒适度",
    suggestComfortAny: "不限制",
    suggestComfortEasy: "舒适观测",
    suggestComfortLabel: "观测舒适度",
    suggestComfortRefractor: "折射镜：高于{max}°时，目镜很难够到。",
    suggestComfortRearEyepiece: "后置目镜：高于{max}°时，很难够到。",
    suggestComfortNewtonianAltaz: "多布森牛顿镜：低于{min}°时，目镜太低。",
    suggestComfortNewtonianEquatorial:
      "赤道仪牛顿镜：{min}°到{max}°之间，目镜都容易够到。",
    suggestComfortBinoculars: "双筒望远镜：高于{max}°时，脖子很快会累。",
    suggestCapturedPhoto: "{name}已于{date}拍摄，被排除。",
    suggestCapturedVisual: "{name}已于{date}观测，被排除。",
    suggestCapturedManyPhoto: "已排除{count}个拍摄过的目标。",
    suggestCapturedManyVisual: "已排除{count}个观测过的目标。",
    suggestPreviousPhotoWorse: "{name}已于{date}在比今晚更差的天空下拍摄。",
    suggestPreviousPhotoSame: "{name}已于{date}在与今晚相当的天空下拍摄。",
    suggestPreviousPhotoBetter: "{name}已于{date}在比今晚更好的天空下拍摄。",
    suggestPreviousPhotoDate: "{name}已于{date}拍摄。",
    suggestAlreadyInPlan: "已在此计划中：将在时间轴中再添加一次。",
    suggestPreviousVisualWorse: "{name}已于{date}在比今晚更差的天空下观测。",
    suggestPreviousVisualSame: "{name}已于{date}在与今晚相当的天空下观测。",
    suggestPreviousVisualBetter: "{name}已于{date}在比今晚更好的天空下观测。",
    suggestPreviousVisualDate: "{name}已于{date}观测。",
    suggestPosition: "推荐{from}至{to}",
    suggestRank: "{rank}",
    suggestLower: "较低分数：推荐{from}至{to}",
    suggestOthers: "其他建议",
    suggestBest: "返回最佳目标",
    suggestReplacement: "勾选的目标保留，其他目标替换为排名中接下来的目标。",
    suggestAllTicked: "全部已勾选：取消勾选一个目标以替换。",
    suggestApply: "将{count}个目标加入计划",
    suggestApplyOne: "将1个目标加入计划",
    suggestNightEnding: "夜晚将在{duration}后结束：不够放下一个目标。",
    suggestNightShort: "这一夜只有{duration}：不够放下一个目标。",
    suggestNextNight: "为{date}之夜推荐目标",
    suggestPlanFull: "夜间的空闲时间已被占满。",
    suggestPlanFullDetail:
      "一个目标至少需要{minimum}。请移除或移动计划中的一个目标来腾出时间。",
    suggestOpenPlan: "打开计划",
    suggestOpenPlans: "查看当夜的计划",
    suggestNoTarget: "没有适合这一夜的目标。",
    suggestNoTargetDetail:
      "月亮、地平线或最低高度使任何目标都无法被看到足够长的时间。",
    suggestTakenByOtherPlans: "其他计划已占用了所有目标。",
    suggestTakenByOtherPlansDetail:
      "已在当夜另一个同类型（摄影或目视）计划中的目标，不会再次推荐。从那个计划中移除后，才会在这里推荐。",
    suggestTimelineLabel: "夜间安排的已勾选目标：{items}。",
    suggestUnticked: "{name}未勾选",
    suggestFree: "{from}至{to}空闲",
    suggestPlaceEquipment: "地点与设备",
    autoFillLater: "之后仍可修改全部内容。",
    autoFillCancel: "取消",
    autoFillClose: "关闭",
    autoFillLegendFree: "空闲",
  },
  "zh-Hant": {
    suggestAction: "推薦最佳目標",
    suggestTitle: "推薦的目標",
    suggestContext: "{place} · {date}之夜",
    suggestPhotoMode: "與計畫相同的攝影模式",
    suggestVisualMode: "與計畫相同的目視模式",
    suggestChange: "更改",
    suggestChangeHint: "更改地點或器材",
    suggestHowMany: "多少個目標？",
    suggestCountLabel: "目標數量",
    suggestAll: "整夜",
    suggestOther: "其他",
    suggestCustom: "多少個？",
    suggestLess: "減少一個目標",
    suggestMore: "增加一個目標",
    suggestEstimatePhoto:
      "{count, plural, other{大約{count}個時段，每個{duration}。}}",
    suggestEstimateVisual:
      "{count, plural, other{大約{count}個時段，每個20分鐘。}}",
    suggestEstimateHint: "數量如何估算",
    suggestEstimateDetailPhoto: "夜間空閒{free}，每個目標約{duration}。",
    suggestEstimateDetailVisual: "夜間空閒{free}，每個目標20分鐘。",
    suggestPlacement: "安排",
    suggestPlacementLabel: "目標安排方式",
    suggestPlacementIdeal: "最佳",
    suggestPlacementChained: "緊湊",
    suggestPlacementIdealHelp: "每個目標都在最佳時刻。",
    suggestPlacementChainedHelp: "每個目標接在前一個之後。",
    suggestPlacementHint: "目標如何安排",
    suggestPlacementDetail:
      "最佳：每個目標都安排在最適合的時段，必要時中間需要等待。緊湊：從第一個時段起依序排列；每次由目前可見、評分最高的目標接上，兩個目標之間的等待從不超過10分鐘。若沒有目標能接上，清單就此結束。",
    suggestShortfall: "請求{requested}個，夜間可容納{placed}個",
    suggestSearching: "正在尋找{count}個目標…",
    suggestSearchingOne: "正在尋找1個目標…",
    suggestWhy: "為什麼不是{count}個",
    suggestAfterDew: "{time}之後可能結露，沒有合適的目標。",
    suggestAfterClouds: "{time}之後有雲，沒有合適的目標。",
    suggestAfterMoon: "{time}之後月亮升起，沒有合適的目標。",
    suggestAfterNoFollower:
      "{time}之後，沒有目標能在{minutes}分鐘內接上前一個。",
    suggestNoAltitude: "沒有其他目標高於最低高度。",
    suggestTooShort: "剩餘空閒時間不足以容納一個目標。",
    suggestExhausted: "今晚沒有其他可推薦的目標。",
    suggestContinue: "待繼續",
    suggestNightOrder: "按夜間順序",
    suggestProgress: "{goal}中的{acquired} · 多夜計畫 {name}",
    suggestExcludeCaptured: "排除已完成的目標",
    suggestComfort: "舒適度",
    suggestComfortAny: "不限制",
    suggestComfortEasy: "舒適觀測",
    suggestComfortLabel: "觀測舒適度",
    suggestComfortRefractor: "折射鏡：高於{max}°時，目鏡很難搆到。",
    suggestComfortRearEyepiece: "後置目鏡：高於{max}°時，很難搆到。",
    suggestComfortNewtonianAltaz: "多布森牛頓鏡：低於{min}°時，目鏡太低。",
    suggestComfortNewtonianEquatorial:
      "赤道儀牛頓鏡：{min}°到{max}°之間，目鏡都容易搆到。",
    suggestComfortBinoculars: "雙筒望遠鏡：高於{max}°時，脖子很快會累。",
    suggestCapturedPhoto: "{name}已於{date}拍攝，被排除。",
    suggestCapturedVisual: "{name}已於{date}觀測，被排除。",
    suggestCapturedManyPhoto: "已排除{count}個拍攝過的目標。",
    suggestCapturedManyVisual: "已排除{count}個觀測過的目標。",
    suggestPreviousPhotoWorse: "{name}已於{date}在比今晚更差的天空下拍攝。",
    suggestPreviousPhotoSame: "{name}已於{date}在與今晚相當的天空下拍攝。",
    suggestPreviousPhotoBetter: "{name}已於{date}在比今晚更好的天空下拍攝。",
    suggestPreviousPhotoDate: "{name}已於{date}拍攝。",
    suggestAlreadyInPlan: "已在此計畫中：將在時間軸中再加入一次。",
    suggestPreviousVisualWorse: "{name}已於{date}在比今晚更差的天空下觀測。",
    suggestPreviousVisualSame: "{name}已於{date}在與今晚相當的天空下觀測。",
    suggestPreviousVisualBetter: "{name}已於{date}在比今晚更好的天空下觀測。",
    suggestPreviousVisualDate: "{name}已於{date}觀測。",
    suggestPosition: "推薦{from}至{to}",
    suggestRank: "{rank}",
    suggestLower: "較低分數：推薦{from}至{to}",
    suggestOthers: "其他建議",
    suggestBest: "返回最佳目標",
    suggestReplacement: "勾選的目標保留，其他目標替換為排名中接下來的目標。",
    suggestAllTicked: "全部已勾選：取消勾選一個目標以替換。",
    suggestApply: "將{count}個目標加入計畫",
    suggestApplyOne: "將1個目標加入計畫",
    suggestNightEnding: "夜晚將在{duration}後結束：不夠放下一個目標。",
    suggestNightShort: "這一夜只有{duration}：不夠放下一個目標。",
    suggestNextNight: "為{date}之夜推薦目標",
    suggestPlanFull: "夜間的空閒時間已被占滿。",
    suggestPlanFullDetail:
      "一個目標至少需要{minimum}。請移除或移動計畫中的一個目標來騰出時間。",
    suggestOpenPlan: "打開計畫",
    suggestOpenPlans: "查看當夜的計畫",
    suggestNoTarget: "沒有適合這一夜的目標。",
    suggestNoTargetDetail:
      "月亮、地平線或最低高度使任何目標都無法被看到足夠長的時間。",
    suggestTakenByOtherPlans: "其他計畫已占用了所有目標。",
    suggestTakenByOtherPlansDetail:
      "已在當夜另一個同類型（攝影或目視）計畫中的目標，不會再次推薦。從那個計畫中移除後，才會在這裡推薦。",
    suggestTimelineLabel: "夜間安排的已勾選目標：{items}。",
    suggestUnticked: "{name}未勾選",
    suggestFree: "{from}至{to}空閒",
    suggestPlaceEquipment: "地點與器材",
    autoFillLater: "之後仍可修改所有內容。",
    autoFillCancel: "取消",
    autoFillClose: "關閉",
    autoFillLegendFree: "空檔",
  },
};

export function suggestMessage(locale, key, values = {}) {
  const text = copyFor(
    suggestionMessages,
    locale === "zh" ? "zh-Hans" : locale,
    "suggest-messages.suggestionMessages",
  )[key];
  if (typeof text !== "string")
    throw new Error(`Unknown suggestion message: ${key}`);
  return pluralBranch(locale, text, values.count).replace(
    /\{(\w+)\}/g,
    (_, name) => String(values[name] ?? `{${name}}`),
  );
}

/**
 * The sentences that count ("About 1 slot" / "About 3 slots") are
 * ICU \`{count, plural, one{…} other{…}}\` messages; the branch is the language's own plural category
 * (\`Intl.PluralRules\`: Russian's one, few, many), an exact \`=N\` branch
 * first. A message that is not a plural is returned as it is.
 */
function pluralBranch(locale, text, count) {
  const head = /^\{count,\s*plural,/.exec(text);
  if (!head || !Number.isFinite(Number(count))) return text;
  const branches = [
    ...text
      .slice(head[0].length)
      .matchAll(
        /(=\d+|zero|one|two|few|many|other)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g,
      ),
  ];
  let category = "other";
  try {
    category = new Intl.PluralRules(
      locale === "zh" ? "zh-Hans" : locale,
    ).select(Number(count));
  } catch {
    category = "other";
  }
  const chosen =
    branches.find(([, name]) => name === `=${Number(count)}`) ||
    branches.find(([, name]) => name === category) ||
    branches.find(([, name]) => name === "other");
  return chosen ? chosen[2] : text;
}
