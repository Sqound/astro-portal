import { copyLocaleFor } from "astro-contracts/locales";
import { languageOf } from "./link.js";
import { fontStack } from "./email-fonts.js";

/**
 * The message of a sign-in code: the code in the subject, the code in large digits, a
 * button that is the link, the sentence for someone who asked for nothing.
 * In each shipped locale of the registry (English, said, for one without
 * its words); a text version and an HTML version; no remote image, no
 * tracking, no script.
 *
 * A code asked for on the web page (`client: "web"`) is typed on that page:
 * its sentence names Astro Portal, not the app, and it has no button to open
 * the app. A request without a client is the app's.
 *
 * A private server (`spaceCreation: "closed"`) creates no space for an
 * address: its sentence for someone who asked for nothing says that its
 * portal stays closed without the code (`closedIgnore`). Everything else is
 * the same message.
 */
const APP_NAME = "PlanAstro";
const PORTAL_NAME = "Astro Portal";
const nbsp = " ";

const copy = {
  fr: {
    subject: (code) => `Votre code de connexion${nbsp}: ${code}`,
    title: "Votre code de connexion",
    intro: `Saisissez ce code dans l’application ${APP_NAME}. Il est valable 10${nbsp}minutes.`,
    webIntro: `Saisissez ce code sur la page de connexion d’${PORTAL_NAME}. Il est valable 10${nbsp}minutes.`,
    button: `Ouvrir ${APP_NAME}`,
    buttonHelp:
      "Sur votre téléphone, ce bouton ouvre l’application et vous connecte. Sur un autre appareil, il affiche seulement ce code.",
    ignore:
      "Si vous n’avez rien demandé, ignorez ce message. Sans ce code, aucun espace n’est créé ni ouvert à votre adresse.",
    closedIgnore:
      "Si vous n’avez rien demandé, ignorez ce message. Sans ce code, votre portail ne s’ouvre pas.",
    codeLabel: "Code",
  },
  en: {
    subject: (code) => `Your sign-in code: ${code}`,
    title: "Your sign-in code",
    intro: `Enter this code in the ${APP_NAME} app. It is valid for 10${nbsp}minutes.`,
    webIntro: `Enter this code on the ${PORTAL_NAME} sign-in page. It is valid for 10${nbsp}minutes.`,
    button: `Open ${APP_NAME}`,
    buttonHelp:
      "On your phone, this button opens the app and signs you in. On another device, it only shows this code.",
    ignore:
      "If you did not ask for anything, ignore this message. Without this code, no space is created or opened at your address.",
    closedIgnore:
      "If you did not ask for anything, ignore this message. Without this code, your portal does not open.",
    codeLabel: "Code",
  },
  ja: {
    subject: (code) => `サインインコード：${code}`,
    title: "サインインコード",
    intro: `このコードを ${APP_NAME} アプリに入力してください。有効期間は10分です。`,
    webIntro: `このコードを ${PORTAL_NAME} のサインインページに入力してください。有効期間は10分です。`,
    button: `${APP_NAME} を開く`,
    buttonHelp:
      "スマートフォンでは、このボタンでアプリが開き、サインインします。ほかの端末では、このコードだけが表示されます。",
    ignore:
      "心当たりがない場合は、このメールを無視してください。このコードがなければ、このアドレスでスペースが作成されたり開かれたりすることはありません。",
    closedIgnore:
      "心当たりがない場合は、このメールを無視してください。このコードがなければ、ポータルは開きません。",
    codeLabel: "コード",
  },
  de: {
    subject: (code) => `Dein Anmeldecode: ${code}`,
    title: "Dein Anmeldecode",
    intro: `Gib diesen Code in der ${APP_NAME}-App ein. Er ist 10${nbsp}Minuten lang gültig.`,
    webIntro: `Gib diesen Code auf der Anmeldeseite von ${PORTAL_NAME} ein. Er ist 10${nbsp}Minuten lang gültig.`,
    button: `${APP_NAME} öffnen`,
    buttonHelp:
      "Auf deinem Smartphone öffnet diese Schaltfläche die App und meldet dich an. Auf einem anderen Gerät zeigt sie nur diesen Code an.",
    ignore:
      "Wenn du nichts angefordert hast, ignoriere diese Nachricht. Ohne diesen Code wird unter deiner Adresse kein Bereich erstellt oder geöffnet.",
    closedIgnore:
      "Wenn du nichts angefordert hast, ignoriere diese Nachricht. Ohne diesen Code öffnet sich dein Portal nicht.",
    codeLabel: "Code",
  },
  es: {
    subject: (code) => `Tu código de inicio de sesión: ${code}`,
    title: "Tu código de inicio de sesión",
    intro: `Escribe este código en la aplicación ${APP_NAME}. Es válido durante 10${nbsp}minutos.`,
    webIntro: `Escribe este código en la página de inicio de sesión de ${PORTAL_NAME}. Es válido durante 10${nbsp}minutos.`,
    button: `Abrir ${APP_NAME}`,
    buttonHelp:
      "En tu teléfono, este botón abre la aplicación e inicia tu sesión. En otro dispositivo, solo muestra este código.",
    ignore:
      "Si no lo solicitaste, ignora este mensaje. Sin este código, no se crea ni se abre ningún espacio con tu dirección de correo electrónico.",
    closedIgnore:
      "Si no lo solicitaste, ignora este mensaje. Sin este código, tu portal no se abre.",
    codeLabel: "Código",
  },
  it: {
    subject: (code) => `Il tuo codice di accesso: ${code}`,
    title: "Il tuo codice di accesso",
    intro: `Inserisci questo codice nell’app ${APP_NAME}. È valido per 10${nbsp}minuti.`,
    webIntro: `Inserisci questo codice nella pagina di accesso di ${PORTAL_NAME}. È valido per 10${nbsp}minuti.`,
    button: `Aprire ${APP_NAME}`,
    buttonHelp:
      "Sul telefono questo pulsante apre l’app ed effettua l’accesso. Su un altro dispositivo mostra soltanto questo codice.",
    ignore:
      "Se non hai richiesto nulla, ignora questo messaggio. Senza questo codice non viene creato né aperto alcuno spazio con il tuo indirizzo e-mail.",
    closedIgnore:
      "Se non hai richiesto nulla, ignora questo messaggio. Senza questo codice il tuo portale non si apre.",
    codeLabel: "Codice",
  },
  "pt-BR": {
    subject: (code) => `Seu código de acesso: ${code}`,
    title: "Seu código de acesso",
    intro: `Digite este código no aplicativo ${APP_NAME}. Ele é válido por 10${nbsp}minutos.`,
    webIntro: `Digite este código na página de acesso do ${PORTAL_NAME}. Ele é válido por 10${nbsp}minutos.`,
    button: `Abrir ${APP_NAME}`,
    buttonHelp:
      "No celular, este botão abre o aplicativo e faz o login. Em outro dispositivo, ele apenas mostra este código.",
    ignore:
      "Se você não solicitou nada, ignore esta mensagem. Sem este código, nenhum espaço é criado ou aberto com o seu endereço de e-mail.",
    closedIgnore:
      "Se você não solicitou nada, ignore esta mensagem. Sem este código, o seu portal não abre.",
    codeLabel: "Código",
  },
  "zh-Hans": {
    subject: (code) => `登录验证码：${code}`,
    title: "登录验证码",
    intro: `请在${APP_NAME}应用中输入此验证码，有效期10分钟。`,
    webIntro: `请在 ${PORTAL_NAME} 的登录页面输入此验证码，有效期10分钟。`,
    button: `打开${APP_NAME}`,
    buttonHelp:
      "在手机上，点按此按钮会打开应用并自动登录。在其他设备上，只会显示此验证码。",
    ignore:
      "如果你没有提出请求，请忽略此邮件。没有此验证码，不会为你的地址创建或打开任何空间。",
    closedIgnore:
      "如果你没有提出请求，请忽略此邮件。没有此验证码，你的门户不会打开。",
    codeLabel: "验证码",
  },
  "zh-Hant": {
    subject: (code) => `登入驗證碼：${code}`,
    title: "登入驗證碼",
    intro: `請在 ${APP_NAME} App 中輸入此驗證碼，有效期限為 10 分鐘。`,
    webIntro: `請在 ${PORTAL_NAME} 的登入頁面輸入此驗證碼，有效期限為 10 分鐘。`,
    button: `開啟 ${APP_NAME}`,
    buttonHelp:
      "在手機上，點選此按鈕會開啟 App 並自動登入。在其他裝置上，只會顯示此驗證碼。",
    ignore:
      "如果你沒有提出要求，請忽略此郵件。沒有此驗證碼，不會為你的地址建立或開啟任何空間。",
    closedIgnore:
      "如果你沒有提出要求，請忽略此郵件。沒有此驗證碼，你的入口網站不會開啟。",
    codeLabel: "驗證碼",
  },
  ru: {
    subject: (code) => `Код для входа: ${code}`,
    title: "Ваш код для входа",
    intro: `Введите этот код в приложении ${APP_NAME}. Он действует 10${nbsp}минут.`,
    webIntro: `Введите этот код на странице входа ${PORTAL_NAME}. Он действует 10${nbsp}минут.`,
    button: `Открыть ${APP_NAME}`,
    buttonHelp:
      "На телефоне эта кнопка открывает приложение и выполняет вход. На другом устройстве она только показывает этот код.",
    ignore:
      "Если вы ничего не запрашивали, проигнорируйте это письмо. Без этого кода пространство для вашего адреса не будет создано или открыто.",
    closedIgnore:
      "Если вы ничего не запрашивали, проигнорируйте это письмо. Без этого кода ваш портал не откроется.",
    codeLabel: "Код",
  },
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** `481207` → `481 207`, with a space that never breaks. */
export function groupedCode(code) {
  return `${code.slice(0, 3)}${nbsp}${code.slice(3)}`;
}

export function signInMessage({
  code,
  link,
  language,
  productName,
  publicUrl,
  spaceCreation = "open",
  client = "app",
}) {
  // A code asked for on the web page is typed on the web page: the
  // message names the portal, not the app, and offers no button to
  // open the app (the page of the link only shows the code).
  const web = client === "web";
  const brand = web ? PORTAL_NAME : APP_NAME;
  const lang = languageOf(language);
  // The words of `lang`, else English, said (`copyLocaleFor`); the message
  // states the language it is written in (`contentLanguage`, `<html lang>`).
  const contentLanguage = copyLocaleFor(copy, lang, "spaces/messages.copy");
  const own = copy[contentLanguage];
  const closedWords =
    spaceCreation === "closed" ? { ...own, ignore: own.closedIgnore } : own;
  const words = web ? { ...closedWords, intro: own.webIntro } : closedWords;
  const grouped = groupedCode(code);
  const host = new URL(publicUrl).host;
  const footer = `${productName} · ${host}`;
  const text = [
    brand,
    "",
    words.title,
    words.intro,
    "",
    `    ${grouped}`,
    "",
    ...(web ? [] : [words.button, link, words.buttonHelp, ""]),
    words.ignore,
    "",
    footer,
    "",
  ].join("\n");
  const buttonRows = web
    ? `<tr><td style="height:20px;line-height:20px;font-size:0;">&nbsp;</td></tr>
`
    : `<tr><td style="padding:20px 0 10px;"><a href="${escapeHtml(link)}" style="display:block;padding:13px 20px;border:1px solid #876638;border-radius:12px;background:#e0a85e;color:#201507;font-size:16px;font-weight:600;text-align:center;text-decoration:none;">${escapeHtml(words.button)}</a></td></tr>
<tr><td style="padding:0 0 20px;font-size:13px;line-height:18px;color:#9ca5a3;">${escapeHtml(words.buttonHelp)}</td></tr>
`;
  const html = `<!doctype html>
<html lang="${contentLanguage}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${escapeHtml(words.title)}</title>
</head>
<body style="margin:0;padding:0;background:#0a0d0b;color:#eef0ee;font-family:${fontStack(contentLanguage)};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a0d0b;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" cellspacing="0" cellpadding="0" style="max-width:480px;width:100%;">
<tr><td style="padding:0 0 20px;font-size:18px;line-height:24px;font-weight:700;letter-spacing:0.02em;color:#e0a85e;">${brand}</td></tr>
<tr><td style="padding:0 0 8px;font-size:22px;line-height:28px;font-weight:600;color:#eef0ee;">${escapeHtml(words.title)}</td></tr>
<tr><td style="padding:0 0 20px;font-size:15px;line-height:22px;color:#eef0ee;">${escapeHtml(words.intro)}</td></tr>
<tr><td aria-label="${escapeHtml(`${words.codeLabel} ${code.split("").join(" ")}`)}" style="padding:18px 16px;background:#151916;border:1px solid #2c342f;border-radius:16px;text-align:center;font-size:40px;line-height:48px;font-weight:700;letter-spacing:0.12em;color:#eef0ee;">${escapeHtml(grouped)}</td></tr>
${buttonRows}<tr><td style="padding:16px 0 20px;border-top:1px solid #2c342f;font-size:14px;line-height:20px;color:#eef0ee;">${escapeHtml(words.ignore)}</td></tr>
<tr><td style="font-size:12px;line-height:17px;color:#9ca5a3;">${escapeHtml(footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
  return {
    subject: words.subject(grouped),
    text,
    html,
    language: lang,
    contentLanguage,
  };
}
