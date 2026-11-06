import { copyFor } from "astro-contracts/locales";
import { hostedCopy } from "./hosted-copy.js";

/**
 * The words of the tab « Galerie privée » of « Mon espace ». The French
 * wording is fixed to the character — an ordinary space before « : » and
 * « ? »; the other languages say the same thing in the register of their
 * catalogue. « Galerie privée » names the gallery; « portail » never does.
 * The modes are written in the feminine of « galerie ».
 *
 * Written after the nearest existing words: `loading`, `loadFailed`,
 * `changeFailed` (the analogues of the tab « Captures »).
 */
const fr = {
  title: "Galerie privée",
  infoLabel: "La galerie privée",
  help: "Vos captures, privées et publiques, à une adresse que vous seul choisissez de donner.",
  addressLabel: "Adresse de la galerie",
  copyAddress: "Copier",
  openAddress: "Ouvrir",
  regenerate: "Générer une nouvelle adresse",
  optional: "· facultatif",
  publicNameLabel: "Nom public",
  publicNameHelp:
    "Signe vos captures publiques. Vide : « Un utilisateur d’Astro Portal ».",
  portalNameLabel: "Nom de votre galerie privée",
  portalNameHelp: "Le titre de votre galerie. Vide : « Galerie privée ».",
  saveNames: "Enregistrer les noms",
  whoTitle: "Qui peut voir cette galerie ?",
  modes: {
    none: "Partagée avec personne",
    link: "Accessible à tous par son adresse",
  },
  modeHelp: {
    none: "Vous seul la voyez, connecté à votre espace.",
    link: "Toute personne qui a l’adresse voit vos captures, privées et publiques.",
  },
  noIndex: "Les moteurs de recherche n’indexent jamais cette galerie.",
  linkTitle: "Rendre cette galerie accessible à tous ?",
  linkBody:
    "Toute personne qui a l’adresse verra vos captures, privées et publiques.",
  linkConfirm: "Rendre accessible à tous",
  regenerateTitle: "Générer une nouvelle adresse ?",
  regenerateBody: "L’ancienne adresse cesse de fonctionner tout de suite.",
  regenerateConfirm: "Générer une nouvelle adresse",
  cancel: "Annuler",
  close: "Fermer",
  loading: "Chargement de votre galerie privée…",
  loadFailed: "Votre galerie privée n’a pas pu être lue. Réessayez plus tard.",
  changeFailed: "La galerie n’a pas pu être modifiée. Réessayez plus tard.",
  retry: "Réessayer",
};

const en = {
  title: "Private gallery",
  infoLabel: "The private gallery",
  help: "Your captures, private and public, at an address only you choose to give.",
  addressLabel: "Gallery address",
  copyAddress: "Copy",
  openAddress: "Open",
  regenerate: "Generate a new address",
  optional: "· optional",
  publicNameLabel: "Public name",
  publicNameHelp: "Signs your public captures. Empty: “An Astro Portal user”.",
  portalNameLabel: "Name of your private gallery",
  portalNameHelp: "The title of your gallery. Empty: “Private gallery”.",
  saveNames: "Save the names",
  whoTitle: "Who can see this gallery?",
  modes: {
    none: "Shared with nobody",
    link: "Open to anyone with its address",
  },
  modeHelp: {
    none: "Only you see it, signed in to your space.",
    link: "Anyone who has the address sees your captures, private and public.",
  },
  noIndex: "Search engines never index this gallery.",
  linkTitle: "Open this gallery to anyone?",
  linkBody:
    "Anyone who has the address will see your captures, private and public.",
  linkConfirm: "Open to anyone",
  regenerateTitle: "Generate a new address?",
  regenerateBody: "The old address stops working at once.",
  regenerateConfirm: "Generate a new address",
  cancel: "Cancel",
  close: "Close",
  loading: "Loading your private gallery…",
  loadFailed: "Your private gallery could not be read. Try again later.",
  changeFailed: "The gallery could not be changed. Try again later.",
  retry: "Try again",
};

const ja = {
  title: "プライベートギャラリー",
  infoLabel: "プライベートギャラリーについて",
  help: "非公開と公開のキャプチャを、渡すと決めた人だけが知るアドレスで見せます。",
  addressLabel: "ギャラリーのアドレス",
  copyAddress: "コピー",
  openAddress: "開く",
  regenerate: "新しいアドレスを作成",
  optional: "・任意",
  publicNameLabel: "公開名",
  publicNameHelp:
    "公開キャプチャの署名になります。空欄の場合：「Astro Portal のユーザー」。",
  portalNameLabel: "プライベートギャラリーの名前",
  portalNameHelp:
    "ギャラリーのタイトルです。空欄の場合：「プライベートギャラリー」。",
  saveNames: "名前を保存",
  whoTitle: "このギャラリーを見られる人",
  modes: {
    none: "誰とも共有しない",
    link: "アドレスを知っている人なら誰でも",
  },
  modeHelp: {
    none: "自分のスペースにサインインしたときだけ見られます。",
    link: "アドレスを知っている人は誰でも、非公開と公開のキャプチャを見られます。",
  },
  noIndex: "このギャラリーが検索エンジンに登録されることはありません。",
  linkTitle: "このギャラリーを誰でも見られるようにしますか？",
  linkBody:
    "アドレスを知っている人は誰でも、非公開と公開のキャプチャを見られるようになります。",
  linkConfirm: "誰でも見られるようにする",
  regenerateTitle: "新しいアドレスを作成しますか？",
  regenerateBody: "以前のアドレスはすぐに使えなくなります。",
  regenerateConfirm: "新しいアドレスを作成",
  cancel: "キャンセル",
  close: "閉じる",
  loading: "プライベートギャラリーを読み込み中…",
  loadFailed:
    "プライベートギャラリーを読み込めませんでした。しばらくしてからもう一度お試しください。",
  changeFailed:
    "ギャラリーを変更できませんでした。しばらくしてからもう一度お試しください。",
  retry: "再試行",
};

const de = {
  title: "Private Galerie",
  infoLabel: "Die private Galerie",
  help: "Deine Aufnahmen, private und öffentliche, unter einer Adresse, die nur du weitergibst.",
  addressLabel: "Adresse der Galerie",
  copyAddress: "Kopieren",
  openAddress: "Öffnen",
  regenerate: "Neue Adresse erzeugen",
  optional: "· optional",
  publicNameLabel: "Öffentlicher Name",
  publicNameHelp:
    "Signiert deine öffentlichen Aufnahmen. Leer: „Ein Nutzer von Astro Portal“.",
  portalNameLabel: "Name deiner privaten Galerie",
  portalNameHelp: "Der Titel deiner Galerie. Leer: „Private Galerie“.",
  saveNames: "Namen speichern",
  whoTitle: "Wer kann diese Galerie sehen?",
  modes: {
    none: "Mit niemandem geteilt",
    link: "Für alle mit der Adresse zugänglich",
  },
  modeHelp: {
    none: "Nur du siehst sie, angemeldet in deinem Bereich.",
    link: "Wer die Adresse hat, sieht deine Aufnahmen, private und öffentliche.",
  },
  noIndex: "Suchmaschinen indexieren diese Galerie nie.",
  linkTitle: "Diese Galerie für alle zugänglich machen?",
  linkBody:
    "Wer die Adresse hat, wird deine Aufnahmen sehen, private und öffentliche.",
  linkConfirm: "Für alle zugänglich machen",
  regenerateTitle: "Neue Adresse erzeugen?",
  regenerateBody: "Die alte Adresse funktioniert sofort nicht mehr.",
  regenerateConfirm: "Neue Adresse erzeugen",
  cancel: "Abbrechen",
  close: "Schließen",
  loading: "Deine private Galerie wird geladen…",
  loadFailed:
    "Deine private Galerie konnte nicht gelesen werden. Versuche es später erneut.",
  changeFailed:
    "Die Galerie konnte nicht geändert werden. Versuche es später erneut.",
  retry: "Erneut versuchen",
};

const es = {
  title: "Galería privada",
  infoLabel: "La galería privada",
  help: "Tus capturas, privadas y públicas, en una dirección que solo tú decides dar.",
  addressLabel: "Dirección de la galería",
  copyAddress: "Copiar",
  openAddress: "Abrir",
  regenerate: "Generar una nueva dirección",
  optional: "· opcional",
  publicNameLabel: "Nombre público",
  publicNameHelp:
    "Firma tus capturas públicas. Vacío: «Un usuario de Astro Portal».",
  portalNameLabel: "Nombre de tu galería privada",
  portalNameHelp: "El título de tu galería. Vacío: «Galería privada».",
  saveNames: "Guardar los nombres",
  whoTitle: "¿Quién puede ver esta galería?",
  modes: {
    none: "Compartida con nadie",
    link: "Accesible a todos con su dirección",
  },
  modeHelp: {
    none: "Solo tú la ves, con la sesión iniciada en tu espacio.",
    link: "Cualquier persona que tenga la dirección ve tus capturas, privadas y públicas.",
  },
  noIndex: "Los motores de búsqueda nunca indexan esta galería.",
  linkTitle: "¿Hacer esta galería accesible a todos?",
  linkBody:
    "Cualquier persona que tenga la dirección verá tus capturas, privadas y públicas.",
  linkConfirm: "Hacer accesible a todos",
  regenerateTitle: "¿Generar una nueva dirección?",
  regenerateBody: "La dirección anterior deja de funcionar enseguida.",
  regenerateConfirm: "Generar una nueva dirección",
  cancel: "Cancelar",
  close: "Cerrar",
  loading: "Cargando tu galería privada…",
  loadFailed:
    "No se ha podido leer tu galería privada. Vuelve a intentarlo más tarde.",
  changeFailed:
    "No se ha podido modificar la galería. Vuelve a intentarlo más tarde.",
  retry: "Reintentar",
};

const it = {
  title: "Galleria privata",
  infoLabel: "La galleria privata",
  help: "Le tue riprese, private e pubbliche, a un indirizzo che solo tu scegli di dare.",
  addressLabel: "Indirizzo della galleria",
  copyAddress: "Copiare",
  openAddress: "Aprire",
  regenerate: "Generare un nuovo indirizzo",
  optional: "· facoltativo",
  publicNameLabel: "Nome pubblico",
  publicNameHelp:
    "Firma le tue riprese pubbliche. Vuoto: «Un utente di Astro Portal».",
  portalNameLabel: "Nome della tua galleria privata",
  portalNameHelp: "Il titolo della tua galleria. Vuoto: «Galleria privata».",
  saveNames: "Salvare i nomi",
  whoTitle: "Chi può vedere questa galleria?",
  modes: {
    none: "Condivisa con nessuno",
    link: "Accessibile a tutti con il suo indirizzo",
  },
  modeHelp: {
    none: "Solo tu la vedi, con l’accesso al tuo spazio.",
    link: "Chiunque abbia l’indirizzo vede le tue riprese, private e pubbliche.",
  },
  noIndex: "I motori di ricerca non indicizzano mai questa galleria.",
  linkTitle: "Rendere questa galleria accessibile a tutti?",
  linkBody:
    "Chiunque abbia l’indirizzo vedrà le tue riprese, private e pubbliche.",
  linkConfirm: "Rendere accessibile a tutti",
  regenerateTitle: "Generare un nuovo indirizzo?",
  regenerateBody: "Il vecchio indirizzo smette subito di funzionare.",
  regenerateConfirm: "Generare un nuovo indirizzo",
  cancel: "Annulla",
  close: "Chiudi",
  loading: "Caricamento della tua galleria privata…",
  loadFailed:
    "Non è stato possibile leggere la tua galleria privata. Riprova più tardi.",
  changeFailed:
    "Non è stato possibile modificare la galleria. Riprova più tardi.",
  retry: "Riprova",
};

const ptBR = {
  title: "Galeria privada",
  infoLabel: "A galeria privada",
  help: "Suas capturas, privadas e públicas, em um endereço que só você escolhe compartilhar.",
  addressLabel: "Endereço da galeria",
  copyAddress: "Copiar",
  openAddress: "Abrir",
  regenerate: "Gerar um novo endereço",
  optional: "· opcional",
  publicNameLabel: "Nome público",
  publicNameHelp:
    "Assina suas capturas públicas. Vazio: “Um usuário do Astro Portal”.",
  portalNameLabel: "Nome da sua galeria privada",
  portalNameHelp: "O título da sua galeria. Vazio: “Galeria privada”.",
  saveNames: "Salvar os nomes",
  whoTitle: "Quem pode ver esta galeria?",
  modes: {
    none: "Compartilhada com ninguém",
    link: "Acessível a todos pelo endereço",
  },
  modeHelp: {
    none: "Só você a vê, conectado ao seu espaço.",
    link: "Qualquer pessoa que tenha o endereço vê suas capturas, privadas e públicas.",
  },
  noIndex: "Os mecanismos de busca nunca indexam esta galeria.",
  linkTitle: "Tornar esta galeria acessível a todos?",
  linkBody:
    "Qualquer pessoa que tenha o endereço verá suas capturas, privadas e públicas.",
  linkConfirm: "Tornar acessível a todos",
  regenerateTitle: "Gerar um novo endereço?",
  regenerateBody: "O endereço anterior deixa de funcionar na hora.",
  regenerateConfirm: "Gerar um novo endereço",
  cancel: "Cancelar",
  close: "Fechar",
  loading: "Carregando sua galeria privada…",
  loadFailed:
    "Não foi possível ler sua galeria privada. Tente de novo mais tarde.",
  changeFailed: "Não foi possível alterar a galeria. Tente de novo mais tarde.",
  retry: "Tentar de novo",
};

const zhHans = {
  title: "私人图库",
  infoLabel: "关于私人图库",
  help: "你的私密和公开作品，放在一个只由你决定交给谁的地址上。",
  addressLabel: "图库地址",
  copyAddress: "复制",
  openAddress: "打开",
  regenerate: "生成新地址",
  optional: "· 可选",
  publicNameLabel: "公开名称",
  publicNameHelp: "为你的公开作品署名。留空：“一位 Astro Portal 用户”。",
  portalNameLabel: "你的私人图库名称",
  portalNameHelp: "你的图库标题。留空：“私人图库”。",
  saveNames: "保存名称",
  whoTitle: "谁可以查看此图库？",
  modes: {
    none: "不与任何人共享",
    link: "凭地址所有人可见",
  },
  modeHelp: {
    none: "只有你在登录自己的空间后可以查看。",
    link: "任何拥有地址的人都能看到你的私密和公开作品。",
  },
  noIndex: "搜索引擎永远不会收录此图库。",
  linkTitle: "让所有人都能访问此图库？",
  linkBody: "任何拥有地址的人都将看到你的私密和公开作品。",
  linkConfirm: "对所有人开放",
  regenerateTitle: "生成新地址？",
  regenerateBody: "旧地址会立即失效。",
  regenerateConfirm: "生成新地址",
  cancel: "取消",
  close: "关闭",
  loading: "正在加载你的私人图库…",
  loadFailed: "无法读取你的私人图库。请稍后重试。",
  changeFailed: "无法修改图库。请稍后重试。",
  retry: "重试",
};

const zhHant = {
  title: "私人圖庫",
  infoLabel: "關於私人圖庫",
  help: "你的私密與公開影像，放在一個只由你決定交給誰的地址上。",
  addressLabel: "圖庫地址",
  copyAddress: "複製",
  openAddress: "開啟",
  regenerate: "產生新地址",
  optional: "· 選填",
  publicNameLabel: "公開名稱",
  publicNameHelp: "為你的公開影像署名。留空：「一位 Astro Portal 使用者」。",
  portalNameLabel: "你的私人圖庫名稱",
  portalNameHelp: "你的圖庫標題。留空：「私人圖庫」。",
  saveNames: "儲存名稱",
  whoTitle: "誰可以查看此圖庫？",
  modes: {
    none: "不與任何人分享",
    link: "憑地址所有人可見",
  },
  modeHelp: {
    none: "只有你在登入自己的空間後可以查看。",
    link: "任何擁有地址的人都能看到你的私密與公開影像。",
  },
  noIndex: "搜尋引擎永遠不會收錄此圖庫。",
  linkTitle: "讓所有人都能存取此圖庫？",
  linkBody: "任何擁有地址的人都將看到你的私密與公開影像。",
  linkConfirm: "對所有人開放",
  regenerateTitle: "產生新地址？",
  regenerateBody: "舊地址會立即失效。",
  regenerateConfirm: "產生新地址",
  cancel: "取消",
  close: "關閉",
  loading: "正在載入你的私人圖庫…",
  loadFailed: "無法讀取你的私人圖庫。請稍後再試。",
  changeFailed: "無法修改圖庫。請稍後再試。",
  retry: "重試",
};

const ru = {
  title: "Закрытая галерея",
  infoLabel: "О закрытой галерее",
  help: "Ваши снимки, закрытые и публичные, по адресу, который только вы решаете кому дать.",
  addressLabel: "Адрес галереи",
  copyAddress: "Копировать",
  openAddress: "Открыть",
  regenerate: "Создать новый адрес",
  optional: "· необязательно",
  publicNameLabel: "Публичное имя",
  publicNameHelp:
    "Подписывает ваши публичные снимки. Пусто: «Пользователь Astro Portal».",
  portalNameLabel: "Название вашей закрытой галереи",
  portalNameHelp: "Заголовок вашей галереи. Пусто: «Закрытая галерея».",
  saveNames: "Сохранить имена",
  whoTitle: "Кто может видеть эту галерею?",
  modes: {
    none: "Не открыта никому",
    link: "Доступна всем по адресу",
  },
  modeHelp: {
    none: "Её видите только вы, войдя в своё пространство.",
    link: "Любой, у кого есть адрес, видит ваши снимки, закрытые и публичные.",
  },
  noIndex: "Поисковые системы никогда не индексируют эту галерею.",
  linkTitle: "Открыть эту галерею для всех?",
  linkBody:
    "Любой, у кого есть адрес, увидит ваши снимки, закрытые и публичные.",
  linkConfirm: "Открыть для всех",
  regenerateTitle: "Создать новый адрес?",
  regenerateBody: "Старый адрес сразу перестанет работать.",
  regenerateConfirm: "Создать новый адрес",
  cancel: "Отмена",
  close: "Закрыть",
  loading: "Загрузка вашей закрытой галереи…",
  loadFailed:
    "Не удалось прочитать вашу закрытую галерею. Повторите попытку позже.",
  changeFailed: "Не удалось изменить галерею. Повторите попытку позже.",
  retry: "Повторить",
};

export const portalCopy = {
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
export const portalCopyFor = (locale) => ({
  ...copyFor(portalCopy, locale, "portal-copy"),
  ...hostedCopy("portal", locale),
});
