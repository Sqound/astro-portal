import { copyFor } from "astro-contracts/locales";
/**
 * The words of the space page (« Espace Astro Portal » where spaces are open
 * to any address, « Compte » on a private server that signs in by e-mail
 * code). The browser and the session that ended have their own sentences,
 * written in the same register: formal
 * address in French, short sentences, no jargon. The word is « espace Astro
 * Portal », never « compte »; a device is « détaché » and « rattaché », never
 * « dissocié ».
 *
 * A private server (`spaceCreation: "closed"`) holds one space, its
 * owner's: it says « votre portail » where an open server says « votre
 * espace », and nothing of a device serving another space.
 * `closedSpaceCopy` holds only the sentences that differ, laid over the
 * table by `spaceCopyFor`.
 *
 * French punctuation: the sentences below use plain spaces, exactly as the
 * application's files do; `spaceCopyFor` puts the no-break spaces that
 * French wants before « ? : ; ! » and inside « ».
 */

/** The longest name a device may have (`PATCH /v1/devices/{id}`). */
export const DEVICE_NAME_MAX = 120;

/** The Russian plural form (`one`, `few`, `many`) of a whole number. */
const russianPlurals = new Intl.PluralRules("ru");
const russianCount = (count, forms) =>
  forms[russianPlurals.select(count)] ?? forms.many;

const fr = {
  title: "Espace Astro Portal",
  hostedLine: "Votre espace Astro Portal, sur le service hébergé",
  signInMethod: "Connexion par un code envoyé à votre adresse e-mail",
  connecting: "Connexion au service…",

  devicesTitle: "Mes appareils",
  devicesNote:
    "Un appareil n’est rattaché qu’à un seul espace. Un appareil perdu ou que vous n’avez plus se détache ici.",
  devicesLoading: "Chargement de vos appareils…",
  devicesEmpty: "Aucun appareil n’est rattaché à votre espace pour le moment.",
  devicesEmptyHint:
    "Connectez-vous depuis PlanAstro ou Astro Sync avec la même adresse e-mail : l’appareil se rattache tout seul.",
  devicesUnavailable:
    "La liste de vos appareils n’a pas pu être lue. Réessayez plus tard.",
  activeNow: "Actif maintenant",
  syncedOn: (date) => `Synchronisé le ${date}`,
  attachedOn: (date) => `Rattaché le ${date}`,
  renameTooltip: (name) => `Renommer ${name}`,
  detachTooltip: (name) => `Détacher ${name} de votre espace`,

  renameTitle: "Renommer l’appareil",
  renameField: "Nom de l’appareil",
  renameSave: "Enregistrer ce nom",
  renameFailed: "Le nom n’a pas pu être changé. Réessayez.",
  renameTooLong: `Le nom ne peut pas dépasser ${DEVICE_NAME_MAX} caractères.`,

  detachTitle: "Détacher cet appareil ?",
  detachAccessCut: "Son accès à votre espace est coupé tout de suite.",
  detachCopyErased:
    "La copie de votre espace qu’il garde est effacée la prochaine fois qu’il joint le service.",
  detachDataStays:
    "Vos plans, sessions et captures restent dans votre espace, sur le web et sur vos autres appareils.",
  detachReusable: "L’appareil pourra ensuite servir à un autre espace.",
  detachConfirm: "Détacher cet appareil",
  detaching: "Détachement…",
  detachOffline:
    "Pas de connexion à Internet : rien n’a été détaché. Réessayez dès que le réseau revient.",
  detachFailed: "L’appareil n’a pas pu être détaché. Réessayez.",
  alreadyDetached: "Cet appareil était déjà détaché. La liste est à jour.",

  browserTitle: "Ce navigateur",
  browserBody:
    "Vous êtes connecté sur le web avec cette adresse. Un navigateur n’est pas un appareil : il ne figure pas dans « Mes appareils ».",
  signOut: "Se déconnecter de ce navigateur",
  signingOut: "Déconnexion…",
  signOutFailed: "La déconnexion n’a pas abouti. Réessayez.",

  cancel: "Annuler",
  close: "Fermer",
  retry: "Réessayer",
  offlineTitle: "Pas de connexion à Internet.",
  offlineBody: "Réessayez dès que le réseau revient.",
  unreachableTitle: "Le service ne répond pas pour le moment.",
  unreachableBody: "Réessayez dans un moment.",
  failed: "Quelque chose s’est mal passé. Réessayez.",

  sessionEndedTitle: "Votre session est terminée.",
  sessionEndedBody:
    "Connectez-vous de nouveau : un code est envoyé à votre adresse e-mail.",
  signInAgain: "Me connecter à mon espace",

  // The project's calibration set: the section of the space, its switch,
  // its rules and its withdrawal.
  calibrationTitle: "Calibration du ciel",
  calibrationSwitch: "Confier mes valeurs de fond de ciel au projet",
  calibrationIntro:
    "Vos valeurs, mesurées sur vos poses ou saisies, aident à affiner l’estimation du ciel pour tous. Désactivé par défaut.",
  calibrationKept:
    "Ce qui est gardé : la valeur, sa bande (caméra ou sky-mètre), le niveau de lumière artificielle autour du lieu, la région de calibration, l’année et la version de la méthode.",
  calibrationNotKept:
    "Jamais gardés : le lieu, ses coordonnées, son nom, votre adresse, un identifiant de votre espace ou de vos appareils.",
  calibrationRelease:
    "Le jeu publié l’est sous licence CC BY 4.0 (attribution, usage commercial permis). Une version du jeu déjà publiée ne peut pas être rappelée ; retirer vos contributions efface tout ce qui n’a pas encore été publié.",
  calibrationOffKeeps:
    "Désactiver arrête les nouvelles contributions ; ce qui est déjà gardé le reste jusqu’à ce que vous le retiriez.",
  calibrationCount: (count, date) =>
    count === 1
      ? `1 valeur gardée, le ${date}`
      : `${count} valeurs gardées, la dernière le ${date}`,
  calibrationNoneYet:
    "Aucune valeur gardée pour le moment : elles le seront dès qu’un de vos lieux aura une valeur mesurée ou saisie.",
  calibrationRules: "Les règles du jeu de calibration",
  calibrationWithdraw: "Retirer mes contributions",
  calibrationWithdrawing: "Retrait…",
  calibrationWithdrawTitle: "Retirer vos contributions ?",
  calibrationWithdrawBody:
    "Les valeurs gardées sont effacées et les contributions s’arrêtent. Une version déjà publiée garde les siennes.",
  calibrationWithdrawn: "Vos contributions ont été retirées.",
  calibrationFailed: "Le réglage n’a pas pu être changé. Réessayez.",
  calibrationUnavailable:
    "L’état de vos contributions n’a pas pu être lu. Réessayez plus tard.",
  calibrationOffline:
    "Hors ligne : dernier état connu. Rien ne peut être changé pour le moment.",
};

const en = {
  title: "Astro Portal space",
  hostedLine: "Your Astro Portal space, on the hosted service",
  signInMethod: "Sign-in by a code sent to your e-mail address",
  connecting: "Connecting to the service…",

  devicesTitle: "My devices",
  devicesNote:
    "A device is attached to one space only. A lost device, or one you no longer have, is detached here.",
  devicesLoading: "Loading your devices…",
  devicesEmpty: "No device is attached to your space yet.",
  devicesEmptyHint:
    "Sign in from PlanAstro or Astro Sync with the same e-mail address: the device attaches itself.",
  devicesUnavailable: "Your devices could not be read. Try again later.",
  activeNow: "Active now",
  syncedOn: (date) => `Synced on ${date}`,
  attachedOn: (date) => `Attached on ${date}`,
  renameTooltip: (name) => `Rename ${name}`,
  detachTooltip: (name) => `Detach ${name} from your space`,

  renameTitle: "Rename the device",
  renameField: "Name of the device",
  renameSave: "Save this name",
  renameFailed: "The name could not be changed. Try again.",
  renameTooLong: `The name cannot be longer than ${DEVICE_NAME_MAX} characters.`,

  detachTitle: "Detach this device?",
  detachAccessCut: "Its access to your space is cut at once.",
  detachCopyErased:
    "The copy of your space it keeps is erased the next time it reaches the service.",
  detachDataStays:
    "Your plans, sessions and captures stay in your space, on the web and on your other devices.",
  detachReusable: "The device can then serve another space.",
  detachConfirm: "Detach this device",
  detaching: "Detaching…",
  detachOffline:
    "No Internet connection: nothing was detached. Try again as soon as the network is back.",
  detachFailed: "The device could not be detached. Try again.",
  alreadyDetached: "That device was already detached. The list is up to date.",

  browserTitle: "This browser",
  browserBody:
    "You are signed in on the web with this address. A browser is not a device: it does not appear in “My devices”.",
  signOut: "Sign out of this browser",
  signingOut: "Signing out…",
  signOutFailed: "Signing out did not work. Try again.",

  cancel: "Cancel",
  close: "Close",
  retry: "Try again",
  offlineTitle: "No Internet connection.",
  offlineBody: "Try again as soon as the network is back.",
  unreachableTitle: "The service is not answering right now.",
  unreachableBody: "Try again in a moment.",
  failed: "Something went wrong. Try again.",

  sessionEndedTitle: "Your session has ended.",
  sessionEndedBody: "Sign in again: a code is sent to your e-mail address.",
  signInAgain: "Sign in to my space",

  // The project's calibration set: the section of the space, its switch,
  // its rules and its withdrawal.
  calibrationTitle: "Sky calibration",
  calibrationSwitch: "Let the project keep my sky background values",
  calibrationIntro:
    "Your values, measured on your frames or entered, help refine everyone’s sky estimate. Off by default.",
  calibrationKept:
    "What is kept: the value, its band (camera or sky meter), the artificial-light level around the place, the calibration region, the year and the method version.",
  calibrationNotKept:
    "Never kept: the place, its coordinates, its name, your address, any identifier of your space or your devices.",
  calibrationRelease:
    "The published set is released under CC BY 4.0 (attribution, commercial use allowed). A release of the set already published cannot be recalled; withdrawing your contributions deletes everything not yet published.",
  calibrationOffKeeps:
    "Switching off stops new contributions; what is already kept stays until you withdraw it.",
  calibrationCount: (count, date) =>
    count === 1
      ? `1 value kept, on ${date}`
      : `${count} values kept, the last on ${date}`,
  calibrationNoneYet:
    "No value kept yet: they will be as soon as one of your places has a measured or entered value.",
  calibrationRules: "The calibration set’s rules",
  calibrationWithdraw: "Withdraw my contributions",
  calibrationWithdrawing: "Withdrawing…",
  calibrationWithdrawTitle: "Withdraw your contributions?",
  calibrationWithdrawBody:
    "The values kept are deleted and contributions stop. A release already published keeps its own.",
  calibrationWithdrawn: "Your contributions have been withdrawn.",
  calibrationFailed: "The setting could not be changed. Try again.",
  calibrationUnavailable:
    "The state of your contributions could not be read. Try again later.",
  calibrationOffline:
    "Offline: last known state. Nothing can be changed for now.",
};

const ja = {
  title: "Astro Portal スペース",
  hostedLine: "ホスト版サービス上の Astro Portal スペース",
  signInMethod: "メールアドレスに届くコードでサインイン",
  connecting: "サービスに接続中…",

  devicesTitle: "マイデバイス",
  devicesNote:
    "端末は1つのスペースにしか紐付けられません。紛失した端末や手放した端末は、ここで切り離します。",
  devicesLoading: "端末を読み込んでいます…",
  devicesEmpty: "スペースに紐付けられた端末はまだありません。",
  devicesEmptyHint:
    "PlanAstro または Astro Sync から同じメールアドレスでサインインすると、端末は自動的に紐付けられます。",
  devicesUnavailable:
    "端末の一覧を読み込めませんでした。後でもう一度お試しください。",
  activeNow: "現在使用中",
  syncedOn: (date) => `${date} に同期`,
  attachedOn: (date) => `${date} に紐付け`,
  renameTooltip: (name) => `${name} の名前を変更`,
  detachTooltip: (name) => `${name} をスペースから切り離す`,

  renameTitle: "端末の名前を変更",
  renameField: "端末の名前",
  renameSave: "この名前を保存",
  renameFailed: "名前を変更できませんでした。もう一度お試しください。",
  renameTooLong: `名前は${DEVICE_NAME_MAX}文字以内で入力してください。`,

  detachTitle: "この端末を切り離しますか？",
  detachAccessCut: "その端末のスペースへのアクセスは、すぐに遮断されます。",
  detachCopyErased:
    "その端末に残るスペースのコピーは、次にサービスに接続したときに削除されます。",
  detachDataStays:
    "プラン、セッション、キャプチャはスペースに残り、ウェブや他の端末で引き続き利用できます。",
  detachReusable: "その後、この端末は別のスペースで使えるようになります。",
  detachConfirm: "この端末を切り離す",
  detaching: "切り離し中…",
  detachOffline:
    "インターネットに接続されていないため、何も切り離されていません。ネットワークが戻りしだい、もう一度お試しください。",
  detachFailed: "端末を切り離せませんでした。もう一度お試しください。",
  alreadyDetached: "その端末はすでに切り離されていました。一覧を更新しました。",

  browserTitle: "このブラウザ",
  browserBody:
    "このアドレスでウェブにサインインしています。ブラウザは端末ではないため、「マイデバイス」には表示されません。",
  signOut: "このブラウザからサインアウト",
  signingOut: "サインアウト中…",
  signOutFailed: "サインアウトできませんでした。もう一度お試しください。",

  cancel: "キャンセル",
  close: "閉じる",
  retry: "再試行",
  offlineTitle: "インターネットに接続されていません。",
  offlineBody: "ネットワークが戻りしだい、もう一度お試しください。",
  unreachableTitle: "現在、サービスが応答していません。",
  unreachableBody: "しばらくしてから、もう一度お試しください。",
  failed: "問題が発生しました。もう一度お試しください。",

  sessionEndedTitle: "セッションが終了しました。",
  sessionEndedBody:
    "もう一度サインインしてください。コードがメールアドレスに送信されます。",
  signInAgain: "スペースにサインインする",

  // The project's calibration set: the section of the space, its switch,
  // its rules and its withdrawal.
  calibrationTitle: "夜空のキャリブレーション",
  calibrationSwitch: "夜空の背景輝度の値をプロジェクトに提供する",
  calibrationIntro:
    "撮影データから実測した値や入力した値は、すべての人のための夜空の推定を改善するのに役立ちます。初期設定ではオフです。",
  calibrationKept:
    "保存されるもの：値、その帯域（カメラまたはスカイメーター）、場所周辺の人工光のレベル、キャリブレーション地域、年、測定方法のバージョン。",
  calibrationNotKept:
    "保存されないもの：場所、その座標、名前、メールアドレス、スペースや端末の識別子。",
  calibrationRelease:
    "公開されるデータセットは CC BY 4.0（クレジット表示が必要、商用利用可）のライセンスで提供されます。すでに公開されたデータセットのバージョンは取り消せません。提供を取り消すと、まだ公開されていないものはすべて削除されます。",
  calibrationOffKeeps:
    "オフにすると新しい提供は止まります。すでに保存されたものは、取り消すまで残ります。",
  calibrationCount: (count, date) =>
    count === 1
      ? `1 件の値を保存済み（${date}）`
      : `${count} 件の値を保存済み（最新：${date}）`,
  calibrationNoneYet:
    "まだ保存された値はありません。いずれかの場所に実測値または入力値ができしだい保存されます。",
  calibrationRules: "キャリブレーション用データセットのルール",
  calibrationWithdraw: "提供を取り消す",
  calibrationWithdrawing: "取り消し中…",
  calibrationWithdrawTitle: "提供を取り消しますか？",
  calibrationWithdrawBody:
    "保存された値は削除され、提供は止まります。すでに公開されたバージョンには、その値が残ります。",
  calibrationWithdrawn: "提供を取り消しました。",
  calibrationFailed: "設定を変更できませんでした。もう一度お試しください。",
  calibrationUnavailable:
    "提供の状態を読み込めませんでした。後でもう一度お試しください。",
  calibrationOffline:
    "オフライン：最後に確認した状態です。現在は変更できません。",
};

const de = {
  title: "Bereich in Astro Portal",
  hostedLine: "Dein Bereich in Astro Portal, im gehosteten Dienst",
  signInMethod:
    "Anmeldung über einen Code, der an deine E-Mail-Adresse gesendet wird",
  connecting: "Verbindung zum Dienst wird hergestellt …",

  devicesTitle: "Meine Geräte",
  devicesNote:
    "Ein Gerät ist nur mit einem Bereich verbunden. Ein verlorenes oder nicht mehr vorhandenes Gerät trennst du hier.",
  devicesLoading: "Deine Geräte werden geladen …",
  devicesEmpty: "Mit deinem Bereich ist noch kein Gerät verbunden.",
  devicesEmptyHint:
    "Melde dich in PlanAstro oder Astro Sync mit derselben E-Mail-Adresse an: Das Gerät wird automatisch verbunden.",
  devicesUnavailable:
    "Deine Geräte konnten nicht gelesen werden. Versuche es später erneut.",
  activeNow: "Gerade aktiv",
  syncedOn: (date) => `Synchronisiert am ${date}`,
  attachedOn: (date) => `Verbunden am ${date}`,
  renameTooltip: (name) => `${name} umbenennen`,
  detachTooltip: (name) => `${name} von deinem Bereich trennen`,

  renameTitle: "Gerät umbenennen",
  renameField: "Name des Geräts",
  renameSave: "Diesen Namen speichern",
  renameFailed: "Der Name konnte nicht geändert werden. Versuche es erneut.",
  renameTooLong: `Der Name darf höchstens ${DEVICE_NAME_MAX} Zeichen lang sein.`,

  detachTitle: "Dieses Gerät trennen?",
  detachAccessCut:
    "Der Zugriff dieses Geräts auf deinen Bereich wird sofort unterbrochen.",
  detachCopyErased:
    "Die Kopie deines Bereichs, die es behält, wird gelöscht, sobald es den Dienst das nächste Mal erreicht.",
  detachDataStays:
    "Deine Pläne, Sitzungen und Aufnahmen bleiben in deinem Bereich, im Web und auf deinen anderen Geräten.",
  detachReusable:
    "Das Gerät kann danach für einen anderen Bereich verwendet werden.",
  detachConfirm: "Dieses Gerät trennen",
  detaching: "Wird getrennt …",
  detachOffline:
    "Keine Internetverbindung: Es wurde nichts getrennt. Versuche es erneut, sobald das Netz wieder verfügbar ist.",
  detachFailed: "Das Gerät konnte nicht getrennt werden. Versuche es erneut.",
  alreadyDetached: "Dieses Gerät war bereits getrennt. Die Liste ist aktuell.",

  browserTitle: "Dieser Browser",
  browserBody:
    "Du bist im Web mit dieser Adresse angemeldet. Ein Browser ist kein Gerät: Er erscheint nicht unter „Meine Geräte“.",
  signOut: "Abmelden von diesem Browser",
  signingOut: "Abmeldung läuft …",
  signOutFailed: "Die Abmeldung hat nicht funktioniert. Versuche es erneut.",

  cancel: "Abbrechen",
  close: "Schließen",
  retry: "Erneut versuchen",
  offlineTitle: "Keine Internetverbindung.",
  offlineBody: "Versuche es erneut, sobald das Netz wieder verfügbar ist.",
  unreachableTitle: "Der Dienst antwortet im Moment nicht.",
  unreachableBody: "Versuche es in einem Moment erneut.",
  failed: "Etwas ist schiefgelaufen. Versuche es erneut.",

  sessionEndedTitle: "Deine Sitzung ist beendet.",
  sessionEndedBody:
    "Melde dich erneut an: Ein Code wird an deine E-Mail-Adresse gesendet.",
  signInAgain: "In meinem Bereich anmelden",

  // The project's calibration set: the section of the space, its switch,
  // its rules and its withdrawal.
  calibrationTitle: "Himmelskalibrierung",
  calibrationSwitch: "Meine Werte der Himmelshelligkeit dem Projekt überlassen",
  calibrationIntro:
    "Deine Werte, auf deinen Einzelbildern gemessen oder eingegeben, helfen, die Himmelsschätzung für alle zu verbessern. Standardmäßig ausgeschaltet.",
  calibrationKept:
    "Was gespeichert wird: der Wert, sein Band (Kamera oder Sky-Meter), die Stufe des künstlichen Lichts rund um den Ort, die Kalibrierregion, das Jahr und die Version der Methode.",
  calibrationNotKept:
    "Nie gespeichert: der Ort, seine Koordinaten, sein Name, deine Adresse, eine Kennung deines Bereichs oder deiner Geräte.",
  calibrationRelease:
    "Der veröffentlichte Datensatz steht unter der Lizenz CC BY 4.0 (Namensnennung, kommerzielle Nutzung erlaubt). Eine bereits veröffentlichte Version des Datensatzes kann nicht zurückgerufen werden; wenn du deine Beiträge zurückziehen, wird alles gelöscht, was noch nicht veröffentlicht ist.",
  calibrationOffKeeps:
    "Ausschalten beendet neue Beiträge; was bereits gespeichert ist, bleibt, bis du es zurückziehen.",
  calibrationCount: (count, date) =>
    count === 1
      ? `1 Wert gespeichert, am ${date}`
      : `${count} Werte gespeichert, der letzte am ${date}`,
  calibrationNoneYet:
    "Noch kein Wert gespeichert: Werte werden gespeichert, sobald einer deiner Orte einen gemessenen oder eingegebenen Wert hat.",
  calibrationRules: "Die Regeln des Kalibrierdatensatzes",
  calibrationWithdraw: "Meine Beiträge zurückziehen",
  calibrationWithdrawing: "Wird zurückgezogen …",
  calibrationWithdrawTitle: "Deine Beiträge zurückziehen?",
  calibrationWithdrawBody:
    "Die gespeicherten Werte werden gelöscht und die Beiträge enden. Eine bereits veröffentlichte Version behält ihre eigenen.",
  calibrationWithdrawn: "Deine Beiträge wurden zurückgezogen.",
  calibrationFailed:
    "Die Einstellung konnte nicht geändert werden. Versuche es erneut.",
  calibrationUnavailable:
    "Der Stand deiner Beiträge konnte nicht gelesen werden. Versuche es später erneut.",
  calibrationOffline:
    "Offline: letzter bekannter Stand. Im Moment kann nichts geändert werden.",
};

const es = {
  title: "Espacio de Astro Portal",
  hostedLine: "Tu espacio de Astro Portal, en el servicio alojado",
  signInMethod:
    "Inicio de sesión mediante un código enviado a tu dirección de correo electrónico",
  connecting: "Conectando con el servicio…",

  devicesTitle: "Mis dispositivos",
  devicesNote:
    "Un dispositivo solo se vincula a un espacio. Un dispositivo perdido, o que ya no tienes, se desvincula aquí.",
  devicesLoading: "Cargando tus dispositivos…",
  devicesEmpty: "Todavía no hay ningún dispositivo vinculado a tu espacio.",
  devicesEmptyHint:
    "Inicia sesión desde PlanAstro o Astro Sync con la misma dirección de correo electrónico: el dispositivo se vincula solo.",
  devicesUnavailable:
    "No se pudo leer la lista de tus dispositivos. Inténtalo de nuevo más tarde.",
  activeNow: "Activo ahora",
  syncedOn: (date) => `Sincronizado el ${date}`,
  attachedOn: (date) => `Vinculado el ${date}`,
  renameTooltip: (name) => `Cambiar el nombre de ${name}`,
  detachTooltip: (name) => `Desvincular ${name} de tu espacio`,

  renameTitle: "Cambiar el nombre del dispositivo",
  renameField: "Nombre del dispositivo",
  renameSave: "Guardar este nombre",
  renameFailed: "No se pudo cambiar el nombre. Inténtalo de nuevo.",
  renameTooLong: `El nombre no puede superar los ${DEVICE_NAME_MAX} caracteres.`,

  detachTitle: "¿Desvincular este dispositivo?",
  detachAccessCut:
    "El acceso de ese dispositivo a tu espacio se corta de inmediato.",
  detachCopyErased:
    "La copia de tu espacio que conserva se borra la próxima vez que se conecte al servicio.",
  detachDataStays:
    "Tus planes, sesiones y capturas permanecen en tu espacio, en la web y en tus otros dispositivos.",
  detachReusable: "Después el dispositivo podrá servir para otro espacio.",
  detachConfirm: "Desvincular este dispositivo",
  detaching: "Desvinculando…",
  detachOffline:
    "Sin conexión a Internet: no se desvinculó nada. Inténtalo de nuevo en cuanto vuelva la red.",
  detachFailed: "No se pudo desvincular el dispositivo. Inténtalo de nuevo.",
  alreadyDetached:
    "Ese dispositivo ya estaba desvinculado. La lista está actualizada.",

  browserTitle: "Este navegador",
  browserBody:
    "Ha iniciado sesión en la web con esta dirección. Un navegador no es un dispositivo: no aparece en «Mis dispositivos».",
  signOut: "Cerrar sesión en este navegador",
  signingOut: "Cerrando sesión…",
  signOutFailed: "No se pudo cerrar la sesión. Inténtalo de nuevo.",

  cancel: "Cancelar",
  close: "Cerrar",
  retry: "Reintentar",
  offlineTitle: "Sin conexión a Internet.",
  offlineBody: "Inténtalo de nuevo en cuanto vuelva la red.",
  unreachableTitle: "El servicio no responde por ahora.",
  unreachableBody: "Inténtalo de nuevo en un momento.",
  failed: "Algo salió mal. Inténtalo de nuevo.",

  sessionEndedTitle: "Tu sesión ha terminado.",
  sessionEndedBody:
    "Inicia sesión de nuevo: se envía un código a tu dirección de correo electrónico.",
  signInAgain: "Iniciar sesión en mi espacio",

  // The project's calibration set: the section of the space, its switch,
  // its rules and its withdrawal.
  calibrationTitle: "Calibración del cielo",
  calibrationSwitch: "Confiar mis valores de fondo de cielo al proyecto",
  calibrationIntro:
    "Tus valores, medidos en tus tomas o introducidos, ayudan a afinar la estimación del cielo para todos. Desactivado de forma predeterminada.",
  calibrationKept:
    "Qué se guarda: el valor, su banda (cámara o medidor de cielo), el nivel de luz artificial alrededor del lugar, la región de calibración, el año y la versión del método.",
  calibrationNotKept:
    "Nunca se guarda: el lugar, sus coordenadas, su nombre, tu dirección, ningún identificador de tu espacio ni de tus dispositivos.",
  calibrationRelease:
    "El conjunto publicado se distribuye bajo la licencia CC BY 4.0 (atribución, uso comercial permitido). Una versión del conjunto ya publicada no se puede retirar; retirar tus contribuciones borra todo lo que aún no se ha publicado.",
  calibrationOffKeeps:
    "Desactivar detiene las nuevas contribuciones; lo que ya está guardado se queda hasta que usted lo retire.",
  calibrationCount: (count, date) =>
    count === 1
      ? `1 valor guardado, el ${date}`
      : `${count} valores guardados, el último el ${date}`,
  calibrationNoneYet:
    "Todavía no hay ningún valor guardado: se guardarán en cuanto uno de tus lugares tenga un valor medido o introducido.",
  calibrationRules: "Las reglas del conjunto de calibración",
  calibrationWithdraw: "Retirar mis contribuciones",
  calibrationWithdrawing: "Retirando…",
  calibrationWithdrawTitle: "¿Retirar tus contribuciones?",
  calibrationWithdrawBody:
    "Los valores guardados se borran y las contribuciones se detienen. Una versión ya publicada conserva los suyos.",
  calibrationWithdrawn: "Tus contribuciones se han retirado.",
  calibrationFailed: "No se pudo cambiar el ajuste. Inténtalo de nuevo.",
  calibrationUnavailable:
    "No se pudo leer el estado de tus contribuciones. Inténtalo de nuevo más tarde.",
  calibrationOffline:
    "Sin conexión: último estado conocido. Por ahora no se puede cambiar nada.",
};

const it = {
  title: "Spazio Astro Portal",
  hostedLine: "Lo spazio Astro Portal, sul servizio ospitato",
  signInMethod: "Accesso tramite un codice inviato all’indirizzo e-mail",
  connecting: "Connessione al servizio…",

  devicesTitle: "I miei dispositivi",
  devicesNote:
    "Un dispositivo è associato a un solo spazio. Un dispositivo smarrito, o che non si ha più, si scollega da qui.",
  devicesLoading: "Caricamento dei dispositivi…",
  devicesEmpty: "Nessun dispositivo è ancora associato allo spazio.",
  devicesEmptyHint:
    "Accedi da PlanAstro o Astro Sync con lo stesso indirizzo e-mail: il dispositivo si associa da solo.",
  devicesUnavailable:
    "Non è stato possibile leggere l’elenco dei dispositivi. Riprova più tardi.",
  activeNow: "Attivo adesso",
  syncedOn: (date) => `Sincronizzato il ${date}`,
  attachedOn: (date) => `Associato il ${date}`,
  renameTooltip: (name) => `Rinominare ${name}`,
  detachTooltip: (name) => `Scollegare ${name} dallo spazio`,

  renameTitle: "Rinominare il dispositivo",
  renameField: "Nome del dispositivo",
  renameSave: "Salvare questo nome",
  renameFailed: "Non è stato possibile cambiare il nome. Riprova.",
  renameTooLong: `Il nome non può superare i ${DEVICE_NAME_MAX} caratteri.`,

  detachTitle: "Scollegare questo dispositivo?",
  detachAccessCut:
    "L’accesso del dispositivo allo spazio viene interrotto subito.",
  detachCopyErased:
    "La copia dello spazio che conserva viene cancellata la prossima volta che raggiunge il servizio.",
  detachDataStays:
    "I piani, le sessioni e le riprese restano nello spazio, sul web e sugli altri dispositivi.",
  detachReusable: "Il dispositivo potrà poi servire per un altro spazio.",
  detachConfirm: "Scollegare questo dispositivo",
  detaching: "Scollegamento in corso…",
  detachOffline:
    "Nessuna connessione a Internet: nulla è stato scollegato. Riprova non appena la rete torna disponibile.",
  detachFailed: "Non è stato possibile scollegare il dispositivo. Riprova.",
  alreadyDetached:
    "Quel dispositivo era già scollegato. L’elenco è aggiornato.",

  browserTitle: "Questo browser",
  browserBody:
    "Si è connessi al web con questo indirizzo. Un browser non è un dispositivo: non compare in «I miei dispositivi».",
  signOut: "Disconnettersi da questo browser",
  signingOut: "Disconnessione in corso…",
  signOutFailed: "Non è stato possibile disconnettersi. Riprova.",

  cancel: "Annullare",
  close: "Chiudere",
  retry: "Riprovare",
  offlineTitle: "Nessuna connessione a Internet.",
  offlineBody: "Riprova non appena la rete torna disponibile.",
  unreachableTitle: "Il servizio non risponde al momento.",
  unreachableBody: "Riprova tra un momento.",
  failed: "Qualcosa è andato storto. Riprova.",

  sessionEndedTitle: "La sessione è terminata.",
  sessionEndedBody:
    "Accedi di nuovo: un codice viene inviato all’indirizzo e-mail.",
  signInAgain: "Accedere al proprio spazio",

  // The project's calibration set: the section of the space, its switch,
  // its rules and its withdrawal.
  calibrationTitle: "Calibrazione del cielo",
  calibrationSwitch:
    "Affidare al progetto i miei valori di luminosità del cielo",
  calibrationIntro:
    "I suoi valori, misurati sulle sue pose o inseriti, aiutano a migliorare la stima del cielo per tutti. Disattivato per impostazione predefinita.",
  calibrationKept:
    "Cosa viene conservato: il valore, la sua banda (fotocamera o misuratore del cielo), il livello di luce artificiale intorno al luogo, la regione di calibrazione, l’anno e la versione del metodo.",
  calibrationNotKept:
    "Mai conservati: il luogo, le sue coordinate, il suo nome, il suo indirizzo, alcun identificativo del suo spazio o dei suoi dispositivi.",
  calibrationRelease:
    "Il set pubblicato è distribuito con licenza CC BY 4.0 (attribuzione, uso commerciale consentito). Una versione del set già pubblicata non può essere richiamata; ritirare i suoi contributi cancella tutto ciò che non è ancora stato pubblicato.",
  calibrationOffKeeps:
    "Disattivare ferma i nuovi contributi; ciò che è già conservato resta finché non lo ritira.",
  calibrationCount: (count, date) =>
    count === 1
      ? `1 valore conservato, il ${date}`
      : `${count} valori conservati, l’ultimo il ${date}`,
  calibrationNoneYet:
    "Nessun valore conservato per ora: lo saranno appena uno dei suoi luoghi avrà un valore misurato o inserito.",
  calibrationRules: "Le regole del set di calibrazione",
  calibrationWithdraw: "Ritirare i miei contributi",
  calibrationWithdrawing: "Ritiro in corso…",
  calibrationWithdrawTitle: "Ritirare i suoi contributi?",
  calibrationWithdrawBody:
    "I valori conservati vengono cancellati e i contributi si fermano. Una versione già pubblicata conserva i propri.",
  calibrationWithdrawn: "I suoi contributi sono stati ritirati.",
  calibrationFailed:
    "Non è stato possibile modificare l’impostazione. Riprova.",
  calibrationUnavailable:
    "Non è stato possibile leggere lo stato dei tuoi contributi. Riprova più tardi.",
  calibrationOffline:
    "Offline: ultimo stato noto. Per ora non si può modificare nulla.",
};

const ptBR = {
  title: "Espaço do Astro Portal",
  hostedLine: "Seu espaço do Astro Portal, no serviço hospedado",
  signInMethod: "Login por um código enviado ao seu endereço de e-mail",
  connecting: "Conectando ao serviço…",

  devicesTitle: "Meus dispositivos",
  devicesNote:
    "Um dispositivo é vinculado a um único espaço. Um dispositivo perdido, ou que você não tem mais, é desvinculado aqui.",
  devicesLoading: "Carregando seus dispositivos…",
  devicesEmpty: "Nenhum dispositivo está vinculado ao seu espaço ainda.",
  devicesEmptyHint:
    "Entre pelo PlanAstro ou pelo Astro Sync com o mesmo endereço de e-mail: o dispositivo se vincula sozinho.",
  devicesUnavailable:
    "Não foi possível ler a lista dos seus dispositivos. Tente novamente mais tarde.",
  activeNow: "Ativo agora",
  syncedOn: (date) => `Sincronizado em ${date}`,
  attachedOn: (date) => `Vinculado em ${date}`,
  renameTooltip: (name) => `Renomear ${name}`,
  detachTooltip: (name) => `Desvincular ${name} do seu espaço`,

  renameTitle: "Renomear o dispositivo",
  renameField: "Nome do dispositivo",
  renameSave: "Salvar este nome",
  renameFailed: "Não foi possível alterar o nome. Tente novamente.",
  renameTooLong: `O nome não pode ter mais de ${DEVICE_NAME_MAX} caracteres.`,

  detachTitle: "Desvincular este dispositivo?",
  detachAccessCut:
    "O acesso desse dispositivo ao seu espaço é cortado imediatamente.",
  detachCopyErased:
    "A cópia do seu espaço que ele guarda é apagada na próxima vez que ele alcançar o serviço.",
  detachDataStays:
    "Seus planos, sessões e capturas permanecem no seu espaço, na web e nos seus outros dispositivos.",
  detachReusable: "Depois, o dispositivo poderá servir a outro espaço.",
  detachConfirm: "Desvincular este dispositivo",
  detaching: "Desvinculando…",
  detachOffline:
    "Sem conexão com a Internet: nada foi desvinculado. Tente novamente assim que a rede voltar.",
  detachFailed: "Não foi possível desvincular o dispositivo. Tente novamente.",
  alreadyDetached:
    "Esse dispositivo já estava desvinculado. A lista está atualizada.",

  browserTitle: "Este navegador",
  browserBody:
    "Você entrou na web com este endereço. Um navegador não é um dispositivo: ele não aparece em “Meus dispositivos”.",
  signOut: "Sair deste navegador",
  signingOut: "Saindo…",
  signOutFailed: "Não foi possível sair. Tente novamente.",

  cancel: "Cancelar",
  close: "Fechar",
  retry: "Tentar novamente",
  offlineTitle: "Sem conexão com a Internet.",
  offlineBody: "Tente novamente assim que a rede voltar.",
  unreachableTitle: "O serviço não está respondendo no momento.",
  unreachableBody: "Tente novamente em instantes.",
  failed: "Algo deu errado. Tente novamente.",

  sessionEndedTitle: "Sua sessão terminou.",
  sessionEndedBody:
    "Entre novamente: um código é enviado para o seu endereço de e-mail.",
  signInAgain: "Entrar no meu espaço",

  // The project's calibration set: the section of the space, its switch,
  // its rules and its withdrawal.
  calibrationTitle: "Calibração do céu",
  calibrationSwitch: "Confiar meus valores de fundo de céu ao projeto",
  calibrationIntro:
    "Seus valores, medidos nos seus frames ou digitados, ajudam a refinar a estimativa do céu para todos. Desativado por padrão.",
  calibrationKept:
    "O que é guardado: o valor, sua banda (câmera ou medidor de céu), o nível de luz artificial ao redor do local, a região de calibração, o ano e a versão do método.",
  calibrationNotKept:
    "Nunca guardados: o local, suas coordenadas, seu nome, seu endereço, nenhum identificador do seu espaço ou dos seus dispositivos.",
  calibrationRelease:
    "O conjunto publicado é distribuído sob a licença CC BY 4.0 (atribuição, uso comercial permitido). Uma versão do conjunto já publicada não pode ser recolhida; retirar suas contribuições apaga tudo o que ainda não foi publicado.",
  calibrationOffKeeps:
    "Desativar interrompe as novas contribuições; o que já está guardado fica até você retirar.",
  calibrationCount: (count, date) =>
    count === 1
      ? `1 valor guardado, em ${date}`
      : `${count} valores guardados, o último em ${date}`,
  calibrationNoneYet:
    "Nenhum valor guardado por enquanto: eles serão guardados assim que um dos seus locais tiver um valor medido ou digitado.",
  calibrationRules: "As regras do conjunto de calibração",
  calibrationWithdraw: "Retirar minhas contribuições",
  calibrationWithdrawing: "Retirando…",
  calibrationWithdrawTitle: "Retirar suas contribuições?",
  calibrationWithdrawBody:
    "Os valores guardados são apagados e as contribuições param. Uma versão já publicada mantém os seus.",
  calibrationWithdrawn: "Suas contribuições foram retiradas.",
  calibrationFailed: "Não foi possível mudar a configuração. Tente de novo.",
  calibrationUnavailable:
    "Não foi possível ler o estado das suas contribuições. Tente de novo mais tarde.",
  calibrationOffline:
    "Offline: último estado conhecido. Nada pode ser mudado por enquanto.",
};

const zhHans = {
  title: "Astro Portal空间",
  hostedLine: "你的Astro Portal空间，位于托管服务",
  signInMethod: "通过发送到你电子邮件地址的验证码登录",
  connecting: "正在连接服务……",

  devicesTitle: "我的设备",
  devicesNote:
    "一台设备只能绑定到一个空间。丢失的设备或已不再使用的设备，可在此解除绑定。",
  devicesLoading: "正在加载你的设备……",
  devicesEmpty: "你的空间还没有绑定任何设备。",
  devicesEmptyHint:
    "使用同一电子邮件地址，从PlanAstro或Astro Sync登录：设备会自动绑定。",
  devicesUnavailable: "无法读取你的设备。请稍后再试。",
  activeNow: "正在使用",
  syncedOn: (date) => `同步于${date}`,
  attachedOn: (date) => `绑定于${date}`,
  renameTooltip: (name) => `重命名${name}`,
  detachTooltip: (name) => `将${name}从你的空间解除绑定`,

  renameTitle: "重命名设备",
  renameField: "设备名称",
  renameSave: "保存此名称",
  renameFailed: "名称未能更改。请重试。",
  renameTooLong: `名称不能超过${DEVICE_NAME_MAX}个字符。`,

  detachTitle: "解除此设备的绑定？",
  detachAccessCut: "该设备对你空间的访问会立即中断。",
  detachCopyErased: "该设备保留的你空间的副本，会在它下次连接服务时被清除。",
  detachDataStays:
    "你的计划、观测记录和拍摄图像仍保留在你的空间中，以及网页和你的其他设备上。",
  detachReusable: "之后此设备可用于其他空间。",
  detachConfirm: "解除此设备绑定",
  detaching: "正在解除绑定……",
  detachOffline: "没有网络连接：未解除任何绑定。网络恢复后请再试一次。",
  detachFailed: "设备未能解除绑定。请重试。",
  alreadyDetached: "该设备已经解除绑定。列表已是最新。",

  browserTitle: "此浏览器",
  browserBody:
    "你正在网页上使用此地址登录。浏览器不是设备，不会出现在“我的设备”中。",
  signOut: "在此浏览器中退出登录",
  signingOut: "正在退出登录……",
  signOutFailed: "退出登录未能完成。请重试。",

  cancel: "取消",
  close: "关闭",
  retry: "重试",
  offlineTitle: "没有网络连接。",
  offlineBody: "网络恢复后请再试一次。",
  unreachableTitle: "服务目前没有响应。",
  unreachableBody: "请稍后再试。",
  failed: "出错了。请重试。",

  sessionEndedTitle: "你的登录已过期。",
  sessionEndedBody: "请重新登录：验证码会发送到你的电子邮件地址。",
  signInAgain: "登录我的空间",

  // The project's calibration set: the section of the space, its switch,
  // its rules and its withdrawal.
  calibrationTitle: "天空校准",
  calibrationSwitch: "将我的天空背景亮度值提供给项目",
  calibrationIntro:
    "你在图像上实测或手动输入的值，有助于为所有人改进天空估算。默认关闭。",
  calibrationKept:
    "保存的内容：数值、其波段（相机或天空亮度计）、地点周围的人工光等级、校准区域、年份和方法版本。",
  calibrationNotKept:
    "从不保存：地点、其坐标、名称、你的地址、你的空间或设备的任何标识符。",
  calibrationRelease:
    "发布的数据集采用 CC BY 4.0 许可（需署名，允许商业使用）。已发布的数据集版本无法撤回；撤回你的贡献会删除所有尚未发布的内容。",
  calibrationOffKeeps: "关闭后将停止新的贡献；已保存的内容会保留，直到你撤回。",
  calibrationCount: (count, date) =>
    count === 1
      ? `已保存 1 个值（${date}）`
      : `已保存 ${count} 个值，最近一次为 ${date}`,
  calibrationNoneYet:
    "尚未保存任何值：一旦你的某个地点有实测值或输入值，就会保存。",
  calibrationRules: "校准数据集的规则",
  calibrationWithdraw: "撤回我的贡献",
  calibrationWithdrawing: "正在撤回…",
  calibrationWithdrawTitle: "撤回你的贡献？",
  calibrationWithdrawBody:
    "已保存的值将被删除，贡献随之停止。已发布的版本会保留其中的值。",
  calibrationWithdrawn: "你的贡献已撤回。",
  calibrationFailed: "无法更改此设置。请重试。",
  calibrationUnavailable: "无法读取你的贡献状态。请稍后重试。",
  calibrationOffline: "离线：显示最后已知的状态。目前无法进行任何更改。",
};

const zhHant = {
  title: "Astro Portal 空間",
  hostedLine: "你的 Astro Portal 空間，位於代管服務",
  signInMethod: "透過寄至你電子郵件地址的驗證碼登入",
  connecting: "正在連線至服務……",

  devicesTitle: "我的裝置",
  devicesNote:
    "一部裝置只能連結至一個空間。遺失的裝置或已不再使用的裝置，可在此處解除連結。",
  devicesLoading: "正在載入你的裝置……",
  devicesEmpty: "你的空間目前尚未連結任何裝置。",
  devicesEmptyHint:
    "使用相同的電子郵件地址，從 PlanAstro 或 Astro Sync 登入：裝置會自動連結。",
  devicesUnavailable: "無法讀取你的裝置。請稍後再試。",
  activeNow: "目前使用中",
  syncedOn: (date) => `同步於 ${date}`,
  attachedOn: (date) => `連結於 ${date}`,
  renameTooltip: (name) => `重新命名 ${name}`,
  detachTooltip: (name) => `將 ${name} 從你的空間解除連結`,

  renameTitle: "重新命名裝置",
  renameField: "裝置名稱",
  renameSave: "儲存此名稱",
  renameFailed: "無法變更名稱。請再試一次。",
  renameTooLong: `名稱不能超過 ${DEVICE_NAME_MAX} 個字元。`,

  detachTitle: "要解除此裝置的連結嗎？",
  detachAccessCut: "該裝置對你空間的存取會立即中斷。",
  detachCopyErased: "該裝置保留的空間副本，會在下次連線至服務時清除。",
  detachDataStays:
    "你的計畫、觀測記錄與拍攝影像仍保留在你的空間、網頁版與其他裝置上。",
  detachReusable: "之後，此裝置可用於另一個空間。",
  detachConfirm: "解除此裝置的連結",
  detaching: "正在解除連結……",
  detachOffline: "沒有網際網路連線：未解除任何連結。網路恢復後請再試一次。",
  detachFailed: "無法解除此裝置的連結。請再試一次。",
  alreadyDetached: "該裝置先前已解除連結。清單已是最新。",

  browserTitle: "此瀏覽器",
  browserBody:
    "你正在網頁上使用此地址登入。瀏覽器不是裝置，不會出現在「我的裝置」中。",
  signOut: "登出此瀏覽器",
  signingOut: "正在登出……",
  signOutFailed: "登出未完成。請再試一次。",

  cancel: "取消",
  close: "關閉",
  retry: "再試一次",
  offlineTitle: "沒有網際網路連線。",
  offlineBody: "網路恢復後請再試一次。",
  unreachableTitle: "服務目前沒有回應。",
  unreachableBody: "請稍後再試。",
  failed: "發生問題。請再試一次。",

  sessionEndedTitle: "你的登入已過期。",
  sessionEndedBody: "請重新登入：驗證碼會寄至你的電子郵件地址。",
  signInAgain: "登入我的空間",

  // The project's calibration set: the section of the space, its switch,
  // its rules and its withdrawal.
  calibrationTitle: "天空校準",
  calibrationSwitch: "將我的天空背景亮度值提供給專案",
  calibrationIntro:
    "你在影格上實測或手動輸入的值，有助於為所有人改善天空估算。預設為關閉。",
  calibrationKept:
    "保存的內容：數值、其波段（相機或天空亮度計）、地點周圍的人工光等級、校準區域、年份和方法版本。",
  calibrationNotKept:
    "從不保存：地點、其座標、名稱、你的地址、你的空間或裝置的任何識別碼。",
  calibrationRelease:
    "發布的資料集採用 CC BY 4.0 授權（需標示姓名，允許商業使用）。已發布的資料集版本無法撤回；撤回你的貢獻會刪除所有尚未發布的內容。",
  calibrationOffKeeps: "關閉後將停止新的貢獻；已保存的內容會保留，直到你撤回。",
  calibrationCount: (count, date) =>
    count === 1
      ? `已保存 1 個值（${date}）`
      : `已保存 ${count} 個值，最近一次為 ${date}`,
  calibrationNoneYet:
    "尚未保存任何值：一旦你的某個地點有實測值或輸入值，就會保存。",
  calibrationRules: "校準資料集的規則",
  calibrationWithdraw: "撤回我的貢獻",
  calibrationWithdrawing: "正在撤回…",
  calibrationWithdrawTitle: "撤回你的貢獻？",
  calibrationWithdrawBody:
    "已保存的值將被刪除，貢獻隨之停止。已發布的版本會保留其中的值。",
  calibrationWithdrawn: "你的貢獻已撤回。",
  calibrationFailed: "無法變更此設定。請再試一次。",
  calibrationUnavailable: "無法讀取你的貢獻狀態。請稍後再試。",
  calibrationOffline: "離線：顯示最後已知的狀態。目前無法進行任何變更。",
};

const ru = {
  title: "Пространство Astro Portal",
  hostedLine: "Ваше пространство Astro Portal в облачном сервисе",
  signInMethod: "Вход по коду, отправленному на ваш адрес электронной почты",
  connecting: "Подключение к сервису…",

  devicesTitle: "Мои устройства",
  devicesNote:
    "Устройство привязывается только к одному пространству. Потерянное или ненужное устройство отвязывается здесь.",
  devicesLoading: "Загрузка ваших устройств…",
  devicesEmpty: "К вашему пространству пока не привязано ни одного устройства.",
  devicesEmptyHint:
    "Войдите в PlanAstro или Astro Sync с тем же адресом электронной почты: устройство привяжется само.",
  devicesUnavailable:
    "Не удалось получить список ваших устройств. Повторите попытку позже.",
  activeNow: "Активно сейчас",
  syncedOn: (date) => `Синхронизировано ${date}`,
  attachedOn: (date) => `Привязано ${date}`,
  renameTooltip: (name) => `Переименовать ${name}`,
  detachTooltip: (name) => `Отвязать ${name} от вашего пространства`,

  renameTitle: "Переименовать устройство",
  renameField: "Название устройства",
  renameSave: "Сохранить название",
  renameFailed: "Не удалось изменить название. Повторите попытку.",
  // Genitive after « длиннее » : 1 символа, 2 символов, 120 символов.
  renameTooLong: `Название не может быть длиннее ${DEVICE_NAME_MAX} ${russianCount(DEVICE_NAME_MAX, { one: "символа", few: "символов", many: "символов" })}.`,

  detachTitle: "Отвязать это устройство?",
  detachAccessCut: "Его доступ к вашему пространству прекращается сразу.",
  detachCopyErased:
    "Копия вашего пространства, которая там хранится, будет стёрта при следующем подключении устройства к сервису.",
  detachDataStays:
    "Ваши планы, сеансы и снимки останутся в вашем пространстве, в вебе и на других ваших устройствах.",
  detachReusable:
    "После этого устройство можно использовать с другим пространством.",
  detachConfirm: "Отвязать это устройство",
  detaching: "Отвязывание…",
  detachOffline:
    "Нет подключения к интернету: ничего не отвязано. Повторите попытку, как только появится сеть.",
  detachFailed: "Не удалось отвязать устройство. Повторите попытку.",
  alreadyDetached: "Это устройство уже было отвязано. Список обновлён.",

  browserTitle: "Этот браузер",
  browserBody:
    "Вы вошли в браузере с этим адресом. Браузер — не устройство, поэтому его нет в разделе «Мои устройства».",
  signOut: "Выйти из этого браузера",
  signingOut: "Выход…",
  signOutFailed: "Не удалось выйти. Повторите попытку.",

  cancel: "Отмена",
  close: "Закрыть",
  retry: "Повторить",
  offlineTitle: "Нет подключения к интернету.",
  offlineBody: "Повторите попытку, как только появится сеть.",
  unreachableTitle: "Сервис сейчас не отвечает.",
  unreachableBody: "Повторите попытку чуть позже.",
  failed: "Что-то пошло не так. Повторите попытку.",

  sessionEndedTitle: "Ваш вход больше не действует.",
  sessionEndedBody: "Войдите снова: код придёт на ваш адрес электронной почты.",
  signInAgain: "Войти в моё пространство",

  // The project's calibration set: the section of the space, its switch,
  // its rules and its withdrawal.
  calibrationTitle: "Калибровка неба",
  calibrationSwitch: "Передавать проекту мои значения фона неба",
  calibrationIntro:
    "Ваши значения, измеренные по вашим кадрам или введённые вручную, помогают уточнить оценку неба для всех. По умолчанию выключено.",
  calibrationKept:
    "Что сохраняется: значение, его полоса (камера или измеритель яркости неба), уровень искусственного света вокруг места, регион калибровки, год и версия метода.",
  calibrationNotKept:
    "Никогда не сохраняется: место, его координаты, его название, ваш адрес, любой идентификатор вашего пространства или ваших устройств.",
  calibrationRelease:
    "Опубликованный набор распространяется по лицензии CC BY 4.0 (с указанием авторства, коммерческое использование разрешено). Уже опубликованную версию набора нельзя отозвать; отзыв ваших вкладов удаляет всё, что ещё не опубликовано.",
  calibrationOffKeeps:
    "Выключение останавливает новые вклады; уже сохранённое остаётся, пока вы его не отзовёте.",
  calibrationCount: (count, date) =>
    russianCount(count, {
      one: `Сохранено ${count} значение, последнее — ${date}`,
      few: `Сохранено ${count} значения, последнее — ${date}`,
      many: `Сохранено ${count} значений, последнее — ${date}`,
    }),
  calibrationNoneYet:
    "Пока ничего не сохранено: значения сохранятся, как только у одного из ваших мест появится измеренное или введённое значение.",
  calibrationRules: "Правила калибровочного набора",
  calibrationWithdraw: "Отозвать мои вклады",
  calibrationWithdrawing: "Отзыв…",
  calibrationWithdrawTitle: "Отозвать ваши вклады?",
  calibrationWithdrawBody:
    "Сохранённые значения удаляются, и вклады прекращаются. Уже опубликованная версия сохраняет свои.",
  calibrationWithdrawn: "Ваши вклады отозваны.",
  calibrationFailed: "Не удалось изменить настройку. Попробуйте ещё раз.",
  calibrationUnavailable:
    "Не удалось прочитать состояние ваших вкладов. Попробуйте позже.",
  calibrationOffline:
    "Нет сети: последнее известное состояние. Сейчас ничего нельзя изменить.",
};

export const spaceCopy = {
  fr: fr,
  en: en,
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
 * What a private server says otherwise: « votre portail », and a device
 * that can come back rather than serve another space. The page keeps the
 * name the header gives it on a private server (« Compte »).
 */
export const closedSpaceCopy = {
  fr: {
    title: "Compte",
    hostedLine: "Votre portail, sur votre propre serveur",
    connecting: "Connexion au portail…",
    devicesNote: "Un appareil perdu ou que vous n’avez plus se détache ici.",
    devicesEmpty:
      "Aucun appareil n’est rattaché à votre portail pour le moment.",
    devicesEmptyHint:
      "Dans PlanAstro ou Astro Sync, saisissez l’adresse de ce portail, puis connectez-vous avec la même adresse e-mail : l’appareil se rattache tout seul.",
    detachTooltip: (name) => `Détacher ${name} de votre portail`,
    detachAccessCut: "Son accès à votre portail est coupé tout de suite.",
    detachCopyErased:
      "La copie de votre portail qu’il garde est effacée la prochaine fois qu’il joint le portail.",
    detachDataStays:
      "Vos plans, sessions et captures restent dans votre portail, sur le web et sur vos autres appareils.",
    detachReusable:
      "Vous pourrez le rattacher de nouveau en vous connectant depuis l’appareil.",
    unreachableTitle: "Le portail ne répond pas pour le moment.",
    signInAgain: "Me connecter à mon portail",
  },
  en: {
    title: "Account",
    hostedLine: "Your portal, on your own server",
    connecting: "Connecting to the portal…",
    devicesNote: "A lost device, or one you no longer have, is detached here.",
    devicesEmpty: "No device is attached to your portal yet.",
    devicesEmptyHint:
      "In PlanAstro or Astro Sync, enter the address of this portal, then sign in with the same e-mail address: the device attaches itself.",
    detachTooltip: (name) => `Detach ${name} from your portal`,
    detachAccessCut: "Its access to your portal is cut at once.",
    detachCopyErased:
      "The copy of your portal it keeps is erased the next time it reaches the portal.",
    detachDataStays:
      "Your plans, sessions and captures stay in your portal, on the web and on your other devices.",
    detachReusable: "You can attach it again by signing in from the device.",
    unreachableTitle: "The portal is not answering right now.",
    signInAgain: "Sign in to my portal",
  },
  ja: {
    title: "アカウント",
    hostedLine: "ご自身のサーバー上のポータル",
    connecting: "ポータルに接続中…",
    devicesNote: "紛失した端末や手放した端末は、ここで切り離します。",
    devicesEmpty: "ポータルに紐付けられた端末はまだありません。",
    devicesEmptyHint:
      "PlanAstro または Astro Sync でこのポータルのアドレスを入力し、同じメールアドレスでサインインすると、端末は自動的に紐付けられます。",
    detachTooltip: (name) => `${name} をポータルから切り離す`,
    detachAccessCut: "その端末のポータルへのアクセスは、すぐに遮断されます。",
    detachCopyErased:
      "その端末に残るポータルのコピーは、次にポータルに接続したときに削除されます。",
    detachDataStays:
      "プラン、セッション、キャプチャはポータルに残り、ウェブや他の端末で引き続き利用できます。",
    detachReusable: "端末からサインインすれば、もう一度紐付けられます。",
    unreachableTitle: "現在、ポータルが応答していません。",
    signInAgain: "ポータルにサインインする",
  },
  de: {
    title: "Konto",
    hostedLine: "Dein Portal auf deinem eigenen Server",
    connecting: "Verbindung zum Portal wird hergestellt …",
    devicesNote:
      "Ein verlorenes oder nicht mehr vorhandenes Gerät trennst du hier.",
    devicesEmpty: "Mit deinem Portal ist noch kein Gerät verbunden.",
    devicesEmptyHint:
      "Gib in PlanAstro oder Astro Sync die Adresse dieses Portals ein und melde dich dann mit derselben E-Mail-Adresse an: Das Gerät wird automatisch verbunden.",
    detachTooltip: (name) => `${name} von deinem Portal trennen`,
    detachAccessCut:
      "Der Zugriff dieses Geräts auf dein Portal wird sofort unterbrochen.",
    detachCopyErased:
      "Die Kopie deines Portals, die es behält, wird gelöscht, sobald es das Portal das nächste Mal erreicht.",
    detachDataStays:
      "Deine Pläne, Sitzungen und Aufnahmen bleiben in deinem Portal, im Web und auf deinen anderen Geräten.",
    detachReusable:
      "Du kannst es erneut verbinden, indem du dich vom Gerät aus anmeldest.",
    unreachableTitle: "Das Portal antwortet im Moment nicht.",
    signInAgain: "Bei meinem Portal anmelden",
  },
  es: {
    title: "Cuenta",
    hostedLine: "Tu portal, en tu propio servidor",
    connecting: "Conectando con el portal…",
    devicesNote:
      "Un dispositivo perdido, o que ya no tienes, se desvincula aquí.",
    devicesEmpty: "Todavía no hay ningún dispositivo vinculado a tu portal.",
    devicesEmptyHint:
      "En PlanAstro o Astro Sync, escribe la dirección de este portal y luego inicia sesión con la misma dirección de correo electrónico: el dispositivo se vincula solo.",
    detachTooltip: (name) => `Desvincular ${name} de tu portal`,
    detachAccessCut:
      "El acceso de ese dispositivo a tu portal se corta de inmediato.",
    detachCopyErased:
      "La copia de tu portal que conserva se borra la próxima vez que se conecte al portal.",
    detachDataStays:
      "Tus planes, sesiones y capturas permanecen en tu portal, en la web y en tus otros dispositivos.",
    detachReusable:
      "Podrás volver a vincularlo iniciando sesión desde el dispositivo.",
    unreachableTitle: "El portal no responde por ahora.",
    signInAgain: "Iniciar sesión en mi portal",
  },
  it: {
    title: "Account",
    hostedLine: "Il portale, sul tuo server",
    connecting: "Connessione al portale…",
    devicesNote:
      "Un dispositivo smarrito, o che non hai più, si scollega da qui.",
    devicesEmpty: "Nessun dispositivo è ancora associato al portale.",
    devicesEmptyHint:
      "In PlanAstro o Astro Sync, inserisci l’indirizzo di questo portale, poi accedi con lo stesso indirizzo e-mail: il dispositivo si associa da solo.",
    detachTooltip: (name) => `Scollegare ${name} dal portale`,
    detachAccessCut:
      "L’accesso del dispositivo al portale viene interrotto subito.",
    detachCopyErased:
      "La copia del portale che conserva viene cancellata la prossima volta che raggiunge il portale.",
    detachDataStays:
      "I piani, le sessioni e le riprese restano nel portale, sul web e sugli altri dispositivi.",
    detachReusable: "Potrai associarlo di nuovo accedendo dal dispositivo.",
    unreachableTitle: "Il portale non risponde al momento.",
    signInAgain: "Accedere al proprio portale",
  },
  "pt-BR": {
    title: "Conta",
    hostedLine: "Seu portal, no seu próprio servidor",
    connecting: "Conectando ao portal…",
    devicesNote:
      "Um dispositivo perdido, ou que você não tem mais, é desvinculado aqui.",
    devicesEmpty: "Nenhum dispositivo está vinculado ao seu portal ainda.",
    devicesEmptyHint:
      "No PlanAstro ou no Astro Sync, digite o endereço deste portal e depois entre com o mesmo endereço de e-mail: o dispositivo se vincula sozinho.",
    detachTooltip: (name) => `Desvincular ${name} do seu portal`,
    detachAccessCut:
      "O acesso desse dispositivo ao seu portal é cortado imediatamente.",
    detachCopyErased:
      "A cópia do seu portal que ele guarda é apagada na próxima vez que ele alcançar o portal.",
    detachDataStays:
      "Seus planos, sessões e capturas permanecem no seu portal, na web e nos seus outros dispositivos.",
    detachReusable:
      "Você poderá vinculá-lo de novo entrando no seu espaço a partir do dispositivo.",
    unreachableTitle: "O portal não está respondendo no momento.",
    signInAgain: "Entrar no meu portal",
  },
  "zh-Hans": {
    title: "账户",
    hostedLine: "你的门户，位于你自己的服务器",
    connecting: "正在连接门户……",
    devicesNote: "丢失的设备或已不再使用的设备，可在此解除绑定。",
    devicesEmpty: "你的门户还没有绑定任何设备。",
    devicesEmptyHint:
      "在PlanAstro或Astro Sync中输入此门户的地址，然后使用同一电子邮件地址登录：设备会自动绑定。",
    detachTooltip: (name) => `将${name}从你的门户解除绑定`,
    detachAccessCut: "该设备对你门户的访问会立即中断。",
    detachCopyErased: "该设备保留的你门户的副本，会在它下次连接门户时被清除。",
    detachDataStays:
      "你的计划、观测记录和拍摄图像仍保留在你的门户中，以及网页和你的其他设备上。",
    detachReusable: "你可以在该设备上重新登录，再次绑定。",
    unreachableTitle: "门户目前没有响应。",
    signInAgain: "登录我的门户",
  },
  "zh-Hant": {
    title: "帳號",
    hostedLine: "你的入口網站，位於你自己的伺服器",
    connecting: "正在連線至入口網站……",
    devicesNote: "遺失的裝置或已不再使用的裝置，可在此處解除連結。",
    devicesEmpty: "你的入口網站目前尚未連結任何裝置。",
    devicesEmptyHint:
      "在 PlanAstro 或 Astro Sync 中輸入此入口網站的地址，然後使用相同的電子郵件地址登入：裝置會自動連結。",
    detachTooltip: (name) => `將 ${name} 從你的入口網站解除連結`,
    detachAccessCut: "該裝置對你入口網站的存取會立即中斷。",
    detachCopyErased:
      "該裝置保留的入口網站副本，會在下次連線至入口網站時清除。",
    detachDataStays:
      "你的計畫、觀測記錄與拍攝影像仍保留在你的入口網站、網頁版與其他裝置上。",
    detachReusable: "你可以從此裝置登入，重新連結。",
    unreachableTitle: "入口網站目前沒有回應。",
    signInAgain: "登入我的入口網站",
  },
  ru: {
    title: "Аккаунт",
    hostedLine: "Ваш портал на вашем собственном сервере",
    connecting: "Подключение к порталу…",
    devicesNote: "Потерянное или ненужное устройство можно отвязать здесь.",
    devicesEmpty: "К вашему порталу пока не привязано ни одного устройства.",
    devicesEmptyHint:
      "В PlanAstro или Astro Sync введите адрес этого портала, затем войдите с тем же адресом электронной почты: устройство привяжется само.",
    detachTooltip: (name) => `Отвязать ${name} от вашего портала`,
    detachAccessCut: "Его доступ к вашему порталу прекращается сразу.",
    detachCopyErased:
      "Копия вашего портала, которую оно хранит, будет удалена, когда оно в следующий раз подключится к порталу.",
    detachDataStays:
      "Ваши планы, сеансы и снимки останутся на вашем портале — в браузере и на других ваших устройствах.",
    detachReusable: "Вы сможете привязать его снова, войдя с этого устройства.",
    unreachableTitle: "Портал сейчас не отвечает.",
    signInAgain: "Войти в мой портал",
  },
};

const NO_BREAK = "\u00a0";

/** French wants a no-break space before « ? : ; ! » and inside « ». */
export function frenchTypography(text) {
  return String(text)
    .replace(/ ([?:;!»])/g, `${NO_BREAK}$1`)
    .replace(/« /g, `«${NO_BREAK}`);
}

/** A table of words with French typography, for the French ones. */
export function typographic(table) {
  return Object.fromEntries(
    Object.entries(table).map(([key, value]) => [
      key,
      typeof value === "function"
        ? (...args) => frenchTypography(value(...args))
        : Array.isArray(value)
          ? value.map(frenchTypography)
          : frenchTypography(value),
    ]),
  );
}

const french = typographic(fr);
const frenchClosed = typographic({ ...fr, ...closedSpaceCopy.fr });
const closed = {
  en: { ...en, ...closedSpaceCopy.en },
  ja: { ...ja, ...closedSpaceCopy.ja },
  de: { ...de, ...closedSpaceCopy.de },
  es: { ...es, ...closedSpaceCopy.es },
  it: { ...it, ...closedSpaceCopy.it },
  "pt-BR": { ...ptBR, ...closedSpaceCopy["pt-BR"] },
  "zh-Hans": { ...zhHans, ...closedSpaceCopy["zh-Hans"] },
  "zh-Hant": { ...zhHant, ...closedSpaceCopy["zh-Hant"] },
  ru: { ...ru, ...closedSpaceCopy.ru },
};

/**
 * The words of a language (English for one this table does not have), for
 * a server whose spaces are open (`open`) or a private server (`closed`).
 */
export function spaceCopyFor(locale, { spaceCreation = "open" } = {}) {
  if (spaceCreation === "closed")
    return locale === "fr"
      ? frenchClosed
      : copyFor(closed, locale, "space-copy.closed");
  if (locale === "fr") return french;
  return copyFor(spaceCopy, locale, "space-copy.spaceCopy");
}
