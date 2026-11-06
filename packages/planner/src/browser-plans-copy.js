// The words of the plans made in a browser without a space, when the person
// signs in to a space: the question, its two answers, what says that the
// plans were taken, and the plans that stay in the browser.
//
// The place is said as the web says it — "dans ce navigateur". The vocabulary
// is the space's: where spaces exist "votre espace", on a private server —
// where there is no space, the person signs in to their own portal — "votre
// portail". The note of a plan the
// profile has no room for is the core's neutral one (`HELD_COPY`); a shell
// that sells the room says it in the words of its offers (`planner.offers`).
import { copyFor } from "portal/locales.js";
import { HELD_COPY } from "./capability-gates.js";

const COPY = {
  fr: {
    title: "Plans de ce navigateur",
    question: {
      one: "Vous avez un plan dans ce navigateur. L’ajouter à votre {where} ?",
      many: "Vous avez {count} plans dans ce navigateur. Les ajouter à votre {where} ?",
    },
    help: {
      one: "Il a été fait {without}. Laissé dans ce navigateur, il reste hors de votre {where} et revient quand vous vous déconnectez de ce navigateur.",
      many: "Ils ont été faits {without}. Laissés dans ce navigateur, ils restent hors de votre {where} et reviennent quand vous vous déconnectez de ce navigateur.",
    },
    without: { hosted: "sans espace", private: "sans connexion" },
    add: { one: "L’ajouter", many: "Les ajouter" },
    leave: {
      one: "Le laisser dans ce navigateur",
      many: "Les laisser dans ce navigateur",
    },
    carried: {
      one: "1 plan de ce navigateur a été ajouté à votre {where}.",
      many: "{count} plans de ce navigateur ont été ajoutés à votre {where}.",
    },
    left: {
      one: "1 plan reste dans ce navigateur, non synchronisé.",
      many: "{count} plans restent dans ce navigateur, non synchronisés.",
    },
    failed:
      "Les plans n’ont pas pu être ajoutés à votre {where}. Ils restent dans ce navigateur ; réessayez.",
    waiting:
      "Ce plan reste dans ce navigateur : il n’est pas encore dans votre {where}.",
    badge: "Non synchronisé",
    retry: "Réessayer",
    close: "Fermer",
    hosted: "espace",
    private: "portail",
  },
  en: {
    title: "Plans in this browser",
    question: {
      one: "You have one plan in this browser. Add it to your {where}?",
      many: "You have {count} plans in this browser. Add them to your {where}?",
    },
    help: {
      one: "It was made {without}. Left in this browser, it stays out of your {where} and comes back when you sign out of this browser.",
      many: "They were made {without}. Left in this browser, they stay out of your {where} and come back when you sign out of this browser.",
    },
    without: { hosted: "without a space", private: "without signing in" },
    add: { one: "Add it", many: "Add them" },
    leave: {
      one: "Leave it in this browser",
      many: "Leave them in this browser",
    },
    carried: {
      one: "1 plan from this browser was added to your {where}.",
      many: "{count} plans from this browser were added to your {where}.",
    },
    left: {
      one: "1 plan stays in this browser, not synced.",
      many: "{count} plans stay in this browser, not synced.",
    },
    failed:
      "The plans could not be added to your {where}. They stay in this browser; try again.",
    waiting: "This plan stays in this browser: it is not in your {where} yet.",
    badge: "Not synced",
    retry: "Try again",
    close: "Close",
    hosted: "space",
    private: "portal",
  },
  ja: {
    title: "このブラウザーのプラン",
    question: {
      one: "このブラウザーに1件のプランがあります。{where}に追加しますか？",
      many: "このブラウザーに{count}件のプランがあります。{where}に追加しますか？",
    },
    help: {
      one: "{without}作成したプランです。このブラウザーに残した場合は{where}の外に置かれ、このブラウザーからサインアウトすると元どおり表示されます。",
      many: "{without}作成したプランです。このブラウザーに残した場合は{where}の外に置かれ、このブラウザーからサインアウトすると元どおり表示されます。",
    },
    without: { hosted: "スペースなしで", private: "サインインせずに" },
    add: { one: "追加する", many: "追加する" },
    leave: {
      one: "このブラウザーに残す",
      many: "このブラウザーに残す",
    },
    carried: {
      one: "このブラウザーのプラン1件を{where}に追加しました。",
      many: "このブラウザーのプラン{count}件を{where}に追加しました。",
    },
    left: {
      one: "プラン1件はこのブラウザーに残り、同期されていません。",
      many: "プラン{count}件はこのブラウザーに残り、同期されていません。",
    },
    failed:
      "プランを{where}に追加できませんでした。このブラウザーに残っています。もう一度お試しください。",
    waiting:
      "このプランはこのブラウザーに残っています。まだ{where}には入っていません。",
    badge: "同期されていません",
    retry: "再試行",
    close: "閉じる",
    hosted: "スペース",
    private: "ポータル",
  },
  de: {
    title: "Pläne in diesem Browser",
    question: {
      one: "Du hast einen Plan in diesem Browser. Zu deinem {where} hinzufügen?",
      many: "Du hast {count} Pläne in diesem Browser. Zu deinem {where} hinzufügen?",
    },
    help: {
      one: "Er wurde {without} erstellt. Wenn er in diesem Browser bleibt, bleibt er außerhalb deines {where}s und kommt zurück, wenn du dich in diesem Browser abmeldest.",
      many: "Sie wurden {without} erstellt. Wenn sie in diesem Browser bleiben, bleiben sie außerhalb deines {where}s und kommen zurück, wenn du dich in diesem Browser abmeldest.",
    },
    without: { hosted: "ohne Bereich", private: "ohne Anmeldung" },
    add: { one: "Hinzufügen", many: "Alle hinzufügen" },
    leave: {
      one: "In diesem Browser lassen",
      many: "In diesem Browser lassen",
    },
    carried: {
      one: "1 Plan aus diesem Browser wurde zu deinem {where} hinzugefügt.",
      many: "{count} Pläne aus diesem Browser wurden zu deinem {where} hinzugefügt.",
    },
    left: {
      one: "1 Plan bleibt in diesem Browser, nicht synchronisiert.",
      many: "{count} Pläne bleiben in diesem Browser, nicht synchronisiert.",
    },
    failed:
      "Die Pläne konnten nicht zu deinem {where} hinzugefügt werden. Sie bleiben in diesem Browser; versuche es erneut.",
    waiting:
      "Dieser Plan bleibt in diesem Browser: Er ist noch nicht in deinem {where}.",
    badge: "Nicht synchronisiert",
    retry: "Erneut versuchen",
    close: "Schließen",
    hosted: "Bereich",
    private: "Portal",
  },
  es: {
    title: "Planes de este navegador",
    question: {
      one: "Tienes un plan en este navegador. ¿Agregarlo a tu {where}?",
      many: "Tienes {count} planes en este navegador. ¿Agregarlos a tu {where}?",
    },
    help: {
      one: "Se creó {without}. Si se deja en este navegador, queda fuera de tu {where} y vuelve cuando cierres sesión en este navegador.",
      many: "Se crearon {without}. Si se dejan en este navegador, quedan fuera de tu {where} y vuelven cuando cierres sesión en este navegador.",
    },
    without: { hosted: "sin un espacio", private: "sin iniciar sesión" },
    add: { one: "Agregarlo", many: "Agregarlos" },
    leave: {
      one: "Dejarlo en este navegador",
      many: "Dejarlos en este navegador",
    },
    carried: {
      one: "Se agregó 1 plan de este navegador a tu {where}.",
      many: "Se agregaron {count} planes de este navegador a tu {where}.",
    },
    left: {
      one: "1 plan permanece en este navegador, sin sincronizar.",
      many: "{count} planes permanecen en este navegador, sin sincronizar.",
    },
    failed:
      "No se pudieron agregar los planes a tu {where}. Permanecen en este navegador; inténtalo de nuevo.",
    waiting:
      "Este plan permanece en este navegador: todavía no está en tu {where}.",
    badge: "Sin sincronizar",
    retry: "Reintentar",
    close: "Cerrar",
    hosted: "espacio",
    private: "portal",
  },
  it: {
    title: "Piani di questo browser",
    question: {
      hosted: {
        one: "In questo browser c’è un piano. Aggiungerlo allo spazio?",
        many: "In questo browser ci sono {count} piani. Aggiungerli allo spazio?",
      },
      private: {
        one: "In questo browser c’è un piano. Aggiungerlo al portale?",
        many: "In questo browser ci sono {count} piani. Aggiungerli al portale?",
      },
    },
    help: {
      hosted: {
        one: "È stato creato {without}. Se resta in questo browser, rimane fuori dallo spazio e ritorna quando ci si disconnette da questo browser.",
        many: "Sono stati creati {without}. Se restano in questo browser, rimangono fuori dallo spazio e ritornano quando ci si disconnette da questo browser.",
      },
      private: {
        one: "È stato creato {without}. Se resta in questo browser, rimane fuori dal portale e ritorna quando ci si disconnette da questo browser.",
        many: "Sono stati creati {without}. Se restano in questo browser, rimangono fuori dal portale e ritornano quando ci si disconnette da questo browser.",
      },
    },
    without: { hosted: "senza spazio", private: "senza accedere" },
    add: { one: "Aggiungerlo", many: "Aggiungerli" },
    leave: {
      one: "Lasciarlo in questo browser",
      many: "Lasciarli in questo browser",
    },
    carried: {
      hosted: {
        one: "1 piano di questo browser è stato aggiunto allo spazio.",
        many: "{count} piani di questo browser sono stati aggiunti allo spazio.",
      },
      private: {
        one: "1 piano di questo browser è stato aggiunto al portale.",
        many: "{count} piani di questo browser sono stati aggiunti al portale.",
      },
    },
    left: {
      one: "1 piano resta in questo browser, non sincronizzato.",
      many: "{count} piani restano in questo browser, non sincronizzati.",
    },
    failed: {
      hosted:
        "Non è stato possibile aggiungere i piani allo spazio. Restano in questo browser; riprova.",
      private:
        "Non è stato possibile aggiungere i piani al portale. Restano in questo browser; riprova.",
    },
    waiting: {
      hosted:
        "Questo piano resta in questo browser: non è ancora nello spazio.",
      private:
        "Questo piano resta in questo browser: non è ancora nel portale.",
    },
    badge: "Non sincronizzato",
    retry: "Riprovare",
    close: "Chiudere",
    hosted: "spazio",
    private: "portale",
  },
  "pt-BR": {
    title: "Planos deste navegador",
    question: {
      one: "Você tem um plano neste navegador. Adicioná-lo ao seu {where}?",
      many: "Você tem {count} planos neste navegador. Adicioná-los ao seu {where}?",
    },
    help: {
      one: "Ele foi feito {without}. Se ficar neste navegador, permanece fora do seu {where} e volta quando você sair deste navegador.",
      many: "Eles foram feitos {without}. Se ficarem neste navegador, permanecem fora do seu {where} e voltam quando você sair deste navegador.",
    },
    without: { hosted: "sem espaço", private: "sem fazer login" },
    add: { one: "Adicioná-lo", many: "Adicioná-los" },
    leave: {
      one: "Deixá-lo neste navegador",
      many: "Deixá-los neste navegador",
    },
    carried: {
      one: "1 plano deste navegador foi adicionado ao seu {where}.",
      many: "{count} planos deste navegador foram adicionados ao seu {where}.",
    },
    left: {
      one: "1 plano permanece neste navegador, não sincronizado.",
      many: "{count} planos permanecem neste navegador, não sincronizados.",
    },
    failed:
      "Não foi possível adicionar os planos ao seu {where}. Eles continuam neste navegador; tente novamente.",
    waiting:
      "Este plano permanece neste navegador: ainda não está no seu {where}.",
    badge: "Não sincronizado",
    retry: "Tentar novamente",
    close: "Fechar",
    hosted: "espaço",
    private: "portal",
  },
  "zh-Hans": {
    title: "此浏览器中的计划",
    question: {
      one: "此浏览器上有1个计划。要添加到你的{where}吗？",
      many: "此浏览器上有{count}个计划。要全部添加到你的{where}吗？",
    },
    help: {
      one: "它是在{without}的情况下制作的。如果保留在此浏览器上，它将不在你的{where}中，并会在退出此浏览器的登录后回到此处。",
      many: "它们是在{without}的情况下制作的。如果保留在此浏览器上，它们将不在你的{where}中，并会在退出此浏览器的登录后回到此处。",
    },
    without: { hosted: "没有空间", private: "未登录" },
    add: { one: "添加", many: "全部添加" },
    leave: {
      one: "保留在此浏览器上",
      many: "全部保留在此浏览器上",
    },
    carried: {
      one: "此浏览器中的1个计划已添加到你的{where}。",
      many: "此浏览器中的{count}个计划已添加到你的{where}。",
    },
    left: {
      one: "1个计划仍保留在此浏览器中，尚未同步。",
      many: "{count}个计划仍保留在此浏览器中，尚未同步。",
    },
    failed: "计划未能添加到你的{where}。它们仍保留在此浏览器上；请重试。",
    waiting: "此计划仍保留在此浏览器中：尚未进入你的{where}。",
    badge: "未同步",
    retry: "重试",
    close: "关闭",
    hosted: "空间",
    private: "门户",
  },
  "zh-Hant": {
    title: "此瀏覽器中的計畫",
    question: {
      one: "此瀏覽器上有一個計畫。要將它加入你的{where}嗎？",
      many: "此瀏覽器上有 {count} 個計畫。要將它們加入你的{where}嗎？",
    },
    help: {
      one: "此計畫是在{without}的情況下建立的。若留在此瀏覽器上，將不屬於你的{where}，並會在登出此瀏覽器後重新出現。",
      many: "這些計畫是在{without}的情況下建立的。若留在此瀏覽器上，將不屬於你的{where}，並會在登出此瀏覽器後重新出現。",
    },
    without: { hosted: "未使用空間", private: "未登入" },
    add: { one: "加入", many: "全部加入" },
    leave: {
      one: "留在此瀏覽器上",
      many: "全部留在此瀏覽器上",
    },
    carried: {
      one: "此瀏覽器中的 1 個計畫已新增至你的{where}。",
      many: "此瀏覽器中的 {count} 個計畫已新增至你的{where}。",
    },
    left: {
      one: "1 個計畫仍保留在此瀏覽器中，尚未同步。",
      many: "{count} 個計畫仍保留在此瀏覽器中，尚未同步。",
    },
    failed: "無法將計畫加入你的{where}。計畫仍保留在此瀏覽器上；請再試一次。",
    waiting: "此計畫仍保留在此瀏覽器中：尚未進入你的{where}。",
    badge: "未同步",
    retry: "再試一次",
    close: "關閉",
    hosted: "空間",
    private: "入口網站",
  },
  // Russian counts in three forms (`few` for 2–4, 22–24…); `one` and `many`
  // stay the English pair for the sentences that do not name the count.
  ru: {
    title: "Планы в этом браузере",
    question: {
      one: "У вас в этом браузере {count} план. Добавить его в {where}?",
      few: "У вас в этом браузере {count} плана. Добавить их в {where}?",
      many: "У вас в этом браузере {count} планов. Добавить их в {where}?",
    },
    help: {
      one: "Он создан {without}. Если оставить его в этом браузере, он останется вне {whereGenitive} и вернётся, когда вы выйдете из этого браузера.",
      few: "Они созданы {without}. Если оставить их в этом браузере, они останутся вне {whereGenitive} и вернутся, когда вы выйдете из этого браузера.",
      many: "Они созданы {without}. Если оставить их в этом браузере, они останутся вне {whereGenitive} и вернутся, когда вы выйдете из этого браузера.",
    },
    without: { hosted: "без пространства", private: "без входа" },
    add: { one: "Добавить его", few: "Добавить их", many: "Добавить их" },
    leave: {
      one: "Оставить его в этом браузере",
      few: "Оставить их в этом браузере",
      many: "Оставить их в этом браузере",
    },
    carried: {
      one: "{count} план из этого браузера добавлен в {where}.",
      few: "{count} плана из этого браузера добавлены в {where}.",
      many: "{count} планов из этого браузера добавлено в {where}.",
    },
    left: {
      one: "{count} план остаётся в этом браузере и не синхронизирован.",
      few: "{count} плана остаются в этом браузере и не синхронизированы.",
      many: "{count} планов остаются в этом браузере и не синхронизированы.",
    },
    failed:
      "Не удалось добавить планы в {where}. Они остаются в этом браузере; повторите попытку.",
    waiting: "Этот план остаётся в этом браузере и пока не добавлен в {where}.",
    badge: "Не синхронизировано",
    retry: "Повторить",
    close: "Закрыть",
    hosted: "ваше пространство",
    private: "ваш портал",
    hostedGenitive: "вашего пространства",
    privateGenitive: "вашего портала",
  },
};

export const BROWSER_PLANS_COPY = COPY;

/**
 * Which form of a counted sentence: `one` for exactly one and `many` for the
 * rest, except where the language gave a `few` form (Russian: 2–4, 22–24…,
 * and `one` then also covers 21, 31…).
 */
function countForm(entry, count) {
  if (!entry.few) return count === 1 ? "one" : "many";
  const units = count % 10;
  const tens = count % 100;
  if (units === 1 && tens !== 11) return "one";
  if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) return "few";
  return "many";
}

/**
 * The words, for a language and a service. The sentences that count plans are
 * functions of the count. `held` is the note of a plan the profile has no room
 * for, in the core's neutral words (`HELD_COPY`).
 */
export function browserPlansCopy(locale, { hosted = true } = {}) {
  const language = copyFor(COPY, locale, "browser-plans-copy.COPY");
  const kind = hosted ? "hosted" : "private";
  // A sentence whose article or preposition follows the noun (Italian
  // "allo spazio", "al portale") holds one version per service.
  const pick = (entry) =>
    entry &&
    typeof entry === "object" &&
    "hosted" in entry &&
    "private" in entry
      ? entry[kind]
      : entry;
  const fill = (text, count = 1) =>
    text
      .replaceAll("{where}", language[kind])
      .replaceAll(
        "{whereGenitive}",
        language[`${kind}Genitive`] ?? language[kind],
      )
      .replaceAll("{without}", language.without[kind])
      .replaceAll("{count}", String(count));
  const counted = (entry) => (count) => {
    const forms = pick(entry);
    return fill(forms[countForm(forms, count)], count);
  };
  const held = copyFor(HELD_COPY, locale, "browser-plans-copy.HELD_COPY");
  return {
    title: language.title,
    question: counted(language.question),
    help: counted(language.help),
    add: counted(language.add),
    leave: counted(language.leave),
    carried: counted(language.carried),
    left: counted(language.left),
    failed: fill(pick(language.failed)),
    waiting: fill(pick(language.waiting)),
    held: held.browserPlanHeld,
    badge: language.badge,
    retry: language.retry,
    close: language.close,
  };
}
