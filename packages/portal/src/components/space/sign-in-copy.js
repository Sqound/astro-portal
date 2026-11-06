import { copyFor } from "astro-contracts/locales";
/**
 * The words of the web sign-in by e-mail code. Formal
 * address, short sentences, no jargon.
 *
 * The tables are the words of a server whose spaces are open
 * (`spaceCreation: "open"`). A private server (`spaceCreation: "closed"`)
 * says « votre portail » where an open server says « votre espace Astro
 * Portal », and tells another address that the portal is someone else's:
 * `closedSignInCopy` holds only the sentences that differ, laid over the
 * table by `signInCopyFor`.
 */
const APP_NAME = "PlanAstro";

/** The Russian plural form (`one`, `few`, `many`) of a whole number. */
const russianPlurals = new Intl.PluralRules("ru");
const russianCount = (count, forms) =>
  forms[russianPlurals.select(count)] ?? forms.many;

export const signInCopy = {
  fr: {
    title: "Votre espace Astro Portal",
    intro: "Vos plans, vos sessions et vos captures, sur le web.",
    emailLabel: "Adresse e-mail",
    emailHelp:
      "Nous vous envoyons un code à six chiffres. Si cette adresse n’a pas encore d’espace, il est créé.",
    requestCode: "Recevoir mon code de connexion",
    requesting: "Envoi du code…",
    legalBefore: "En continuant, vous acceptez les ",
    terms: "conditions d’utilisation",
    legalBetween: " et la ",
    privacy: "politique de confidentialité",
    legalAfter: " d’Astro Portal.",
    codeTitle: "Saisissez votre code",
    codeSentTo: "Nous avons envoyé un code à ",
    codeSentAfter: ".",
    validity: "Ce code est valable 10 minutes.",
    verify: "Valider le code",
    verifying: "Vérification du code…",
    nothingReceived:
      "Rien reçu ? Regardez aussi dans les courriers indésirables.",
    resend: "Renvoyer le code",
    resendIn: (time) => `Renvoyer le code (${time})`,
    resendAria: (seconds) =>
      `Renvoyer le code, possible dans ${seconds} ${seconds > 1 ? "secondes" : "seconde"}`,
    resent: (address) =>
      `Nouveau code envoyé à ${address}. Le précédent ne fonctionne plus.`,
    changeAddress: "Changer d’adresse",
    codeGroup: "Code à six chiffres",
    digit: (index) => `Chiffre ${index} sur 6`,
    incorrectTitle: "Ce code ne correspond pas.",
    incorrectBody: (left) =>
      `Vérifiez le dernier message reçu. Il vous reste ${left} ${left > 1 ? "essais" : "essai"}.`,
    expiredTitle: "Ce code a expiré.",
    expiredBody:
      "Un code ne sert que 10 minutes. Demandez-en un nouveau : il arrive en quelques secondes.",
    newCode: "Recevoir un nouveau code",
    newCodeIn: (time) => `Recevoir un nouveau code dans ${time}`,
    lockedTitle: "Trop d’essais.",
    lockedBody:
      "Par sécurité, les codes de cette adresse ne peuvent plus être saisis pour le moment. Vous pourrez en demander un nouveau à la fin du délai.",
    offlineTitle: "Pas de connexion à Internet.",
    offlineBody:
      "Votre code reste valable. Validez-le dès que le réseau revient.",
    startingTitle: "Le service démarre. Cela peut prendre une minute.",
    startingBody: "Votre code sera vérifié dès qu’il répond.",
    startingRequestBody: "Votre code partira dès qu’il répond.",
    tooManyTitle: "Trop de demandes pour le moment.",
    tooManyBody: (time) =>
      `Utilisez le dernier code reçu, ou demandez-en un nouveau dans ${time}.`,
    // From the address step, a code asked for a moment ago elsewhere: nothing
    // was sent from this page. `time` is the figure in seconds or the clock of
    // a longer wait.
    askLater: (seconds, clock) =>
      `Attendez ${seconds < 60 ? `${seconds} s` : clock} avant de redemander un code.`,
    // The service's budget of messages is spent (`503 sign_in_unavailable`
    // with a date).
    suspendedTitle: "L’envoi des codes est momentanément suspendu.",
    suspendedBody: (when) => `Vous pourrez réessayer ${when}.`,
    atToday: (time) => `à ${time}`,
    atTomorrow: (date, time) => `demain, ${date}, à ${time}`,
    atLater: (date, time) => `le ${date}, à ${time}`,
    emailInvalid: "Saisissez une adresse e-mail valide.",
    deliveryFailed: "Le message n’a pas pu partir. Réessayez.",
    unavailable:
      "La connexion par e-mail n’est pas disponible sur ce service pour le moment.",
    spaceUnavailable:
      "L’espace de cette adresse n’est plus disponible. Votre code est bon, mais cet espace a été fermé. Utilisez une autre adresse e-mail.",
    failed: "Quelque chose s’est mal passé. Réessayez.",
    // A private server (closedSignInCopy): another address than its
    // owner's, a portal not installed yet, the way back.
    notOwner: "Ce portail appartient à quelqu’un d’autre.",
    notInitialized: "Ce portail n’est pas encore installé.",
    installLink: "Installer ce portail",
    recoveryLink: "Utiliser un code de secours",
  },
  en: {
    title: "Your Astro Portal space",
    intro: "Your plans, your sessions and your captures, on the web.",
    emailLabel: "E-mail address",
    emailHelp:
      "We send you a six-digit code. If this address has no space yet, one is created.",
    requestCode: "Get my sign-in code",
    requesting: "Sending the code…",
    legalBefore: "By continuing, you accept the ",
    terms: "terms of use",
    legalBetween: " and the ",
    privacy: "privacy policy",
    legalAfter: " of Astro Portal.",
    codeTitle: "Enter your code",
    codeSentTo: "We sent a code to ",
    codeSentAfter: ".",
    validity: "This code is valid for 10 minutes.",
    verify: "Confirm the code",
    verifying: "Checking the code…",
    nothingReceived: "Nothing arrived? Look in your junk mail too.",
    resend: "Resend the code",
    resendIn: (time) => `Resend the code (${time})`,
    resendAria: (seconds) =>
      `Resend the code, possible in ${seconds} ${seconds > 1 ? "seconds" : "second"}`,
    resent: (address) =>
      `New code sent to ${address}. The previous one no longer works.`,
    changeAddress: "Change address",
    codeGroup: "Six-digit code",
    digit: (index) => `Digit ${index} of 6`,
    incorrectTitle: "This code does not match.",
    incorrectBody: (left) =>
      `Check the last message you received. You have ${left} ${left > 1 ? "tries" : "try"} left.`,
    expiredTitle: "This code has expired.",
    expiredBody:
      "A code serves only 10 minutes. Ask for a new one: it arrives in a few seconds.",
    newCode: "Get a new code",
    newCodeIn: (time) => `Get a new code in ${time}`,
    lockedTitle: "Too many tries.",
    lockedBody:
      "For your security, codes for this address cannot be entered for now. You can ask for a new one when the wait ends.",
    offlineTitle: "No Internet connection.",
    offlineBody:
      "Your code stays valid. Confirm it as soon as the network is back.",
    startingTitle: "The service is starting. It may take a minute.",
    startingBody: "Your code will be checked as soon as it answers.",
    startingRequestBody: "Your code will be sent as soon as it answers.",
    tooManyTitle: "Too many requests for now.",
    tooManyBody: (time) =>
      `Use the last code you received, or ask for a new one in ${time}.`,
    askLater: (seconds, clock) =>
      `Wait ${seconds < 60 ? `${seconds} s` : clock} before asking for another code.`,
    suspendedTitle: "Sending codes is paused for the moment.",
    suspendedBody: (when) => `You can try again ${when}.`,
    atToday: (time) => `at ${time}`,
    atTomorrow: (date, time) => `tomorrow, ${date}, at ${time}`,
    atLater: (date, time) => `on ${date}, at ${time}`,
    emailInvalid: "Enter a valid e-mail address.",
    deliveryFailed: "The message could not be sent. Try again.",
    unavailable:
      "Signing in by e-mail is not available on this service right now.",
    spaceUnavailable:
      "The space of this address is no longer available. Your code is right, but this space was closed. Use another e-mail address.",
    failed: "Something went wrong. Try again.",
    notOwner: "This portal belongs to someone else.",
    notInitialized: "This portal is not set up yet.",
    installLink: "Set up this portal",
    recoveryLink: "Use a recovery code",
  },
  ja: {
    title: "Astro Portal スペース",
    intro: "プラン、セッション、キャプチャをウェブで。",
    emailLabel: "メールアドレス",
    emailHelp:
      "6桁のコードをお送りします。このアドレスにまだスペースがない場合は、新しく作成されます。",
    requestCode: "サインインコードを受け取る",
    requesting: "コードを送信中…",
    legalBefore: "続行すると、Astro Portal の",
    terms: "利用規約",
    legalBetween: "と",
    privacy: "プライバシーポリシー",
    legalAfter: "に同意したことになります。",
    codeTitle: "コードを入力してください",
    codeSentTo: "",
    codeSentAfter: " にコードを送信しました。",
    validity: "このコードの有効期限は10分です。",
    verify: "コードを確認",
    verifying: "コードを確認中…",
    nothingReceived:
      "届いていませんか？迷惑メールフォルダーも確認してください。",
    resend: "コードを再送信",
    resendIn: (time) => `コードを再送信（${time}）`,
    resendAria: (seconds) => `コードの再送信：あと${seconds}秒で可能`,
    resent: (address) =>
      `新しいコードを ${address} に送信しました。前のコードは使えなくなりました。`,
    changeAddress: "アドレスを変更",
    codeGroup: "6桁のコード",
    digit: (index) => `6桁中${index}桁目`,
    incorrectTitle: "このコードは一致しません。",
    incorrectBody: (left) =>
      `最後に受け取ったメッセージを確認してください。残り${left}回試せます。`,
    expiredTitle: "このコードは期限切れです。",
    expiredBody:
      "コードの有効期限は10分です。新しいコードを請求してください。数秒で届きます。",
    newCode: "新しいコードを受け取る",
    newCodeIn: (time) => `${time} 後に新しいコードを受け取れます`,
    lockedTitle: "試行回数が多すぎます。",
    lockedBody:
      "安全のため、このアドレスのコードは現在入力できません。待ち時間が過ぎると、新しいコードを請求できます。",
    offlineTitle: "インターネットに接続されていません。",
    offlineBody:
      "コードは有効なままです。ネットワークが戻りしだい確認してください。",
    startingTitle: "サービスを起動中です。1分ほどかかることがあります。",
    startingBody: "応答があり次第、コードを確認します。",
    startingRequestBody: "応答があり次第、コードを送信します。",
    tooManyTitle: "現在、リクエストが多すぎます。",
    tooManyBody: (time) =>
      `最後に届いたコードを使うか、${time}後に新しいコードを請求してください。`,
    askLater: (seconds, clock) =>
      `新しいコードを請求するには、あと${seconds < 60 ? `${seconds}秒` : clock}お待ちください。`,
    suspendedTitle: "コードの送信は一時的に停止されています。",
    suspendedBody: (when) => `${when} 以降に、もう一度お試しいただけます。`,
    atToday: (time) => `今日 ${time}`,
    atTomorrow: (date, time) => `明日 ${date} ${time}`,
    atLater: (date, time) => `${date} ${time}`,
    emailInvalid: "有効なメールアドレスを入力してください。",
    deliveryFailed:
      "メッセージを送信できませんでした。もう一度お試しください。",
    unavailable:
      "このサービスでは現在、メールによるサインインを利用できません。",
    spaceUnavailable:
      "このアドレスのスペースは利用できなくなりました。コードは正しいのですが、このスペースは閉鎖されています。別のメールアドレスを使用してください。",
    failed: "問題が発生しました。もう一度お試しください。",
    notOwner: "このポータルは別の方のものです。",
    notInitialized: "このポータルはまだ設定されていません。",
    installLink: "このポータルを設定する",
    recoveryLink: "リカバリーコードを使う",
  },
  de: {
    title: "Dein Bereich in Astro Portal",
    intro: "Deine Pläne, Sitzungen und Aufnahmen im Web.",
    emailLabel: "E-Mail-Adresse",
    emailHelp:
      "Wir senden dir einen sechsstelligen Code. Hat diese Adresse noch keinen Bereich, wird einer angelegt.",
    requestCode: "Meinen Anmeldecode erhalten",
    requesting: "Code wird gesendet …",
    legalBefore: "Indem du fortfährst, akzeptierst du die ",
    terms: "Nutzungsbedingungen",
    legalBetween: " und die ",
    privacy: "Datenschutzerklärung",
    legalAfter: " von Astro Portal.",
    codeTitle: "Code eingeben",
    codeSentTo: "Wir haben einen Code an ",
    codeSentAfter: " gesendet.",
    validity: "Dieser Code ist 10 Minuten lang gültig.",
    verify: "Code bestätigen",
    verifying: "Code wird geprüft …",
    nothingReceived: "Nichts angekommen? Sieh auch im Spam-Ordner nach.",
    resend: "Code erneut senden",
    resendIn: (time) => `Code erneut senden (${time})`,
    resendAria: (seconds) =>
      `Code erneut senden, möglich in ${seconds === 1 ? `1 Sekunde` : `${seconds} Sekunden`}`,
    resent: (address) =>
      `Neuer Code an ${address} gesendet. Der vorherige funktioniert nicht mehr.`,
    changeAddress: "Adresse ändern",
    codeGroup: "Sechsstelliger Code",
    digit: (index) => `Ziffer ${index} von 6`,
    incorrectTitle: "Dieser Code stimmt nicht überein.",
    incorrectBody: (left) =>
      `Prüfe die zuletzt erhaltene Nachricht. ${left === 1 ? `Du hast noch 1 Versuch.` : `Du hast noch ${left} Versuche.`}`,
    expiredTitle: "Dieser Code ist abgelaufen.",
    expiredBody:
      "Ein Code gilt nur 10 Minuten. Fordere einen neuen an: Er kommt in wenigen Sekunden an.",
    newCode: "Neuen Code erhalten",
    newCodeIn: (time) => `Neuen Code erhalten in ${time}`,
    lockedTitle: "Zu viele Versuche.",
    lockedBody:
      "Aus Sicherheitsgründen können für diese Adresse im Moment keine Codes eingegeben werden. Einen neuen Code kannst du anfordern, wenn die Wartezeit endet.",
    offlineTitle: "Keine Internetverbindung.",
    offlineBody:
      "Dein Code bleibt gültig. Bestätige ihn, sobald das Netz wieder verfügbar ist.",
    startingTitle: "Der Dienst startet. Das kann eine Minute dauern.",
    startingBody: "Dein Code wird geprüft, sobald der Dienst antwortet.",
    startingRequestBody:
      "Dein Code wird gesendet, sobald der Dienst antwortet.",
    tooManyTitle: "Im Moment zu viele Anfragen.",
    tooManyBody: (time) =>
      `Verwende den zuletzt erhaltenen Code oder fordere in ${time} einen neuen an.`,
    askLater: (seconds, clock) =>
      `Warte ${seconds < 60 ? `${seconds} s` : clock}, bevor du erneut einen Code anforderst.`,
    suspendedTitle: "Das Senden von Codes ist vorübergehend ausgesetzt.",
    suspendedBody: (when) => `Du kannst es ${when} erneut versuchen.`,
    atToday: (time) => `um ${time}`,
    atTomorrow: (date, time) => `morgen, ${date}, um ${time}`,
    atLater: (date, time) => `am ${date} um ${time}`,
    emailInvalid: "Gib eine gültige E-Mail-Adresse ein.",
    deliveryFailed:
      "Die Nachricht konnte nicht gesendet werden. Versuche es erneut.",
    unavailable:
      "Die Anmeldung per E-Mail ist bei diesem Dienst im Moment nicht verfügbar.",
    spaceUnavailable:
      "Der Bereich dieser Adresse ist nicht mehr verfügbar. Dein Code ist richtig, aber dieser Bereich wurde geschlossen. Verwende eine andere E-Mail-Adresse.",
    failed: "Etwas ist schiefgelaufen. Versuche es erneut.",
    notOwner: "Dieses Portal gehört jemand anderem.",
    notInitialized: "Dieses Portal ist noch nicht eingerichtet.",
    installLink: "Dieses Portal einrichten",
    recoveryLink: "Wiederherstellungscode verwenden",
  },
  es: {
    title: "Tu espacio de Astro Portal",
    intro: "Tus planes, sesiones y capturas, en la web.",
    emailLabel: "Correo electrónico",
    emailHelp:
      "Te enviamos un código de seis dígitos. Si esta dirección aún no tiene un espacio, se crea uno.",
    requestCode: "Recibir mi código de inicio de sesión",
    requesting: "Enviando el código…",
    legalBefore: "Al continuar, aceptas las ",
    terms: "condiciones de uso",
    legalBetween: " y la ",
    privacy: "política de privacidad",
    legalAfter: " de Astro Portal.",
    codeTitle: "Escribe tu código",
    codeSentTo: "Enviamos un código a ",
    codeSentAfter: ".",
    validity: "Este código es válido durante 10 minutos.",
    verify: "Confirmar el código",
    verifying: "Comprobando el código…",
    nothingReceived:
      "¿No ha llegado nada? Mira también en el correo no deseado.",
    resend: "Reenviar el código",
    resendIn: (time) => `Reenviar el código (${time})`,
    resendAria: (seconds) =>
      `Reenviar el código, posible dentro de ${seconds === 1 ? `1 segundo` : `${seconds} segundos`}`,
    resent: (address) =>
      `Nuevo código enviado a ${address}. El anterior ya no funciona.`,
    changeAddress: "Cambiar de dirección",
    codeGroup: "Código de seis dígitos",
    digit: (index) => `Dígito ${index} de 6`,
    incorrectTitle: "Este código no coincide.",
    incorrectBody: (left) =>
      `Comprueba el último mensaje recibido. ${left === 1 ? `Te queda 1 intento.` : `Te quedan ${left} intentos.`}`,
    expiredTitle: "Este código ha caducado.",
    expiredBody:
      "Un código solo sirve durante 10 minutos. Pide uno nuevo: llega en unos segundos.",
    newCode: "Recibir un nuevo código",
    newCodeIn: (time) => `Recibir un nuevo código dentro de ${time}`,
    lockedTitle: "Demasiados intentos.",
    lockedBody:
      "Por tu seguridad, de momento no se pueden introducir códigos de esta dirección. Podrás pedir uno nuevo cuando termine la espera.",
    offlineTitle: "Sin conexión a Internet.",
    offlineBody:
      "Tu código sigue siendo válido. Confírmalo en cuanto vuelva la red.",
    startingTitle: "El servicio se está iniciando. Puede tardar un minuto.",
    startingBody: "Tu código se comprobará en cuanto responda.",
    startingRequestBody: "Tu código se enviará en cuanto responda.",
    tooManyTitle: "Demasiadas solicitudes por ahora.",
    tooManyBody: (time) =>
      `Usa el último código recibido o pide uno nuevo dentro de ${time}.`,
    askLater: (seconds, clock) =>
      `Espera ${seconds < 60 ? `${seconds} s` : clock} antes de pedir otro código.`,
    suspendedTitle: "El envío de códigos está suspendido momentáneamente.",
    suspendedBody: (when) => `Podrá volver a intentarlo ${when}.`,
    atToday: (time) => `a las ${time}`,
    atTomorrow: (date, time) => `mañana, ${date}, a las ${time}`,
    atLater: (date, time) => `el ${date}, a las ${time}`,
    emailInvalid: "Escribe una dirección de correo electrónico válida.",
    deliveryFailed: "No se pudo enviar el mensaje. Inténtalo de nuevo.",
    unavailable:
      "El inicio de sesión por correo electrónico no está disponible en este servicio por ahora.",
    spaceUnavailable:
      "El espacio de esta dirección ya no está disponible. Tu código es correcto, pero este espacio se cerró. Usa otra dirección de correo electrónico.",
    failed: "Algo salió mal. Inténtalo de nuevo.",
    notOwner: "Este portal pertenece a otra persona.",
    notInitialized: "Este portal aún no está configurado.",
    installLink: "Configurar este portal",
    recoveryLink: "Usar un código de recuperación",
  },
  it: {
    title: "Lo spazio Astro Portal",
    intro: "I piani, le sessioni e le riprese, sul web.",
    emailLabel: "Indirizzo e-mail",
    emailHelp:
      "Viene inviato un codice di sei cifre. Se questo indirizzo non ha ancora uno spazio, ne viene creato uno.",
    requestCode: "Ricevere il codice di accesso",
    requesting: "Invio del codice in corso…",
    legalBefore: "Proseguendo, accetti ",
    terms: "i termini di utilizzo",
    legalBetween: " e ",
    privacy: "l’informativa sulla privacy",
    legalAfter: " di Astro Portal.",
    codeTitle: "Inserisci il codice",
    codeSentTo: "È stato inviato un codice a ",
    codeSentAfter: ".",
    validity: "Questo codice è valido per 10 minuti.",
    verify: "Confermare il codice",
    verifying: "Verifica del codice…",
    nothingReceived:
      "Non è arrivato nulla? Controlla anche la posta indesiderata.",
    resend: "Inviare di nuovo il codice",
    resendIn: (time) => `Inviare di nuovo il codice (${time})`,
    resendAria: (seconds) =>
      `Inviare di nuovo il codice, possibile tra ${seconds === 1 ? `1 secondo` : `${seconds} secondi`}`,
    resent: (address) =>
      `Nuovo codice inviato a ${address}. Il precedente non funziona più.`,
    changeAddress: "Cambiare indirizzo",
    codeGroup: "Codice di sei cifre",
    digit: (index) => `Cifra ${index} di 6`,
    incorrectTitle: "Questo codice non corrisponde.",
    incorrectBody: (left) =>
      `Controlla l’ultimo messaggio ricevuto. ${left === 1 ? `Resta 1 tentativo.` : `Restano ${left} tentativi.`}`,
    expiredTitle: "Questo codice è scaduto.",
    expiredBody:
      "Un codice vale solo 10 minuti. Richiedine uno nuovo: arriva in pochi secondi.",
    newCode: "Ricevere un nuovo codice",
    newCodeIn: (time) => `Ricevere un nuovo codice tra ${time}`,
    lockedTitle: "Troppi tentativi.",
    lockedBody:
      "Per sicurezza, al momento non è possibile inserire codici per questo indirizzo. Sarà possibile richiederne uno nuovo alla fine dell’attesa.",
    offlineTitle: "Nessuna connessione a Internet.",
    offlineBody:
      "Il codice resta valido. Confermalo non appena la rete torna disponibile.",
    startingTitle: "Il servizio si sta avviando. Può richiedere un minuto.",
    startingBody: "Il codice verrà verificato non appena il servizio risponde.",
    startingRequestBody:
      "Il codice verrà inviato non appena il servizio risponde.",
    tooManyTitle: "Troppe richieste al momento.",
    tooManyBody: (time) =>
      `Usa l’ultimo codice ricevuto, oppure richiedine uno nuovo tra ${time}.`,
    askLater: (seconds, clock) =>
      `Attendi ${seconds < 60 ? `${seconds} s` : clock} prima di richiedere un altro codice.`,
    suspendedTitle: "L’invio dei codici è momentaneamente sospeso.",
    suspendedBody: (when) => `Potrai riprovare ${when}.`,
    atToday: (time) => `alle ${time}`,
    atTomorrow: (date, time) => `domani, ${date}, alle ${time}`,
    atLater: (date, time) => `il ${date}, alle ${time}`,
    emailInvalid: "Inserisci un indirizzo e-mail valido.",
    deliveryFailed: "Non è stato possibile inviare il messaggio. Riprova.",
    unavailable:
      "L’accesso tramite e-mail non è disponibile su questo servizio al momento.",
    spaceUnavailable:
      "Lo spazio di questo indirizzo non è più disponibile. Il codice è corretto, ma questo spazio è stato chiuso. Usa un altro indirizzo e-mail.",
    failed: "Qualcosa è andato storto. Riprova.",
    notOwner: "Questo portale appartiene a qualcun altro.",
    notInitialized: "Questo portale non è ancora configurato.",
    installLink: "Configurare questo portale",
    recoveryLink: "Usare un codice di ripristino",
  },
  "pt-BR": {
    title: "Seu espaço do Astro Portal",
    intro: "Seus planos, sessões e capturas, na web.",
    emailLabel: "Endereço de e-mail",
    emailHelp:
      "Enviamos um código de seis dígitos para você. Se este endereço ainda não tiver um espaço, um será criado.",
    requestCode: "Receber meu código de acesso",
    requesting: "Enviando o código…",
    legalBefore: "Ao continuar, você aceita os ",
    terms: "termos de uso",
    legalBetween: " e a ",
    privacy: "política de privacidade",
    legalAfter: " do Astro Portal.",
    codeTitle: "Digite seu código",
    codeSentTo: "Enviamos um código para ",
    codeSentAfter: ".",
    validity: "Este código é válido por 10 minutos.",
    verify: "Confirmar o código",
    verifying: "Verificando o código…",
    nothingReceived: "Nada chegou? Olhe também na caixa de spam.",
    resend: "Reenviar o código",
    resendIn: (time) => `Reenviar o código (${time})`,
    resendAria: (seconds) =>
      `Reenviar o código, possível em ${seconds === 1 ? `1 segundo` : `${seconds} segundos`}`,
    resent: (address) =>
      `Novo código enviado para ${address}. O anterior não funciona mais.`,
    changeAddress: "Alterar endereço",
    codeGroup: "Código de seis dígitos",
    digit: (index) => `Dígito ${index} de 6`,
    incorrectTitle: "Este código não confere.",
    incorrectBody: (left) =>
      `Confira a última mensagem recebida. ${left === 1 ? `Resta 1 tentativa.` : `Restam ${left} tentativas.`}`,
    expiredTitle: "Este código expirou.",
    expiredBody:
      "Um código vale só 10 minutos. Peça um novo: ele chega em alguns segundos.",
    newCode: "Receber um novo código",
    newCodeIn: (time) => `Receber um novo código em ${time}`,
    lockedTitle: "Tentativas demais.",
    lockedBody:
      "Por segurança, os códigos deste endereço não podem ser digitados por enquanto. Você poderá pedir um novo quando a espera terminar.",
    offlineTitle: "Sem conexão com a Internet.",
    offlineBody:
      "Seu código continua válido. Confirme-o assim que a rede voltar.",
    startingTitle: "O serviço está iniciando. Isso pode levar um minuto.",
    startingBody: "Seu código será verificado assim que ele responder.",
    startingRequestBody: "Seu código será enviado assim que ele responder.",
    tooManyTitle: "Solicitações demais no momento.",
    tooManyBody: (time) =>
      `Use o último código recebido ou peça um novo em ${time}.`,
    askLater: (seconds, clock) =>
      `Aguarde ${seconds < 60 ? `${seconds} s` : clock} antes de pedir outro código.`,
    suspendedTitle: "O envio de códigos está temporariamente suspenso.",
    suspendedBody: (when) => `Você poderá tentar de novo ${when}.`,
    atToday: (time) => `às ${time}`,
    atTomorrow: (date, time) => `amanhã, ${date}, às ${time}`,
    atLater: (date, time) => `em ${date}, às ${time}`,
    emailInvalid: "Digite um endereço de e-mail válido.",
    deliveryFailed: "Não foi possível enviar a mensagem. Tente novamente.",
    unavailable:
      "O login por e-mail não está disponível neste serviço no momento.",
    spaceUnavailable:
      "O espaço deste endereço não está mais disponível. Seu código está certo, mas este espaço foi encerrado. Use outro endereço de e-mail.",
    failed: "Algo deu errado. Tente novamente.",
    notOwner: "Este portal pertence a outra pessoa.",
    notInitialized: "Este portal ainda não está configurado.",
    installLink: "Configurar este portal",
    recoveryLink: "Usar um código de recuperação",
  },
  "zh-Hans": {
    title: "你的Astro Portal空间",
    intro: "你的计划、观测记录和拍摄图像，都在网页上。",
    emailLabel: "电子邮件地址",
    emailHelp:
      "我们会向你发送六位验证码。如果此地址还没有空间，将自动创建一个。",
    requestCode: "获取登录验证码",
    requesting: "正在发送验证码……",
    legalBefore: "继续即表示你接受Astro Portal的",
    terms: "使用条款",
    legalBetween: "和",
    privacy: "隐私政策",
    legalAfter: "。",
    codeTitle: "输入验证码",
    codeSentTo: "我们已向",
    codeSentAfter: "发送验证码。",
    validity: "此验证码10分钟内有效。",
    verify: "确认验证码",
    verifying: "正在检查验证码……",
    nothingReceived: "没有收到？也请查看垃圾邮件。",
    resend: "重新发送验证码",
    resendIn: (time) => `重新发送验证码（${time}）`,
    resendAria: (seconds) => `重新发送验证码，${seconds}秒后可用`,
    resent: (address) => `新验证码已发送至 ${address}，之前的验证码已失效。`,
    changeAddress: "更换地址",
    codeGroup: "六位验证码",
    digit: (index) => `第${index}位，共6位`,
    incorrectTitle: "验证码不正确。",
    incorrectBody: (left) => `请检查最近收到的邮件。你还有${left}次尝试机会。`,
    expiredTitle: "验证码已过期。",
    expiredBody: "验证码仅在10分钟内有效。请重新获取，几秒钟内即可收到。",
    newCode: "获取新验证码",
    newCodeIn: (time) => `${time}后可获取新验证码`,
    lockedTitle: "尝试次数过多。",
    lockedBody:
      "出于安全考虑，暂时无法为此地址输入验证码。等待结束后即可重新获取。",
    offlineTitle: "没有网络连接。",
    offlineBody: "验证码仍然有效。网络恢复后请尽快确认。",
    startingTitle: "服务正在启动，可能需要一分钟。",
    startingBody: "服务响应后会立即检查你的验证码。",
    startingRequestBody: "服务响应后会立即发送你的验证码。",
    tooManyTitle: "目前请求过多。",
    tooManyBody: (time) => `请使用最近收到的验证码，或在${time}后重新获取。`,
    askLater: (seconds, clock) =>
      `请等待${seconds < 60 ? `${seconds}秒` : clock}后再重新获取验证码。`,
    suspendedTitle: "暂时停止发送验证码。",
    suspendedBody: (when) => `你可以在${when}再试。`,
    atToday: (time) => `今天${time}`,
    atTomorrow: (date, time) => `明天（${date}）${time}`,
    atLater: (date, time) => `${date} ${time}`,
    emailInvalid: "请输入有效的电子邮件地址。",
    deliveryFailed: "邮件未能发送。请重试。",
    unavailable: "此服务目前不支持通过电子邮件登录。",
    spaceUnavailable:
      "此地址的空间已不可用。你的验证码正确，但此空间已关闭。请使用另一个电子邮件地址。",
    failed: "出错了。请重试。",
    notOwner: "此门户属于其他人。",
    notInitialized: "此门户尚未设置。",
    installLink: "设置此门户",
    recoveryLink: "使用恢复码",
  },
  "zh-Hant": {
    title: "你的 Astro Portal 空間",
    intro: "你的計畫、觀測記錄與拍攝影像，都在網頁上。",
    emailLabel: "電子郵件地址",
    emailHelp:
      "我們會寄給你一組六位數驗證碼。若此地址尚無空間，將自動建立一個。",
    requestCode: "取得登入驗證碼",
    requesting: "正在傳送驗證碼……",
    legalBefore: "繼續即表示你接受 Astro Portal 的",
    terms: "使用條款",
    legalBetween: "與",
    privacy: "隱私權政策",
    legalAfter: "。",
    codeTitle: "輸入驗證碼",
    codeSentTo: "我們已將驗證碼寄至 ",
    codeSentAfter: "。",
    validity: "此驗證碼的有效期限為 10 分鐘。",
    verify: "確認驗證碼",
    verifying: "正在檢查驗證碼……",
    nothingReceived: "沒收到嗎？也請查看垃圾郵件匣。",
    resend: "重新傳送驗證碼",
    resendIn: (time) => `重新傳送驗證碼（${time}）`,
    resendAria: (seconds) => `重新傳送驗證碼，${seconds} 秒後可進行`,
    resent: (address) => `新驗證碼已寄至 ${address}，先前的驗證碼已失效。`,
    changeAddress: "變更地址",
    codeGroup: "六位數驗證碼",
    digit: (index) => `第 ${index} 位，共 6 位`,
    incorrectTitle: "驗證碼不符。",
    incorrectBody: (left) => `請檢查你最後收到的郵件。還剩 ${left} 次機會。`,
    expiredTitle: "此驗證碼已過期。",
    expiredBody: "驗證碼僅有效 10 分鐘。請重新索取：幾秒內就會送達。",
    newCode: "取得新的驗證碼",
    newCodeIn: (time) => `${time} 後可取得新的驗證碼`,
    lockedTitle: "嘗試次數過多。",
    lockedBody:
      "為了你的安全，目前無法輸入此地址的驗證碼。等待結束後即可重新索取。",
    offlineTitle: "沒有網際網路連線。",
    offlineBody: "你的驗證碼仍然有效。網路恢復後請立即確認。",
    startingTitle: "服務正在啟動，可能需要一分鐘。",
    startingBody: "服務一有回應，就會檢查你的驗證碼。",
    startingRequestBody: "服務一有回應，就會寄出你的驗證碼。",
    tooManyTitle: "目前要求次數過多。",
    tooManyBody: (time) => `請使用最後收到的驗證碼，或於 ${time} 後重新索取。`,
    askLater: (seconds, clock) =>
      `請等候${seconds < 60 ? `${seconds}秒` : clock}後再重新索取驗證碼。`,
    suspendedTitle: "目前暫停寄送驗證碼。",
    suspendedBody: (when) => `可再試的時間：${when}。`,
    atToday: (time) => `今天 ${time}`,
    atTomorrow: (date, time) => `明天（${date}）${time}`,
    atLater: (date, time) => `${date} ${time}`,
    emailInvalid: "請輸入有效的電子郵件地址。",
    deliveryFailed: "郵件無法寄出。請再試一次。",
    unavailable: "此服務目前不提供以電子郵件登入。",
    spaceUnavailable:
      "此地址的空間已無法使用。你的驗證碼正確，但此空間已關閉。請使用其他電子郵件地址。",
    failed: "發生問題。請再試一次。",
    notOwner: "此入口網站屬於他人。",
    notInitialized: "此入口網站尚未設定。",
    installLink: "設定此入口網站",
    recoveryLink: "使用備用碼",
  },
  ru: {
    title: "Ваше пространство Astro Portal",
    intro: "Ваши планы, сеансы и снимки — в браузере.",
    emailLabel: "Адрес электронной почты",
    emailHelp:
      "Мы пришлём вам шестизначный код. Если у этого адреса ещё нет пространства, оно будет создано.",
    requestCode: "Получить код для входа",
    requesting: "Отправка кода…",
    legalBefore: "Продолжая, вы принимаете ",
    terms: "условия использования",
    legalBetween: " и ",
    privacy: "политику конфиденциальности",
    legalAfter: " Astro Portal.",
    codeTitle: "Введите код",
    codeSentTo: "Мы отправили код на ",
    codeSentAfter: ".",
    validity: "Код действителен 10 минут.",
    verify: "Подтвердить код",
    verifying: "Проверка кода…",
    nothingReceived: "Ничего не пришло? Посмотрите также в папке «Спам».",
    resend: "Отправить код ещё раз",
    resendIn: (time) => `Отправить код ещё раз (${time})`,
    resendAria: (seconds) =>
      `Отправить код ещё раз можно через ${seconds} ${russianCount(seconds, { one: "секунду", few: "секунды", many: "секунд" })}`,
    resent: (address) =>
      `Новый код отправлен на ${address}. Предыдущий больше не действует.`,
    changeAddress: "Изменить адрес",
    codeGroup: "Шестизначный код",
    digit: (index) => `Цифра ${index} из 6`,
    incorrectTitle: "Код не подходит.",
    incorrectBody: (left) =>
      `Проверьте последнее полученное письмо. ${russianCount(left, { one: `Осталась ${left} попытка.`, few: `Осталось ${left} попытки.`, many: `Осталось ${left} попыток.` })}`,
    expiredTitle: "Срок действия кода истёк.",
    expiredBody:
      "Код действует только 10 минут. Запросите новый: он придёт через несколько секунд.",
    newCode: "Получить новый код",
    newCodeIn: (time) => `Получить новый код через ${time}`,
    lockedTitle: "Слишком много попыток.",
    lockedBody:
      "В целях безопасности ввод кодов для этого адреса сейчас невозможен. Новый код можно запросить, когда закончится ожидание.",
    offlineTitle: "Нет подключения к интернету.",
    offlineBody:
      "Ваш код остаётся действительным. Подтвердите его, как только появится сеть.",
    startingTitle: "Сервис запускается. Это может занять минуту.",
    startingBody: "Ваш код будет проверен, как только сервис ответит.",
    startingRequestBody: "Ваш код будет отправлен, как только сервис ответит.",
    tooManyTitle: "Слишком много запросов.",
    tooManyBody: (time) =>
      `Используйте последний полученный код или запросите новый через ${time}.`,
    askLater: (seconds, clock) =>
      `Подождите ${seconds < 60 ? `${seconds} с` : clock}, прежде чем запрашивать код снова.`,
    suspendedTitle: "Отправка кодов временно приостановлена.",
    suspendedBody: (when) => `Повторить попытку можно ${when}.`,
    atToday: (time) => `сегодня в ${time}`,
    atTomorrow: (date, time) => `завтра, ${date}, в ${time}`,
    atLater: (date, time) => `${date}, в ${time}`,
    emailInvalid: "Введите действительный адрес электронной почты.",
    deliveryFailed: "Не удалось отправить письмо. Повторите попытку.",
    unavailable: "Вход по электронной почте сейчас недоступен на этом сервисе.",
    spaceUnavailable:
      "Пространство с этим адресом больше недоступно. Ваш код верен, но это пространство закрыто. Используйте другой адрес электронной почты.",
    failed: "Что-то пошло не так. Повторите попытку.",
    notOwner: "Этот портал принадлежит другому человеку.",
    notInitialized: "Этот портал ещё не настроен.",
    installLink: "Настроить этот портал",
    recoveryLink: "Использовать резервный код",
  },
};

/**
 * What a private server says otherwise: its portal, never a space created
 * for an address; the address its owner chose at the installation.
 */
export const closedSignInCopy = {
  fr: {
    title: "Votre portail",
    emailHelp:
      "Saisissez l’adresse e-mail choisie à l’installation : nous y envoyons un code à six chiffres.",
    spaceUnavailable: "Cette adresse ne peut plus ouvrir ce portail.",
  },
  en: {
    title: "Your portal",
    emailHelp:
      "Enter the e-mail address chosen when this portal was set up: we send a six-digit code to it.",
    spaceUnavailable: "This address can no longer open this portal.",
  },
  ja: {
    title: "ポータル",
    emailHelp:
      "設定時に登録したメールアドレスを入力してください。6桁のコードをお送りします。",
    spaceUnavailable: "このアドレスでは、このポータルを開けなくなりました。",
  },
  de: {
    title: "Dein Portal",
    emailHelp:
      "Gib die E-Mail-Adresse ein, die bei der Einrichtung dieses Portals gewählt wurde: Wir senden einen sechsstelligen Code dorthin.",
    spaceUnavailable: "Diese Adresse kann dieses Portal nicht mehr öffnen.",
  },
  es: {
    title: "Tu portal",
    emailHelp:
      "Escribe la dirección de correo electrónico elegida al instalar este portal: te enviaremos un código de seis dígitos.",
    spaceUnavailable: "Esta dirección ya no puede abrir este portal.",
  },
  it: {
    title: "Portale",
    emailHelp:
      "Inserisci l’indirizzo e-mail scelto durante l’installazione del portale: a questo indirizzo viene inviato un codice di sei cifre.",
    spaceUnavailable: "Questo indirizzo non può più aprire questo portale.",
  },
  "pt-BR": {
    title: "Seu portal",
    emailHelp:
      "Digite o endereço de e-mail escolhido na configuração deste portal: enviaremos um código de seis dígitos para ele.",
    spaceUnavailable: "Este endereço não pode mais abrir este portal.",
  },
  "zh-Hans": {
    title: "你的门户",
    emailHelp:
      "请输入设置此门户时选择的电子邮件地址：我们会向它发送六位验证码。",
    spaceUnavailable: "此地址已无法打开该门户。",
  },
  "zh-Hant": {
    title: "你的入口網站",
    emailHelp:
      "請輸入設定此入口網站時選定的電子郵件地址：我們會寄一組六位數驗證碼到該地址。",
    spaceUnavailable: "此地址已無法開啟此入口網站。",
  },
  ru: {
    title: "Ваш портал",
    emailHelp:
      "Введите адрес электронной почты, выбранный при настройке портала: мы отправим на него шестизначный код.",
    spaceUnavailable: "Этот адрес больше не может открыть этот портал.",
  },
};

export const linkCopy = {
  fr: {
    title: "Votre code de connexion",
    intro: `Saisissez-le dans l’application ${APP_NAME}, sur l’appareil où vous l’avez demandé.`,
    validFor: (minutes) =>
      minutes > 1
        ? `Valable encore ${minutes} minutes.`
        : "Valable encore moins d’une minute.",
    expired: "Ce code a expiré. Demandez-en un nouveau dans l’application.",
    incomplete:
      "Ce lien est incomplet. Utilisez le code écrit dans le message.",
    codeLabel: (digits) => `Code : ${digits}`,
  },
  en: {
    title: "Your sign-in code",
    intro: `Enter it in the ${APP_NAME} app, on the device where you asked for it.`,
    validFor: (minutes) =>
      minutes > 1
        ? `Still valid for ${minutes} minutes.`
        : "Still valid for less than a minute.",
    expired: "This code has expired. Ask for a new one in the app.",
    incomplete: "This link is incomplete. Use the code written in the message.",
    codeLabel: (digits) => `Code: ${digits}`,
  },
  ja: {
    title: "サインインコード",
    intro: `コードを請求した端末の ${APP_NAME} アプリに入力してください。`,
    validFor: (minutes) =>
      minutes > 1
        ? `あと${minutes}分有効です。`
        : "有効期限まで残り1分未満です。",
    expired:
      "このコードは期限切れです。アプリで新しいコードを請求してください。",
    incomplete:
      "このリンクは不完全です。メールに記載されたコードを使ってください。",
    codeLabel: (digits) => `コード：${digits}`,
  },
  de: {
    title: "Dein Anmeldecode",
    intro: `Gib ihn in der App ${APP_NAME} auf dem Gerät ein, auf dem du ihn angefordert hast.`,
    validFor: (minutes) =>
      minutes > 1
        ? `Noch ${minutes} Minuten gültig.`
        : "Noch weniger als eine Minute gültig.",
    expired: "Dieser Code ist abgelaufen. Fordere in der App einen neuen an.",
    incomplete:
      "Dieser Link ist unvollständig. Verwende den Code aus der Nachricht.",
    codeLabel: (digits) => `Code: ${digits}`,
  },
  es: {
    title: "Tu código de inicio de sesión",
    intro: `Escríbelo en la aplicación ${APP_NAME}, en el dispositivo donde lo pediste.`,
    validFor: (minutes) =>
      minutes > 1
        ? `Válido todavía durante ${minutes} minutos.`
        : "Válido todavía durante menos de un minuto.",
    expired: "Este código ha caducado. Pide uno nuevo en la aplicación.",
    incomplete:
      "Este enlace está incompleto. Usa el código escrito en el mensaje.",
    codeLabel: (digits) => `Código: ${digits}`,
  },
  it: {
    title: "Il codice di accesso",
    intro: `Inseriscilo nell’app ${APP_NAME}, sul dispositivo su cui lo hai richiesto.`,
    validFor: (minutes) =>
      minutes > 1
        ? `Ancora valido per ${minutes} minuti.`
        : "Ancora valido per meno di un minuto.",
    expired: "Questo codice è scaduto. Richiedine uno nuovo nell’app.",
    incomplete:
      "Questo link è incompleto. Usa il codice scritto nel messaggio.",
    codeLabel: (digits) => `Codice: ${digits}`,
  },
  "pt-BR": {
    title: "Seu código de acesso",
    intro: `Digite-o no app ${APP_NAME}, no dispositivo em que você o pediu.`,
    validFor: (minutes) =>
      minutes > 1
        ? `Ainda válido por ${minutes} minutos.`
        : "Ainda válido por menos de um minuto.",
    expired: "Este código expirou. Peça um novo no app.",
    incomplete: "Este link está incompleto. Use o código escrito na mensagem.",
    codeLabel: (digits) => `Código: ${digits}`,
  },
  "zh-Hans": {
    title: "登录验证码",
    intro: `请在你获取验证码的设备上，将其输入${APP_NAME}应用。`,
    validFor: (minutes) =>
      minutes > 1 ? `还有${minutes}分钟有效。` : "有效期不足一分钟。",
    expired: "此验证码已过期。请在应用中重新获取。",
    incomplete: "此链接不完整。请使用邮件中的验证码。",
    codeLabel: (digits) => `验证码：${digits}`,
  },
  "zh-Hant": {
    title: "登入驗證碼",
    intro: `請在你索取驗證碼的裝置上，將其輸入 ${APP_NAME} App。`,
    validFor: (minutes) =>
      minutes > 1 ? `還有 ${minutes} 分鐘有效。` : "有效期限不到一分鐘。",
    expired: "此驗證碼已過期。請在 App 中重新索取。",
    incomplete: "此連結不完整。請使用郵件中的驗證碼。",
    codeLabel: (digits) => `驗證碼：${digits}`,
  },
  ru: {
    title: "Ваш код для входа",
    intro: `Введите его в приложении ${APP_NAME} на устройстве, где вы его запросили.`,
    validFor: (minutes) =>
      minutes > 1
        ? `Код действителен ещё ${minutes} ${russianCount(minutes, { one: "минуту", few: "минуты", many: "минут" })}.`
        : "Код действителен ещё меньше минуты.",
    expired: "Срок действия кода истёк. Запросите новый в приложении.",
    incomplete: "Эта ссылка неполная. Используйте код из письма.",
    codeLabel: (digits) => `Код: ${digits}`,
  },
};

// The registry's one named fallback, read here by the pages of the link and
// of the sign-in (`SpaceLinkPage.js`).
export { copyFor };

/** The words of the sign-in page, for the service it is shown on. */
export function signInCopyFor(locale, { spaceCreation = "open" } = {}) {
  const words = copyFor(signInCopy, locale);
  return spaceCreation === "closed"
    ? { ...words, ...copyFor(closedSignInCopy, locale) }
    : words;
}
