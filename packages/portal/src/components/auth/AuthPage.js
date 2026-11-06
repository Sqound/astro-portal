"use client";

import { copyFor } from "astro-contracts/locales";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { productName } from "portal/i18n.js";
import { nextDestination } from "portal/safe-redirect.js";
import { otpDigitOfKey, otpDigits, otpInsert } from "../otp-code.js";

/**
 * A private server's own pages of the sign-in (docs/PRIVATE_NOTEBOOK_AUTH.md):
 * its installation (`/auth/bootstrap`), the sign-in by address and password
 * (`/auth/login`, the `password` mode) and the recovery codes
 * (`/auth/recovery`, either mode). The sign-in by e-mail code has its own
 * page (components/space/SpaceSignInPage.js). `method` is the mode of the
 * server (`password` or `email-code`), read from `/api/auth/status` when
 * the route does not say it.
 */
const post = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok)
    throw Object.assign(
      new Error(data.error?.message || data.error || "Request failed."),
      {
        code: data.error?.code || data.code || null,
        retryAt: data.retryAt || null,
        attemptsRemaining: data.attemptsRemaining ?? null,
        status: response.status,
      },
    );
  return data;
};

export const authCopy = {
  en: {
    privateSpaceIntro: "Secure access to your personal observing notebook.",
    eyebrow: "YOUR PORTAL",
    signInTitle: "Sign in",
    signInIntro:
      "Type the e-mail address and the password chosen when this portal was set up.",
    email: "E-mail address",
    passwordLabel: "Password",
    signIn: "Sign in",
    signingIn: "Signing you in…",
    recovery: "Use a recovery code",
    recoveryEyebrow: "RECOVERY CODE",
    recoveryTitle: "Use a recovery code",
    recoveryIntro:
      "Type one of your unused recovery codes. It is used up once you are signed in. It is the way back when this portal’s e-mails no longer arrive.",
    recoveryIntroPassword:
      "Type one of your unused recovery codes and choose a new password. The code is used up once you are signed in.",
    recoveryLabel: "Recovery code",
    newPassword: "New password",
    confirmNewPassword: "Confirm the new password",
    backToPassword: "Sign in with the password",
    backToCode: "Receive a code by e-mail",
    checking: "Checking the sign-in…",
    disabled: "Signing in is off",
    disabledBody:
      "Set ASTRO_PORTAL_AUTH_MODE to password or email-code, with the private settings they need, before using this page (docs/PRIVATE_NOTEBOOK_AUTH.md).",
    notReady: "Signing in is not ready",
    notReadyBody: "The private settings of the sign-in are incomplete.",
    setup: "SETUP",
    initialize: "Set up {productName}",
    initializeIntro: "This page works only before the first account exists.",
    initializeCodeIntro:
      "A six-digit code leaves for this address at once: this is how you check, from the setup on, that this portal sends its e-mails.",
    bootstrapSecret: "Bootstrap secret",
    organization: "Organization",
    accountPassphrase: "Password (14 characters or more)",
    confirmPassphrase: "Confirm the password",
    createAccount: "Create the account",
    sendSetupCode: "Send the code",
    sendingSetupCode: "Sending…",
    enterSetupCode: "Type the code you received",
    enterSetupCodeIntro: (email) =>
      `A six-digit code has just left for ${email}. It is valid for ten minutes.`,
    verifySetup: "Check and finish the setup",
    restartSetup: "Use another address",
    saveRecoveryCodes: "Save your recovery codes",
    saveRecoveryIntro:
      "Keep these single-use codes offline. They are shown only once; each one signs you in if you lose your password or if this portal’s e-mails no longer arrive.",
    saved: "I saved them",
    copyCodes: "Copy",
    copiedCodes: "Copied",
    downloadCodes: "Download",
    defaultOrganization: "Personal observatory",
    passwordMismatch: "The password confirmation does not match.",
    otpAria: "Six-digit code",
    digit: "Digit",
    typeCode: "Type the six-digit code.",
    attemptsRemaining: (count) =>
      count === 1
        ? "One more try, then a wait."
        : `${count} more tries, then a wait.`,
    locked: (time) =>
      `Too many tries: this address cannot sign in from here before ${time}. A recovery code is still accepted.`,
    rateLimited: (time) =>
      `Too many tries from this network. Try again after ${time}.`,
    failures: {
      sign_in_password_incorrect:
        "This address and this password do not match.",
      recovery_code_incorrect:
        "This recovery code is not one, or was already used.",
      password_too_short: "Use a password of at least 14 characters.",
      email_invalid: "Enter a valid e-mail address.",
      not_initialized: "This portal is not set up yet.",
      sign_in_code_incorrect: "This code is not the right one.",
      sign_in_code_expired: "This code is no longer valid. Ask for a new one.",
      sign_in_unavailable:
        "This portal cannot send its codes: its sender is not set up (docs/PRIVATE_NOTEBOOK_AUTH.md).",
      email_delivery_failed:
        "The e-mail could not leave. Check the settings of the sender, then try again.",
      "Bootstrap is already closed.":
        "The first account already exists. Sign in instead.",
      "Invalid bootstrap secret.": "The bootstrap secret is not correct.",
    },
  },
  fr: {
    privateSpaceIntro: "Accès sécurisé à votre carnet d’observation personnel.",
    eyebrow: "VOTRE PORTAIL",
    signInTitle: "Se connecter",
    signInIntro:
      "Saisissez l’adresse e-mail et le mot de passe choisis à l’installation de ce portail.",
    email: "Adresse e-mail",
    passwordLabel: "Mot de passe",
    signIn: "Se connecter",
    signingIn: "Connexion en cours…",
    recovery: "Utiliser un code de secours",
    recoveryEyebrow: "CODE DE SECOURS",
    recoveryTitle: "Utiliser un code de secours",
    recoveryIntro:
      "Saisissez l’un de vos codes de secours inutilisés. Il est consommé une fois la connexion réussie. C’est la voie de retour quand les e-mails de ce portail n’arrivent plus.",
    recoveryIntroPassword:
      "Saisissez l’un de vos codes de secours inutilisés et choisissez un nouveau mot de passe. Le code est consommé une fois la connexion réussie.",
    recoveryLabel: "Code de secours",
    newPassword: "Nouveau mot de passe",
    confirmNewPassword: "Confirmer le nouveau mot de passe",
    backToPassword: "Se connecter avec le mot de passe",
    backToCode: "Recevoir un code par e-mail",
    checking: "Vérification de la connexion…",
    disabled: "La connexion est désactivée",
    disabledBody:
      "Réglez ASTRO_PORTAL_AUTH_MODE sur password ou email-code, avec les réglages privés nécessaires, avant d’utiliser cette page (docs/PRIVATE_NOTEBOOK_AUTH.md).",
    notReady: "La connexion n’est pas prête",
    notReadyBody: "Les réglages privés de la connexion sont incomplets.",
    setup: "INSTALLATION",
    initialize: "Installer {productName}",
    initializeIntro:
      "Cette page ne fonctionne qu’avant la création du premier compte.",
    initializeCodeIntro:
      "Un code à six chiffres part aussitôt vers cette adresse : vous vérifiez ainsi, dès l’installation, que ce portail envoie bien ses e-mails.",
    bootstrapSecret: "Secret d’amorçage",
    organization: "Organisation",
    accountPassphrase: "Mot de passe (14 caractères ou plus)",
    confirmPassphrase: "Confirmer le mot de passe",
    createAccount: "Créer le compte",
    sendSetupCode: "Envoyer le code",
    sendingSetupCode: "Envoi…",
    enterSetupCode: "Saisissez le code reçu",
    enterSetupCodeIntro: (email) =>
      `Un code à six chiffres vient de partir vers ${email}. Il reste valable dix minutes.`,
    verifySetup: "Vérifier et terminer l’installation",
    restartSetup: "Changer d’adresse",
    saveRecoveryCodes: "Enregistrez vos codes de secours",
    saveRecoveryIntro:
      "Conservez ces codes à usage unique hors ligne. Ils ne sont affichés qu’une fois ; chacun vous connecte si vous perdez votre mot de passe ou si les e-mails de ce portail n’arrivent plus.",
    saved: "Je les ai enregistrés",
    copyCodes: "Copier",
    copiedCodes: "Copié",
    downloadCodes: "Télécharger",
    defaultOrganization: "Observatoire personnel",
    passwordMismatch: "La confirmation ne correspond pas au mot de passe.",
    otpAria: "Code à six chiffres",
    digit: "Chiffre",
    typeCode: "Saisissez le code à six chiffres.",
    attemptsRemaining: (count) =>
      count === 1
        ? "Encore un essai, puis une attente."
        : `Encore ${count} essais, puis une attente.`,
    locked: (time) =>
      `Trop d’essais : cette adresse ne peut plus se connecter d’ici avant ${time}. Un code de secours reste accepté.`,
    rateLimited: (time) =>
      `Trop d’essais depuis ce réseau. Réessayez après ${time}.`,
    failures: {
      sign_in_password_incorrect:
        "L’adresse et le mot de passe ne correspondent pas.",
      recovery_code_incorrect:
        "Ce code de secours n’en est pas un, ou il a déjà servi.",
      password_too_short:
        "Choisissez un mot de passe d’au moins 14 caractères.",
      email_invalid: "Saisissez une adresse e-mail valide.",
      not_initialized: "Ce portail n’est pas encore installé.",
      sign_in_code_incorrect: "Ce code n’est pas le bon.",
      sign_in_code_expired:
        "Ce code n’est plus valable. Demandez-en un nouveau.",
      sign_in_unavailable:
        "Ce portail ne peut pas envoyer ses codes : son expéditeur n’est pas réglé (docs/PRIVATE_NOTEBOOK_AUTH.md).",
      email_delivery_failed:
        "L’e-mail n’a pas pu partir. Vérifiez les réglages de l’expéditeur, puis réessayez.",
      "Bootstrap is already closed.":
        "Le premier compte existe déjà. Connectez-vous.",
      "Invalid bootstrap secret.": "Le secret d’amorçage n’est pas le bon.",
    },
  },
  ja: {
    privateSpaceIntro: "個人用観測ノートへの安全なアクセスです。",
    eyebrow: "ポータル",
    signInTitle: "サインイン",
    signInIntro:
      "このポータルの設定時に決めたメールアドレスとパスワードを入力してください。",
    email: "メールアドレス",
    passwordLabel: "パスワード",
    signIn: "サインイン",
    signingIn: "サインイン中…",
    recovery: "リカバリーコードを使う",
    recoveryEyebrow: "リカバリーコード",
    recoveryTitle: "リカバリーコードを使う",
    recoveryIntro:
      "未使用のリカバリーコードを1つ入力してください。サインインに成功すると使用済みになります。このポータルのメールが届かなくなったときの戻り道です。",
    recoveryIntroPassword:
      "未使用のリカバリーコードを1つ入力し、新しいパスワードを決めてください。サインインに成功するとコードは使用済みになります。",
    recoveryLabel: "リカバリーコード",
    newPassword: "新しいパスワード",
    confirmNewPassword: "新しいパスワードを確認",
    backToPassword: "パスワードでサインイン",
    backToCode: "メールでコードを受け取る",
    checking: "サインインを確認しています…",
    disabled: "サインインは無効です",
    disabledBody:
      "このページを使う前に、ASTRO_PORTAL_AUTH_MODE を password または email-code にし、必要な非公開設定を行ってください（docs/PRIVATE_NOTEBOOK_AUTH.md）。",
    notReady: "サインインの準備ができていません",
    notReadyBody: "サインインの非公開設定が不完全です。",
    setup: "初期設定",
    initialize: "{productName} を設定",
    initializeIntro:
      "このページは最初のアカウントが作成される前にのみ使用できます。",
    initializeCodeIntro:
      "このアドレスにすぐ6桁のコードが送られます。設定の時点で、このポータルがメールを送れることを確かめられます。",
    bootstrapSecret: "初期設定シークレット",
    organization: "組織",
    accountPassphrase: "パスワード（14文字以上）",
    confirmPassphrase: "パスワードを確認",
    createAccount: "アカウントを作成",
    sendSetupCode: "コードを送る",
    sendingSetupCode: "送信中…",
    enterSetupCode: "届いたコードを入力",
    enterSetupCodeIntro: (email) =>
      `${email} に6桁のコードを送りました。10分間有効です。`,
    verifySetup: "確認して設定を完了",
    restartSetup: "別のアドレスを使う",
    saveRecoveryCodes: "リカバリーコードを保存してください",
    saveRecoveryIntro:
      "この使い捨てコードはオフラインで保管してください。一度だけ表示されます。パスワードを忘れたときや、このポータルのメールが届かなくなったときに、どれか1つでサインインできます。",
    saved: "保存しました",
    copyCodes: "コピー",
    copiedCodes: "コピーしました",
    downloadCodes: "ダウンロード",
    defaultOrganization: "個人の観測所",
    passwordMismatch: "確認用のパスワードが一致しません。",
    otpAria: "6桁のコード",
    digit: "数字",
    typeCode: "6桁のコードを入力してください。",
    attemptsRemaining: (count) =>
      `あと${count}回で、しばらく待つことになります。`,
    locked: (time) =>
      `試行回数が多すぎます。このアドレスは ${time} までここからサインインできません。リカバリーコードは引き続き使えます。`,
    rateLimited: (time) =>
      `このネットワークからの試行回数が多すぎます。${time} 以降にもう一度お試しください。`,
    failures: {
      sign_in_password_incorrect: "メールアドレスとパスワードが一致しません。",
      recovery_code_incorrect:
        "このリカバリーコードは正しくないか、すでに使用済みです。",
      password_too_short: "14文字以上のパスワードを使ってください。",
      email_invalid: "有効なメールアドレスを入力してください。",
      not_initialized: "このポータルはまだ設定されていません。",
      sign_in_code_incorrect: "コードが正しくありません。",
      sign_in_code_expired:
        "このコードは有効期限が切れています。新しいコードを受け取ってください。",
      sign_in_unavailable:
        "このポータルはコードを送れません。送信の設定がされていません（docs/PRIVATE_NOTEBOOK_AUTH.md）。",
      email_delivery_failed:
        "メールを送れませんでした。送信の設定を確かめて、もう一度お試しください。",
      "Bootstrap is already closed.":
        "最初のアカウントはすでに作成されています。サインインしてください。",
      "Invalid bootstrap secret.": "初期設定シークレットが正しくありません。",
    },
  },
  de: {
    privateSpaceIntro:
      "Gesicherter Zugang zu deinem persönlichen Beobachtungsbuch.",
    eyebrow: "DEIN PORTAL",
    signInTitle: "Anmelden",
    signInIntro:
      "Gib die E-Mail-Adresse und das Passwort ein, die bei der Einrichtung dieses Portals gewählt wurden.",
    email: "E-Mail-Adresse",
    passwordLabel: "Passwort",
    signIn: "Anmelden",
    signingIn: "Anmeldung läuft …",
    recovery: "Wiederherstellungscode verwenden",
    recoveryEyebrow: "WIEDERHERSTELLUNGSCODE",
    recoveryTitle: "Wiederherstellungscode verwenden",
    recoveryIntro:
      "Gib einen deiner noch nicht verwendeten Wiederherstellungscodes ein. Er ist verbraucht, sobald du angemeldet bist. So gelangst du wieder hinein, wenn die E-Mails dieses Portals nicht mehr ankommen.",
    recoveryIntroPassword:
      "Gib einen deiner noch nicht verwendeten Wiederherstellungscodes ein und wähle ein neues Passwort. Der Code ist verbraucht, sobald du angemeldet bist.",
    recoveryLabel: "Wiederherstellungscode",
    newPassword: "Neues Passwort",
    confirmNewPassword: "Neues Passwort bestätigen",
    backToPassword: "Mit dem Passwort anmelden",
    backToCode: "Code per E-Mail erhalten",
    checking: "Anmeldung wird geprüft …",
    disabled: "Die Anmeldung ist deaktiviert",
    disabledBody:
      "Setze ASTRO_PORTAL_AUTH_MODE auf password oder email-code, mit den dafür nötigen privaten Einstellungen, bevor du diese Seite verwendest (docs/PRIVATE_NOTEBOOK_AUTH.md).",
    notReady: "Die Anmeldung ist nicht bereit",
    notReadyBody:
      "Die privaten Einstellungen der Anmeldung sind unvollständig.",
    setup: "EINRICHTUNG",
    initialize: "{productName} einrichten",
    initializeIntro:
      "Diese Seite funktioniert nur, solange noch kein Konto existiert.",
    initializeCodeIntro:
      "Ein sechsstelliger Code wird sofort an diese Adresse gesendet: So prüfst du schon bei der Einrichtung, dass dieses Portal seine E-Mails versendet.",
    bootstrapSecret: "Einrichtungsschlüssel",
    organization: "Organisation",
    accountPassphrase: "Passwort (mindestens 14 Zeichen)",
    confirmPassphrase: "Passwort bestätigen",
    createAccount: "Konto erstellen",
    sendSetupCode: "Code senden",
    sendingSetupCode: "Wird gesendet …",
    enterSetupCode: "Gib den erhaltenen Code ein",
    enterSetupCodeIntro: (email) =>
      `Ein sechsstelliger Code wurde soeben an ${email} gesendet. Er ist zehn Minuten lang gültig.`,
    verifySetup: "Prüfen und Einrichtung abschließen",
    restartSetup: "Andere Adresse verwenden",
    saveRecoveryCodes: "Speichere deine Wiederherstellungscodes",
    saveRecoveryIntro:
      "Bewahre diese Einmalcodes offline auf. Sie werden nur einmal angezeigt; jeder meldet dich an, wenn du dein Passwort verlierst oder die E-Mails dieses Portals nicht mehr ankommen.",
    saved: "Ich habe sie gespeichert",
    copyCodes: "Kopieren",
    copiedCodes: "Kopiert",
    downloadCodes: "Herunterladen",
    defaultOrganization: "Persönliche Sternwarte",
    passwordMismatch: "Die Passwortbestätigung stimmt nicht überein.",
    otpAria: "Sechsstelliger Code",
    digit: "Ziffer",
    typeCode: "Gib den sechsstelligen Code ein.",
    attemptsRemaining: (count) =>
      count === 1
        ? "Noch ein Versuch, dann eine Wartezeit."
        : `Noch ${count} Versuche, dann eine Wartezeit.`,
    locked: (time) =>
      `Zu viele Versuche: Diese Adresse kann sich vor ${time} nicht von hier aus anmelden. Ein Wiederherstellungscode wird weiterhin akzeptiert.`,
    rateLimited: (time) =>
      `Zu viele Versuche aus diesem Netz. Versuche es nach ${time} erneut.`,
    failures: {
      sign_in_password_incorrect:
        "Diese Adresse und dieses Passwort passen nicht zusammen.",
      recovery_code_incorrect:
        "Dies ist kein gültiger Wiederherstellungscode, oder er wurde bereits verwendet.",
      password_too_short: "Verwende ein Passwort mit mindestens 14 Zeichen.",
      email_invalid: "Gib eine gültige E-Mail-Adresse ein.",
      not_initialized: "Dieses Portal ist noch nicht eingerichtet.",
      sign_in_code_incorrect: "Dieser Code ist nicht der richtige.",
      sign_in_code_expired:
        "Dieser Code ist nicht mehr gültig. Fordere einen neuen an.",
      sign_in_unavailable:
        "Dieses Portal kann seine Codes nicht senden: Der Absender ist nicht eingerichtet (docs/PRIVATE_NOTEBOOK_AUTH.md).",
      email_delivery_failed:
        "Die E-Mail konnte nicht gesendet werden. Prüfe die Einstellungen des Absenders und versuche es dann erneut.",
      "Bootstrap is already closed.":
        "Das erste Konto existiert bereits. Melde dich stattdessen an.",
      "Invalid bootstrap secret.":
        "Der Einrichtungsschlüssel ist nicht korrekt.",
    },
  },
  es: {
    privateSpaceIntro: "Acceso seguro a tu cuaderno de observación personal.",
    eyebrow: "SU PORTAL",
    signInTitle: "Iniciar sesión",
    signInIntro:
      "Escribe la dirección de correo electrónico y la contraseña que elegiste al configurar este portal.",
    email: "Correo electrónico",
    passwordLabel: "Contraseña",
    signIn: "Iniciar sesión",
    signingIn: "Iniciando sesión…",
    recovery: "Usar un código de recuperación",
    recoveryEyebrow: "CÓDIGO DE RECUPERACIÓN",
    recoveryTitle: "Usar un código de recuperación",
    recoveryIntro:
      "Escribe uno de tus códigos de recuperación sin usar. Se consume al iniciar sesión. Es el camino de vuelta cuando los correos de este portal dejan de llegar.",
    recoveryIntroPassword:
      "Escribe uno de tus códigos de recuperación sin usar y elige una contraseña nueva. El código se consume al iniciar sesión.",
    recoveryLabel: "Código de recuperación",
    newPassword: "Contraseña nueva",
    confirmNewPassword: "Confirmar la contraseña nueva",
    backToPassword: "Iniciar sesión con la contraseña",
    backToCode: "Recibir un código por correo electrónico",
    checking: "Comprobando el inicio de sesión…",
    disabled: "El inicio de sesión está desactivado",
    disabledBody:
      "Configura ASTRO_PORTAL_AUTH_MODE como password o email-code, con la configuración privada necesaria, antes de usar esta página (docs/PRIVATE_NOTEBOOK_AUTH.md).",
    notReady: "El inicio de sesión no está listo",
    notReadyBody:
      "La configuración privada del inicio de sesión está incompleta.",
    setup: "CONFIGURACIÓN",
    initialize: "Configurar {productName}",
    initializeIntro:
      "Esta página solo funciona antes de que exista la primera cuenta.",
    initializeCodeIntro:
      "Un código de seis dígitos sale de inmediato hacia esta dirección: así compruebas, desde la configuración, que este portal envía sus correos.",
    bootstrapSecret: "Clave de configuración inicial",
    organization: "Organización",
    accountPassphrase: "Contraseña (14 caracteres o más)",
    confirmPassphrase: "Confirmar la contraseña",
    createAccount: "Crear la cuenta",
    sendSetupCode: "Enviar el código",
    sendingSetupCode: "Enviando…",
    enterSetupCode: "Escribe el código recibido",
    enterSetupCodeIntro: (email) =>
      `Acaba de salir un código de seis dígitos hacia ${email}. Es válido durante diez minutos.`,
    verifySetup: "Comprobar y terminar la configuración",
    restartSetup: "Usar otra dirección",
    saveRecoveryCodes: "Guarda tus códigos de recuperación",
    saveRecoveryIntro:
      "Conserva estos códigos de un solo uso sin conexión. Se muestran una sola vez; cada uno te permite iniciar sesión si pierdes tu contraseña o si los correos de este portal dejan de llegar.",
    saved: "Ya los guardé",
    copyCodes: "Copiar",
    copiedCodes: "Copiado",
    downloadCodes: "Descargar",
    defaultOrganization: "Observatorio personal",
    passwordMismatch: "La confirmación de la contraseña no coincide.",
    otpAria: "Código de seis dígitos",
    digit: "Dígito",
    typeCode: "Escribe el código de seis dígitos.",
    attemptsRemaining: (count) =>
      count === 1
        ? "Un intento más y luego una espera."
        : `${count} intentos más y luego una espera.`,
    locked: (time) =>
      `Demasiados intentos: esta dirección no puede iniciar sesión desde aquí antes de ${time}. Un código de recuperación se sigue aceptando.`,
    rateLimited: (time) =>
      `Demasiados intentos desde esta red. Inténtalo de nuevo después de ${time}.`,
    failures: {
      sign_in_password_incorrect:
        "Esta dirección y esta contraseña no coinciden.",
      recovery_code_incorrect:
        "Este no es un código de recuperación válido, o ya se usó.",
      password_too_short: "Usa una contraseña de al menos 14 caracteres.",
      email_invalid: "Escribe una dirección de correo electrónico válida.",
      not_initialized: "Este portal aún no está configurado.",
      sign_in_code_incorrect: "Este código no es el correcto.",
      sign_in_code_expired: "Este código ya no es válido. Pide uno nuevo.",
      sign_in_unavailable:
        "Este portal no puede enviar sus códigos: su remitente no está configurado (docs/PRIVATE_NOTEBOOK_AUTH.md).",
      email_delivery_failed:
        "No se pudo enviar el correo. Comprueba la configuración del remitente y vuelve a intentarlo.",
      "Bootstrap is already closed.":
        "La primera cuenta ya existe. Inicia sesión.",
      "Invalid bootstrap secret.":
        "La clave de configuración inicial no es correcta.",
    },
  },
  it: {
    privateSpaceIntro: "Accesso sicuro al quaderno di osservazione personale.",
    eyebrow: "IL PORTALE",
    signInTitle: "Accedere",
    signInIntro:
      "Inserisci l’indirizzo e-mail e la password scelti durante la configurazione di questo portale.",
    email: "Indirizzo e-mail",
    passwordLabel: "Password",
    signIn: "Accedere",
    signingIn: "Accesso in corso…",
    recovery: "Usare un codice di ripristino",
    recoveryEyebrow: "CODICE DI RIPRISTINO",
    recoveryTitle: "Usare un codice di ripristino",
    recoveryIntro:
      "Inserisci uno dei codici di ripristino non ancora usati. Viene consumato quando l’accesso riesce. È la via di ritorno quando le e-mail di questo portale non arrivano più.",
    recoveryIntroPassword:
      "Inserisci uno dei codici di ripristino non ancora usati e scegli una nuova password. Il codice viene consumato quando l’accesso riesce.",
    recoveryLabel: "Codice di ripristino",
    newPassword: "Nuova password",
    confirmNewPassword: "Confermare la nuova password",
    backToPassword: "Accedere con la password",
    backToCode: "Ricevere un codice via e-mail",
    checking: "Verifica dell’accesso…",
    disabled: "L’accesso è disattivato",
    disabledBody:
      "Imposta ASTRO_PORTAL_AUTH_MODE su password o email-code, con le impostazioni private necessarie, prima di usare questa pagina (docs/PRIVATE_NOTEBOOK_AUTH.md).",
    notReady: "L’accesso non è pronto",
    notReadyBody: "Le impostazioni private dell’accesso sono incomplete.",
    setup: "CONFIGURAZIONE",
    initialize: "Configurare {productName}",
    initializeIntro:
      "Questa pagina funziona solo prima che esista il primo account.",
    initializeCodeIntro:
      "Un codice di sei cifre parte subito verso questo indirizzo: così verifichi, fin dalla configurazione, che questo portale invia le sue e-mail.",
    bootstrapSecret: "Chiave di configurazione iniziale",
    organization: "Organizzazione",
    accountPassphrase: "Password (almeno 14 caratteri)",
    confirmPassphrase: "Confermare la password",
    createAccount: "Creare l’account",
    sendSetupCode: "Inviare il codice",
    sendingSetupCode: "Invio in corso…",
    enterSetupCode: "Inserisci il codice ricevuto",
    enterSetupCodeIntro: (email) =>
      `Un codice di sei cifre è appena partito per ${email}. Vale dieci minuti.`,
    verifySetup: "Verificare e completare la configurazione",
    restartSetup: "Usare un altro indirizzo",
    saveRecoveryCodes: "Salva i codici di ripristino",
    saveRecoveryIntro:
      "Conserva questi codici monouso offline. Vengono mostrati una sola volta; ciascuno permette di accedere se perdi la password o se le e-mail di questo portale non arrivano più.",
    saved: "Li ho salvati",
    copyCodes: "Copia",
    copiedCodes: "Copiato",
    downloadCodes: "Scarica",
    defaultOrganization: "Osservatorio personale",
    passwordMismatch: "La conferma della password non corrisponde.",
    otpAria: "Codice di sei cifre",
    digit: "Cifra",
    typeCode: "Inserisci il codice di sei cifre.",
    attemptsRemaining: (count) =>
      count === 1
        ? "Ancora un tentativo, poi un’attesa."
        : `Ancora ${count} tentativi, poi un’attesa.`,
    locked: (time) =>
      `Troppi tentativi: questo indirizzo non può accedere da qui prima di ${time}. Un codice di ripristino viene comunque accettato.`,
    rateLimited: (time) =>
      `Troppi tentativi da questa rete. Riprova dopo ${time}.`,
    failures: {
      sign_in_password_incorrect:
        "Questo indirizzo e questa password non corrispondono.",
      recovery_code_incorrect:
        "Questo non è un codice di ripristino valido, oppure è già stato usato.",
      password_too_short: "Usa una password di almeno 14 caratteri.",
      email_invalid: "Inserisci un indirizzo e-mail valido.",
      not_initialized: "Questo portale non è ancora configurato.",
      sign_in_code_incorrect: "Questo codice non è quello giusto.",
      sign_in_code_expired:
        "Questo codice non è più valido. Richiedine uno nuovo.",
      sign_in_unavailable:
        "Questo portale non può inviare i suoi codici: il mittente non è configurato (docs/PRIVATE_NOTEBOOK_AUTH.md).",
      email_delivery_failed:
        "Non è stato possibile inviare l’e-mail. Controlla le impostazioni del mittente, poi riprova.",
      "Bootstrap is already closed.": "Il primo account esiste già. Accedi.",
      "Invalid bootstrap secret.":
        "La chiave di configurazione iniziale non è corretta.",
    },
  },
  "pt-BR": {
    privateSpaceIntro: "Acesso seguro ao seu caderno de observação pessoal.",
    eyebrow: "SEU PORTAL",
    signInTitle: "Entrar",
    signInIntro:
      "Digite o endereço de e-mail e a senha escolhidos na configuração deste portal.",
    email: "Endereço de e-mail",
    passwordLabel: "Senha",
    signIn: "Entrar",
    signingIn: "Entrando…",
    recovery: "Usar um código de recuperação",
    recoveryEyebrow: "CÓDIGO DE RECUPERAÇÃO",
    recoveryTitle: "Usar um código de recuperação",
    recoveryIntro:
      "Digite um dos seus códigos de recuperação não utilizados. Ele é consumido assim que você entra. É o caminho de volta quando os e-mails deste portal deixam de chegar.",
    recoveryIntroPassword:
      "Digite um dos seus códigos de recuperação não utilizados e escolha uma nova senha. O código é consumido assim que você entra.",
    recoveryLabel: "Código de recuperação",
    newPassword: "Nova senha",
    confirmNewPassword: "Confirmar a nova senha",
    backToPassword: "Entrar com a senha",
    backToCode: "Receber um código por e-mail",
    checking: "Verificando o login…",
    disabled: "O login está desativado",
    disabledBody:
      "Defina ASTRO_PORTAL_AUTH_MODE como password ou email-code, com as configurações privadas necessárias, antes de usar esta página (docs/PRIVATE_NOTEBOOK_AUTH.md).",
    notReady: "O login não está pronto",
    notReadyBody: "As configurações privadas do login estão incompletas.",
    setup: "CONFIGURAÇÃO",
    initialize: "Configurar o {productName}",
    initializeIntro:
      "Esta página só funciona antes de existir a primeira conta.",
    initializeCodeIntro:
      "Um código de seis dígitos é enviado de imediato para este endereço: assim você confirma, desde a configuração, que este portal envia seus e-mails.",
    bootstrapSecret: "Chave de configuração inicial",
    organization: "Organização",
    accountPassphrase: "Senha (14 caracteres ou mais)",
    confirmPassphrase: "Confirmar a senha",
    createAccount: "Criar a conta",
    sendSetupCode: "Enviar o código",
    sendingSetupCode: "Enviando…",
    enterSetupCode: "Digite o código recebido",
    enterSetupCodeIntro: (email) =>
      `Um código de seis dígitos acabou de ser enviado para ${email}. Ele é válido por dez minutos.`,
    verifySetup: "Verificar e concluir a configuração",
    restartSetup: "Usar outro endereço",
    saveRecoveryCodes: "Salve seus códigos de recuperação",
    saveRecoveryIntro:
      "Guarde estes códigos de uso único offline. Eles são exibidos uma única vez; cada um permite que você entre se perder sua senha ou se os e-mails deste portal deixarem de chegar.",
    saved: "Já os salvei",
    copyCodes: "Copiar",
    copiedCodes: "Copiado",
    downloadCodes: "Baixar",
    defaultOrganization: "Observatório pessoal",
    passwordMismatch: "A confirmação da senha não corresponde.",
    otpAria: "Código de seis dígitos",
    digit: "Dígito",
    typeCode: "Digite o código de seis dígitos.",
    attemptsRemaining: (count) =>
      count === 1
        ? "Mais uma tentativa e depois uma espera."
        : `Mais ${count} tentativas e depois uma espera.`,
    locked: (time) =>
      `Tentativas demais: este endereço não pode entrar daqui antes de ${time}. Um código de recuperação ainda é aceito.`,
    rateLimited: (time) =>
      `Tentativas demais a partir desta rede. Tente novamente depois de ${time}.`,
    failures: {
      sign_in_password_incorrect:
        "Este endereço e esta senha não correspondem.",
      recovery_code_incorrect:
        "Este não é um código de recuperação válido ou já foi usado.",
      password_too_short: "Use uma senha de pelo menos 14 caracteres.",
      email_invalid: "Digite um endereço de e-mail válido.",
      not_initialized: "Este portal ainda não está configurado.",
      sign_in_code_incorrect: "Este código não é o correto.",
      sign_in_code_expired: "Este código não é mais válido. Peça um novo.",
      sign_in_unavailable:
        "Este portal não consegue enviar seus códigos: o remetente não está configurado (docs/PRIVATE_NOTEBOOK_AUTH.md).",
      email_delivery_failed:
        "Não foi possível enviar o e-mail. Verifique as configurações do remetente e tente novamente.",
      "Bootstrap is already closed.": "A primeira conta já existe. Entre.",
      "Invalid bootstrap secret.":
        "A chave de configuração inicial não está correta.",
    },
  },
  "zh-Hans": {
    privateSpaceIntro: "安全访问你的个人观测笔记。",
    eyebrow: "你的门户",
    signInTitle: "登录",
    signInIntro: "请输入设置此门户时选定的邮箱地址和密码。",
    email: "邮箱地址",
    passwordLabel: "密码",
    signIn: "登录",
    signingIn: "正在登录……",
    recovery: "使用恢复码",
    recoveryEyebrow: "恢复码",
    recoveryTitle: "使用恢复码",
    recoveryIntro:
      "请输入一个未使用的恢复码。登录成功后，该恢复码即作废。当此门户的邮件不再送达时，可用它重新登录。",
    recoveryIntroPassword:
      "请输入一个未使用的恢复码，并设置新密码。登录成功后，该恢复码即作废。",
    recoveryLabel: "恢复码",
    newPassword: "新密码",
    confirmNewPassword: "确认新密码",
    backToPassword: "使用密码登录",
    backToCode: "通过邮件接收验证码",
    checking: "正在检查登录设置……",
    disabled: "登录已关闭",
    disabledBody:
      "使用此页面之前，请先将ASTRO_PORTAL_AUTH_MODE设为password或email-code，并配置所需的私有设置（docs/PRIVATE_NOTEBOOK_AUTH.md）。",
    notReady: "登录尚未就绪",
    notReadyBody: "登录所需的私有设置不完整。",
    setup: "设置",
    initialize: "设置{productName}",
    initializeIntro: "此页面仅在创建第一个账号之前可用。",
    initializeCodeIntro:
      "系统会立即向此地址发送一个六位验证码：由此在设置阶段就能确认此门户可以正常发送邮件。",
    bootstrapSecret: "初始化密钥",
    organization: "组织",
    accountPassphrase: "密码（至少14个字符）",
    confirmPassphrase: "确认密码",
    createAccount: "创建账号",
    sendSetupCode: "发送验证码",
    sendingSetupCode: "正在发送……",
    enterSetupCode: "输入收到的验证码",
    enterSetupCodeIntro: (email) =>
      `六位验证码已发送至${email}，10分钟内有效。`,
    verifySetup: "验证并完成设置",
    restartSetup: "使用其他地址",
    saveRecoveryCodes: "请保存你的恢复码",
    saveRecoveryIntro:
      "请离线保管这些一次性恢复码。它们只显示这一次；如果忘记密码，或此门户的邮件不再送达，任意一个恢复码都可用于登录。",
    saved: "我已保存",
    copyCodes: "复制",
    copiedCodes: "已复制",
    downloadCodes: "下载",
    defaultOrganization: "个人天文台",
    passwordMismatch: "两次输入的密码不一致。",
    otpAria: "六位验证码",
    digit: "数字",
    typeCode: "请输入六位验证码。",
    attemptsRemaining: (count) => `还可再试${count}次，之后需要等待。`,
    locked: (time) =>
      `尝试次数过多：此地址在${time}之前无法从这里登录。仍可使用恢复码。`,
    rateLimited: (time) => `此网络的尝试次数过多，请在${time}之后重试。`,
    failures: {
      sign_in_password_incorrect: "此地址与密码不匹配。",
      recovery_code_incorrect: "这不是有效的恢复码，或已被使用。",
      password_too_short: "请使用至少14个字符的密码。",
      email_invalid: "请输入有效的邮箱地址。",
      not_initialized: "此门户尚未设置。",
      sign_in_code_incorrect: "验证码不正确。",
      sign_in_code_expired: "此验证码已失效，请重新获取。",
      sign_in_unavailable:
        "此门户无法发送验证码：尚未设置发件人（docs/PRIVATE_NOTEBOOK_AUTH.md）。",
      email_delivery_failed: "邮件未能发出。请检查发件人设置后重试。",
      "Bootstrap is already closed.": "第一个账号已存在，请直接登录。",
      "Invalid bootstrap secret.": "初始化密钥不正确。",
    },
  },
  "zh-Hant": {
    privateSpaceIntro: "安全存取你的個人觀測筆記。",
    eyebrow: "你的入口網站",
    signInTitle: "登入",
    signInIntro: "請輸入設定此入口網站時選定的電子郵件地址與密碼。",
    email: "電子郵件地址",
    passwordLabel: "密碼",
    signIn: "登入",
    signingIn: "登入中……",
    recovery: "使用備用碼",
    recoveryEyebrow: "備用碼",
    recoveryTitle: "使用備用碼",
    recoveryIntro:
      "請輸入一組尚未使用的備用碼。登入成功後，該備用碼即作廢。當此入口網站的郵件不再送達時，可藉此重新登入。",
    recoveryIntroPassword:
      "請輸入一組尚未使用的備用碼，並設定新密碼。登入成功後，該備用碼即作廢。",
    recoveryLabel: "備用碼",
    newPassword: "新密碼",
    confirmNewPassword: "確認新密碼",
    backToPassword: "改用密碼登入",
    backToCode: "透過電子郵件接收驗證碼",
    checking: "正在檢查登入設定……",
    disabled: "登入功能已停用",
    disabledBody:
      "使用此頁面之前，請先將 ASTRO_PORTAL_AUTH_MODE 設為 password 或 email-code，並完成所需的私有設定（docs/PRIVATE_NOTEBOOK_AUTH.md）。",
    notReady: "登入功能尚未就緒",
    notReadyBody: "登入所需的私有設定不完整。",
    setup: "設定",
    initialize: "設定 {productName}",
    initializeIntro: "此頁面僅在建立第一個帳號之前可用。",
    initializeCodeIntro:
      "系統會立即寄出六位數驗證碼至此地址：藉此在設定階段就能確認此入口網站可以正常寄送郵件。",
    bootstrapSecret: "初始化金鑰",
    organization: "組織",
    accountPassphrase: "密碼（至少 14 個字元）",
    confirmPassphrase: "確認密碼",
    createAccount: "建立帳號",
    sendSetupCode: "傳送驗證碼",
    sendingSetupCode: "傳送中……",
    enterSetupCode: "輸入收到的驗證碼",
    enterSetupCodeIntro: (email) =>
      `六位數驗證碼已寄至 ${email}，10 分鐘內有效。`,
    verifySetup: "驗證並完成設定",
    restartSetup: "改用其他地址",
    saveRecoveryCodes: "請儲存你的備用碼",
    saveRecoveryIntro:
      "請離線保存這些一次性備用碼。它們只會顯示這一次；若忘記密碼，或此入口網站的郵件不再送達，任一組備用碼都能用來登入。",
    saved: "我已儲存",
    copyCodes: "複製",
    copiedCodes: "已複製",
    downloadCodes: "下載",
    defaultOrganization: "個人天文台",
    passwordMismatch: "兩次輸入的密碼不一致。",
    otpAria: "六位數驗證碼",
    digit: "數字",
    typeCode: "請輸入六位數驗證碼。",
    attemptsRemaining: (count) => `還可再試 ${count} 次，之後須等待一段時間。`,
    locked: (time) =>
      `嘗試次數過多：此地址在 ${time} 之前無法從這裡登入。仍可使用備用碼。`,
    rateLimited: (time) => `此網路的嘗試次數過多，請在 ${time} 之後再試。`,
    failures: {
      sign_in_password_incorrect: "此地址與密碼不相符。",
      recovery_code_incorrect: "這不是有效的備用碼，或已使用過。",
      password_too_short: "請使用至少 14 個字元的密碼。",
      email_invalid: "請輸入有效的電子郵件地址。",
      not_initialized: "此入口網站尚未設定。",
      sign_in_code_incorrect: "驗證碼不正確。",
      sign_in_code_expired: "此驗證碼已失效，請重新取得。",
      sign_in_unavailable:
        "此入口網站無法寄送驗證碼：尚未設定寄件者（docs/PRIVATE_NOTEBOOK_AUTH.md）。",
      email_delivery_failed: "郵件未能寄出。請檢查寄件者設定後再試一次。",
      "Bootstrap is already closed.": "第一個帳號已存在，請直接登入。",
      "Invalid bootstrap secret.": "初始化金鑰不正確。",
    },
  },
  ru: {
    privateSpaceIntro:
      "Защищённый доступ к вашему личному блокноту наблюдений.",
    eyebrow: "ВАШ ПОРТАЛ",
    signInTitle: "Вход",
    signInIntro:
      "Введите адрес электронной почты и пароль, выбранные при установке этого портала.",
    email: "Адрес электронной почты",
    passwordLabel: "Пароль",
    signIn: "Войти",
    signingIn: "Выполняется вход…",
    recovery: "Использовать резервный код",
    recoveryEyebrow: "РЕЗЕРВНЫЙ КОД",
    recoveryTitle: "Использовать резервный код",
    recoveryIntro:
      "Введите один из неиспользованных резервных кодов. После успешного входа он перестанет действовать. Это способ вернуться, когда письма этого портала перестали приходить.",
    recoveryIntroPassword:
      "Введите один из неиспользованных резервных кодов и задайте новый пароль. После успешного входа код перестанет действовать.",
    recoveryLabel: "Резервный код",
    newPassword: "Новый пароль",
    confirmNewPassword: "Подтвердите новый пароль",
    backToPassword: "Войти с паролем",
    backToCode: "Получить код по электронной почте",
    checking: "Проверка входа…",
    disabled: "Вход отключён",
    disabledBody:
      "Прежде чем пользоваться этой страницей, задайте ASTRO_PORTAL_AUTH_MODE равным password или email-code и укажите необходимые приватные настройки (docs/PRIVATE_NOTEBOOK_AUTH.md).",
    notReady: "Вход не готов",
    notReadyBody: "Приватные настройки входа неполны.",
    setup: "УСТАНОВКА",
    initialize: "Установка {productName}",
    initializeIntro:
      "Эта страница работает только до создания первого аккаунта.",
    initializeCodeIntro:
      "Шестизначный код сразу уходит на этот адрес: так вы с самой установки проверяете, что портал действительно отправляет письма.",
    bootstrapSecret: "Секрет первоначальной настройки",
    organization: "Организация",
    accountPassphrase: "Пароль (14 символов или больше)",
    confirmPassphrase: "Подтвердите пароль",
    createAccount: "Создать аккаунт",
    sendSetupCode: "Отправить код",
    sendingSetupCode: "Отправка…",
    enterSetupCode: "Введите полученный код",
    enterSetupCodeIntro: (email) =>
      `Шестизначный код только что отправлен на ${email}. Он действует десять минут.`,
    verifySetup: "Проверить и завершить установку",
    restartSetup: "Указать другой адрес",
    saveRecoveryCodes: "Сохраните резервные коды",
    saveRecoveryIntro:
      "Храните эти одноразовые коды офлайн. Они показываются только один раз; любой из них позволит войти, если вы потеряете пароль или письма этого портала перестанут приходить.",
    saved: "Коды сохранены",
    copyCodes: "Копировать",
    copiedCodes: "Скопировано",
    downloadCodes: "Скачать",
    defaultOrganization: "Личная обсерватория",
    passwordMismatch: "Подтверждение не совпадает с паролем.",
    otpAria: "Шестизначный код",
    digit: "Цифра",
    typeCode: "Введите шестизначный код.",
    attemptsRemaining: (count) => {
      const category = new Intl.PluralRules("ru").select(count);
      if (category === "one")
        return `Осталась ещё ${count} попытка, затем придётся подождать.`;
      if (category === "few")
        return `Осталось ещё ${count} попытки, затем придётся подождать.`;
      return `Осталось ещё ${count} попыток, затем придётся подождать.`;
    },
    locked: (time) =>
      `Слишком много попыток: этот адрес не сможет войти отсюда до ${time}. Резервный код по-прежнему принимается.`,
    rateLimited: (time) =>
      `Слишком много попыток из этой сети. Повторите после ${time}.`,
    failures: {
      sign_in_password_incorrect: "Адрес и пароль не совпадают.",
      recovery_code_incorrect: "Это не резервный код или он уже использован.",
      password_too_short: "Используйте пароль не короче 14 символов.",
      email_invalid: "Введите действительный адрес электронной почты.",
      not_initialized: "Этот портал ещё не установлен.",
      sign_in_code_incorrect: "Этот код неверный.",
      sign_in_code_expired: "Срок действия кода истёк. Запросите новый.",
      sign_in_unavailable:
        "Портал не может отправлять коды: отправитель не настроен (docs/PRIVATE_NOTEBOOK_AUTH.md).",
      email_delivery_failed:
        "Письмо не удалось отправить. Проверьте настройки отправителя и повторите попытку.",
      "Bootstrap is already closed.":
        "Первый аккаунт уже существует. Выполните вход.",
      "Invalid bootstrap secret.": "Секрет первоначальной настройки неверен.",
    },
  },
};

function OtpCodeInput({
  name = "code",
  value,
  onChange,
  onComplete,
  autoFocus = false,
  disabled = false,
  copy = authCopy.en,
}) {
  const inputs = useRef([]);
  const digits = otpDigits(value);
  const setDigits = (next) => {
    const nextValue = next.join("");
    onChange(nextValue);
    if (nextValue.length === 6) onComplete?.(nextValue);
  };
  const insert = (index, raw) => {
    const written = otpInsert(digits, index, raw);
    if (!written) return;
    setDigits(written.next);
    inputs.current[written.focus]?.focus();
  };
  return (
    <div className="otp-input" aria-label={copy.otpAria}>
      <input name={name} type="hidden" value={value} readOnly />
      {digits.map((digit, index) => (
        <input
          aria-label={`${copy.digit} ${index + 1}`}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          autoFocus={autoFocus && index === 0}
          className="otp-digit"
          disabled={disabled}
          inputMode="numeric"
          key={index}
          maxLength="1"
          onChange={(event) => {
            if (event.target.value) insert(index, event.target.value);
            else {
              const next = [...digits];
              next[index] = "";
              setDigits(next);
            }
          }}
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => {
            const typed = otpDigitOfKey(event);
            if (typed) {
              // A digit is written from the key itself.
              event.preventDefault();
              insert(index, typed);
              return;
            }
            if (event.key === "Backspace" && !digits[index] && index > 0)
              inputs.current[index - 1]?.focus();
            if (event.key === "ArrowLeft" && index > 0) {
              event.preventDefault();
              inputs.current[index - 1]?.focus();
            }
            if (event.key === "ArrowRight" && index < 5) {
              event.preventDefault();
              inputs.current[index + 1]?.focus();
            }
          }}
          onPaste={(event) => {
            event.preventDefault();
            insert(index, event.clipboardData.getData("text"));
          }}
          ref={(element) => {
            inputs.current[index] = element;
          }}
          type="text"
          value={digit}
        />
      ))}
    </div>
  );
}

/**
 * « Copier » and « Télécharger » under the recovery codes: the
 * codes are shown once, and a person who cannot select ten lines on a phone
 * must not be left with a photograph of the screen. The file holds the codes
 * and nothing else; it is made in the browser and never sent anywhere.
 */
export function RecoveryCodesActions({ codes, copy }) {
  const [copied, setCopied] = useState(false);
  const text = `${codes.join("\n")}\n`;
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // No clipboard (an insecure address): the codes stay selectable above.
    }
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "planastro-recovery-codes.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="auth-recovery-actions">
      <button
        className="btn-secondary"
        type="button"
        data-recovery-copy=""
        onClick={copyText}
      >
        {copied ? copy.copiedCodes : copy.copyCodes}
      </button>
      <button
        className="btn-secondary"
        type="button"
        data-recovery-download=""
        onClick={download}
      >
        {copy.downloadCodes}
      </button>
    </div>
  );
}

function AuthShell({ children, eyebrow = null, locale = "en" }) {
  const copy = copyFor(authCopy, locale, "AuthPage.authCopy");
  eyebrow ??= copy.eyebrow;
  return (
    <>
      <header className="site-header auth-header">
        <p>{copy.privateSpaceIntro}</p>
      </header>
      <main className="auth-page">
        <section className="auth-card">
          <p className="auth-eyebrow">{eyebrow}</p>
          {children}
        </section>
      </main>
    </>
  );
}

/** « 21:40 », or « jeudi 21:40 » when the wait ends another day. */
function whenOf(value, locale, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(locale, {
    ...(sameDay ? {} : { weekday: "long" }),
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
  }).format(date);
}

/** What the page says of a refusal: by its code, else by its message. */
export function failureText(failure, copy, locale) {
  if (failure?.code === "sign_in_locked" && failure.retryAt)
    return copy.locked(whenOf(failure.retryAt, locale));
  if (failure?.code === "sign_in_rate_limited" && failure.retryAt)
    return copy.rateLimited(whenOf(failure.retryAt, locale));
  const words =
    copy.failures[failure?.code] || copy.failures[failure?.message] || null;
  const text = words || failure?.message || "";
  return failure?.code === "sign_in_password_incorrect" &&
    Number.isInteger(failure.attemptsRemaining)
    ? `${text} ${copy.attemptsRemaining(failure.attemptsRemaining)}`
    : text;
}

function ErrorLine({ error }) {
  return error ? (
    <p className="auth-error" role="alert">
      {error}
    </p>
  ) : null;
}

/**
 * `locale` is the page's language, decided by the server the same way as
 * the header's language selector and the footer (the visitor's last choice,
 * else the deployment's default), so the whole page speaks one language.
 */
export function AuthPage({
  initialMode = "login",
  method = null,
  locale = "en",
}) {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(null);
  const [mode] = useState(initialMode);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // The installation by e-mail code: what the first step typed, kept in
  // memory for the second (the secret is sent again, never stored).
  const [pending, setPending] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [setupCode, setSetupCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const returnQuery = searchParams.toString();
  const returnSuffix = returnQuery ? `?${returnQuery}` : "";
  const copy = copyFor(authCopy, locale, "AuthPage.authCopy");
  const fail = (failure) => setError(failureText(failure, copy, locale));
  useEffect(() => {
    // A run of this effect that was left (React's development double run)
    // applies nothing of its late answer.
    let runIsCurrent = true;
    fetch("/api/auth/status")
      .then((response) => response.json())
      .then((status) => {
        if (!runIsCurrent) return;
        setStatus(status);
      })
      .catch(() => {
        if (!runIsCurrent) return;
        setStatus({ enabled: true, ready: false });
      });
    return () => {
      runIsCurrent = false;
    };
  }, []);
  const byPassword = (method || status?.method || "password") === "password";
  const signedIn = () =>
    // Only a path of this site: never another site, never a script.
    window.location.assign(
      nextDestination(window.location.search, window.location.origin, "/"),
    );
  const run = async (work) => {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await work();
    } catch (failure) {
      fail(failure);
    }
    setBusy(false);
  };
  const login = (event) => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    void run(async () => {
      await post("/api/auth/login", {
        email: fields.email,
        password: fields.password,
      });
      signedIn();
    });
  };
  const recover = (event) => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    if (byPassword && fields.newPassword !== fields.newPasswordConfirmation)
      return setError(copy.passwordMismatch);
    void run(async () => {
      await post("/api/auth/login", {
        recoveryCode: recoveryCode.trim(),
        ...(byPassword ? { newPassword: fields.newPassword } : {}),
      });
      signedIn();
    });
  };
  const beginBootstrap = (event) => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    if (byPassword && fields.password !== fields.passwordConfirmation)
      return setError(copy.passwordMismatch);
    void run(async () => {
      if (byPassword) {
        const result = await post("/api/auth/bootstrap/start", {
          bootstrapSecret: fields.bootstrapSecret,
          organizationName: fields.organizationName,
          email: fields.email,
          password: fields.password,
        });
        setRecoveryCodes(result.recoveryCodes);
        return;
      }
      const sent = await post("/api/auth/bootstrap/start", {
        bootstrapSecret: fields.bootstrapSecret,
        email: fields.email,
        language: locale,
      });
      setSetupCode("");
      setPending({
        bootstrapSecret: fields.bootstrapSecret,
        organizationName: fields.organizationName,
        email: sent.email || fields.email,
      });
    });
  };
  const confirmBootstrap = (code = setupCode) => {
    if (String(code).length !== 6) return setError(copy.typeCode);
    void run(async () => {
      const result = await post("/api/auth/bootstrap/confirm", {
        ...pending,
        code,
      });
      setPending(null);
      setRecoveryCodes(result.recoveryCodes);
    });
  };
  if (!status)
    return (
      <AuthShell locale={locale}>
        <p className="auth-status">{copy.checking}</p>
      </AuthShell>
    );
  if (!status.enabled)
    return (
      <AuthShell locale={locale}>
        <h1>{copy.disabled}</h1>
        <p>{copy.disabledBody}</p>
      </AuthShell>
    );
  if (status.ready === false)
    return (
      <AuthShell locale={locale}>
        <h1>{copy.notReady}</h1>
        <p>{copy.notReadyBody}</p>
      </AuthShell>
    );
  if (recoveryCodes)
    return (
      <AuthShell eyebrow={copy.setup} locale={locale}>
        <h1>{copy.saveRecoveryCodes}</h1>
        <p>{copy.saveRecoveryIntro}</p>
        <pre className="auth-recovery-codes">{recoveryCodes.join("\n")}</pre>
        <RecoveryCodesActions codes={recoveryCodes} copy={copy} />
        <button
          className="btn-primary auth-primary"
          type="button"
          onClick={() => window.location.assign("/")}
        >
          {copy.saved}
        </button>
      </AuthShell>
    );
  if (!status.initialized || mode === "bootstrap") {
    if (pending)
      return (
        <AuthShell eyebrow={copy.setup} locale={locale}>
          <h1>{copy.enterSetupCode}</h1>
          <p>{copy.enterSetupCodeIntro(pending.email)}</p>
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              confirmBootstrap();
            }}
          >
            <OtpCodeInput
              value={setupCode}
              onChange={setSetupCode}
              onComplete={confirmBootstrap}
              autoFocus
              disabled={busy}
              copy={copy}
            />
            <button
              className="btn-primary auth-primary"
              type="submit"
              disabled={busy}
            >
              {busy ? copy.signingIn : copy.verifySetup}
            </button>
            <button
              className="btn-link auth-secondary-link"
              type="button"
              onClick={() => {
                setError("");
                setPending(null);
              }}
            >
              {copy.restartSetup}
            </button>
          </form>
          <ErrorLine error={error} />
        </AuthShell>
      );
    return (
      <AuthShell eyebrow={copy.setup} locale={locale}>
        <h1>{copy.initialize.replace("{productName}", productName())}</h1>
        <p>{copy.initializeIntro}</p>
        {byPassword ? null : <p>{copy.initializeCodeIntro}</p>}
        <form className="auth-form auth-fields" onSubmit={beginBootstrap}>
          <label>
            {copy.bootstrapSecret}
            <input name="bootstrapSecret" type="password" required />
          </label>
          <label>
            {copy.organization}
            <input
              name="organizationName"
              defaultValue={copy.defaultOrganization}
              required
            />
          </label>
          <label>
            {copy.email}
            <input name="email" type="email" autoComplete="email" required />
          </label>
          {byPassword ? (
            <>
              <label>
                {copy.accountPassphrase}
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength="14"
                  required
                />
              </label>
              <label>
                {copy.confirmPassphrase}
                <input
                  name="passwordConfirmation"
                  type="password"
                  autoComplete="new-password"
                  minLength="14"
                  required
                />
              </label>
              <button
                className="btn-primary auth-primary"
                type="submit"
                disabled={busy}
              >
                {copy.createAccount}
              </button>
            </>
          ) : (
            <button
              className="btn-primary auth-primary"
              type="submit"
              disabled={busy}
            >
              {busy ? copy.sendingSetupCode : copy.sendSetupCode}
            </button>
          )}
        </form>
        <ErrorLine error={error} />
      </AuthShell>
    );
  }
  if (mode === "recovery")
    return (
      <AuthShell eyebrow={copy.recoveryEyebrow} locale={locale}>
        <h1>{copy.recoveryTitle}</h1>
        <p>{byPassword ? copy.recoveryIntroPassword : copy.recoveryIntro}</p>
        <form className="auth-form auth-fields" onSubmit={recover}>
          <label>
            {copy.recoveryLabel}
            <input
              className="auth-recovery-input"
              name="recoveryCode"
              autoComplete="one-time-code"
              autoFocus
              onChange={(event) =>
                setRecoveryCode(event.target.value.toUpperCase())
              }
              placeholder="ABCD-EF01-2345"
              value={recoveryCode}
              required
            />
          </label>
          {byPassword ? (
            <>
              <label>
                {copy.newPassword}
                <input
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength="14"
                  required
                />
              </label>
              <label>
                {copy.confirmNewPassword}
                <input
                  name="newPasswordConfirmation"
                  type="password"
                  autoComplete="new-password"
                  minLength="14"
                  required
                />
              </label>
            </>
          ) : null}
          <button
            className="btn-primary auth-primary"
            type="submit"
            disabled={busy}
          >
            {busy ? copy.signingIn : copy.signIn}
          </button>
          <a
            className="btn-link auth-secondary-link"
            href={`${byPassword ? "/auth/login" : "/auth/sign-in"}${returnSuffix}`}
          >
            {byPassword ? copy.backToPassword : copy.backToCode}
          </a>
        </form>
        <ErrorLine error={error} />
      </AuthShell>
    );
  return (
    <AuthShell locale={locale}>
      <h1>{copy.signInTitle}</h1>
      <p>{copy.signInIntro}</p>
      <form className="auth-form auth-fields" onSubmit={login}>
        <label>
          {copy.email}
          <input
            name="email"
            type="email"
            autoComplete="username"
            autoFocus
            required
          />
        </label>
        <label>
          {copy.passwordLabel}
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <button
          className="btn-primary auth-primary"
          type="submit"
          disabled={busy}
        >
          {busy ? copy.signingIn : copy.signIn}
        </button>
        <a
          className="btn-link auth-secondary-link"
          href={`/auth/recovery${returnSuffix}`}
        >
          {copy.recovery}
        </a>
      </form>
      <ErrorLine error={error} />
    </AuthShell>
  );
}
