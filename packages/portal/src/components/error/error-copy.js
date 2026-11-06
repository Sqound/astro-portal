import { copyFor } from "astro-contracts/locales";

/**
 * The words of the page shown when a page of the application fails while it
 * draws: the framework's own page said « This
 * page couldn’t load » in English, with « Reload » and « Back » and nothing
 * else, on a private portal whose planner then stayed out of reach. This one
 * says what happened and that the data is safe, offers to try again, and --
 * after a warning -- to reset what the browser keeps for the planner (its
 * copy of the plans, its view settings), which is what a page that dies on a
 * saved value needs. Formal address in French.
 */
export const errorPageCopy = {
  en: {
    title: "This page could not be displayed",
    body: "Something went wrong while drawing this page. Nothing was lost: your plans, places and journal are kept in your space. Try again; if the page still fails, reset what this browser keeps for the planner.",
    retry: "Try again",
    home: "Back to the home page",
    reset: "Reset this browser’s copy",
    resetWarning:
      "This removes the planner’s settings and any plan that only this browser holds. What is saved in your space stays.",
    resetConfirm: "Reset and reload",
    cancel: "Cancel",
    detail: "Technical detail",
  },
  fr: {
    title: "Cette page n’a pas pu s’afficher",
    body: "Un incident est survenu pendant l’affichage de cette page. Rien n’est perdu : vos plans, vos lieux et votre journal sont conservés dans votre espace. Réessayez ; si la page échoue encore, remettez à zéro ce que ce navigateur garde pour le planificateur.",
    retry: "Réessayer",
    home: "Retour à l’accueil",
    reset: "Remettre à zéro la copie de ce navigateur",
    resetWarning:
      "Cela efface les réglages du planificateur et les plans que seul ce navigateur détient. Ce qui est enregistré dans votre espace reste en place.",
    resetConfirm: "Remettre à zéro et recharger",
    cancel: "Annuler",
    detail: "Détail technique",
  },
  ja: {
    title: "このページを表示できませんでした",
    body: "ページの表示中に問題が起きました。データは失われていません。プラン、場所、記録はスペースに保存されています。もう一度お試しください。それでも表示されない場合は、このブラウザーが保持しているプランナーのコピーをリセットしてください。",
    retry: "再試行",
    home: "ホームに戻る",
    reset: "このブラウザーのコピーをリセット",
    resetWarning:
      "プランナーの設定と、このブラウザーだけが保持しているプランが削除されます。スペースに保存されている内容はそのまま残ります。",
    resetConfirm: "リセットして再読み込み",
    cancel: "キャンセル",
    detail: "技術的な詳細",
  },
  de: {
    title: "Diese Seite konnte nicht angezeigt werden",
    body: "Beim Aufbau dieser Seite ist etwas schiefgegangen. Es ist nichts verloren: Deine Pläne, Orte und dein Journal liegen in deinem Bereich. Versuche es erneut; wenn die Seite weiterhin fehlschlägt, setze zurück, was dieser Browser für den Planer speichert.",
    retry: "Erneut versuchen",
    home: "Zurück zur Startseite",
    reset: "Kopie dieses Browsers zurücksetzen",
    resetWarning:
      "Dadurch werden die Einstellungen des Planers und alle Pläne entfernt, die nur dieser Browser hält. Was in deinem Bereich gespeichert ist, bleibt erhalten.",
    resetConfirm: "Zurücksetzen und neu laden",
    cancel: "Abbrechen",
    detail: "Technische Details",
  },
  es: {
    title: "No se pudo mostrar esta página",
    body: "Algo salió mal al mostrar esta página. No se ha perdido nada: tus planes, tus lugares y tu diario se conservan en tu espacio. Inténtalo de nuevo; si la página sigue fallando, restablece lo que este navegador guarda para el planificador.",
    retry: "Reintentar",
    home: "Volver al inicio",
    reset: "Restablecer la copia de este navegador",
    resetWarning:
      "Esto elimina los ajustes del planificador y los planes que solo guarda este navegador. Lo que está guardado en tu espacio permanece.",
    resetConfirm: "Restablecer y recargar",
    cancel: "Cancelar",
    detail: "Detalle técnico",
  },
  it: {
    title: "Non è stato possibile mostrare questa pagina",
    body: "Qualcosa è andato storto durante la visualizzazione della pagina. Non è andato perso nulla: i tuoi piani, luoghi e il diario sono conservati nel tuo spazio. Riprova; se la pagina continua a non funzionare, azzera ciò che questo browser conserva per il pianificatore.",
    retry: "Riprova",
    home: "Torna alla pagina iniziale",
    reset: "Azzera la copia di questo browser",
    resetWarning:
      "Questo rimuove le impostazioni del pianificatore e i piani che solo questo browser conserva. Ciò che è salvato nel tuo spazio resta.",
    resetConfirm: "Azzera e ricarica",
    cancel: "Annulla",
    detail: "Dettaglio tecnico",
  },
  "pt-BR": {
    title: "Não foi possível exibir esta página",
    body: "Algo deu errado ao exibir esta página. Nada foi perdido: seus planos, locais e diário ficam guardados no seu espaço. Tente novamente; se a página continuar falhando, redefina o que este navegador guarda para o planejador.",
    retry: "Tentar novamente",
    home: "Voltar ao início",
    reset: "Redefinir a cópia deste navegador",
    resetWarning:
      "Isso remove as configurações do planejador e os planos que só este navegador guarda. O que está salvo no seu espaço permanece.",
    resetConfirm: "Redefinir e recarregar",
    cancel: "Cancelar",
    detail: "Detalhe técnico",
  },
  ru: {
    title: "Не удалось показать эту страницу",
    body: "При отображении страницы что-то пошло не так. Ничего не потеряно: ваши планы, места и журнал хранятся в вашем пространстве. Попробуйте ещё раз; если страница по-прежнему не открывается, сбросьте то, что этот браузер хранит для планировщика.",
    retry: "Повторить",
    home: "На главную",
    reset: "Сбросить копию этого браузера",
    resetWarning:
      "Будут удалены настройки планировщика и планы, которые есть только в этом браузере. Всё, что сохранено в вашем пространстве, останется.",
    resetConfirm: "Сбросить и перезагрузить",
    cancel: "Отмена",
    detail: "Технические подробности",
  },
  "zh-Hans": {
    title: "无法显示此页面",
    body: "显示此页面时出了问题。数据没有丢失：你的计划、地点和日志都保存在你的空间里。请重试；如果页面仍然出错，请重置此浏览器为规划器保存的内容。",
    retry: "重试",
    home: "返回首页",
    reset: "重置此浏览器的副本",
    resetWarning:
      "这会删除规划器的设置，以及只保存在此浏览器中的计划。保存在你空间里的内容不受影响。",
    resetConfirm: "重置并重新加载",
    cancel: "取消",
    detail: "技术详情",
  },
  "zh-Hant": {
    title: "無法顯示此頁面",
    body: "顯示此頁面時發生問題。資料沒有遺失：你的計畫、地點與日誌都保存在你的空間裡。請重試；若頁面仍然出錯，請重設此瀏覽器為規劃器保存的內容。",
    retry: "重試",
    home: "回到首頁",
    reset: "重設此瀏覽器的副本",
    resetWarning:
      "這會刪除規劃器的設定，以及只保存在此瀏覽器中的計畫。保存在你空間裡的內容不受影響。",
    resetConfirm: "重設並重新載入",
    cancel: "取消",
    detail: "技術詳情",
  },
};

export const errorPageCopyFor = (locale) =>
  copyFor(errorPageCopy, locale, "errorPageCopy");
