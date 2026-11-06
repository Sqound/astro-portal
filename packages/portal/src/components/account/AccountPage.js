"use client";

import { copyFor } from "astro-contracts/locales";
import { useCallback, useEffect, useState } from "react";
import { DataExportSection } from "./DataExportSection.js";
import { DataImportSection } from "./DataImportSection.js";
import QRCode from "qrcode";
import { buildPairingQrPayload } from "astro-contracts/pairing";
import { productName } from "portal/i18n.js";
import { getAccountExtensions } from "../../account/extensions.js";
import { createPairingPoller } from "./pairing-poll.js";
import { WebConfirmDialog } from "../dialog/WebDialog.js";
import { csrfCookieValue } from "portal/csrf-cookie.js";

const accountCopy = {
  en: {
    title: "Account",
    intro:
      "Manage the devices that can synchronize your private observing plans.",
    pairedDevices: "Paired devices",
    pairNewDevice: "Pair a new device",
    pairingCode: "Pairing code",
    pairingIntro:
      "Enter or scan this code in {productName} on your device. It expires in five minutes.",
    pairingExpires: "Expires {time}",
    pairingQrAlt: "QR code for the pairing code",
    pairedConfirmation: "{device} is now paired.",
    noDevices: "No device is paired yet.",
    loadingDevices: "Loading paired devices…",
    devicesError: "Unable to load paired devices.",
    pairingError: "Unable to create a pairing code.",
    revokeError: "The device could not be detached. Try again.",
    pairedOn: "Paired",
    lastSynchronized: "Last synchronized",
    never: "Never",
    revoked: "Detached",
    revoke: "Detach",
    revokeConfirm:
      "Detach {label}? This device will no longer be able to synchronize.",
    cancel: "Cancel",
    close: "Close",
  },
  fr: {
    title: "Compte",
    intro:
      "Gérez les appareils qui peuvent synchroniser vos plans d’observation privés.",
    pairedDevices: "Appareils associés",
    pairNewDevice: "Associer un nouvel appareil",
    pairingCode: "Code d’association",
    pairingIntro:
      "Saisissez ou scannez ce code dans {productName} sur votre appareil. Il expire dans cinq minutes.",
    pairingExpires: "Expire à {time}",
    pairingQrAlt: "Code QR du code d’association",
    pairedConfirmation: "{device} est maintenant associé.",
    noDevices: "Aucun appareil n’est encore associé.",
    loadingDevices: "Chargement des appareils associés…",
    devicesError: "Impossible de charger les appareils associés.",
    pairingError: "Impossible de créer un code d’association.",
    revokeError: "L’appareil n’a pas pu être détaché. Réessayez.",
    pairedOn: "Associé",
    lastSynchronized: "Dernière synchronisation",
    never: "Jamais",
    revoked: "Détaché",
    revoke: "Détacher",
    revokeConfirm:
      "Détacher {label} ? Cet appareil ne pourra plus se synchroniser.",
    cancel: "Annuler",
    close: "Fermer",
  },
  ja: {
    title: "アカウント",
    intro: "個人用の観測プランを同期できる端末を管理します。",
    pairedDevices: "連携済みの端末",
    pairNewDevice: "新しい端末を連携",
    pairingCode: "連携コード",
    pairingIntro:
      "端末の {productName} でこのコードを入力または読み取ってください。5分で期限切れになります。",
    pairingExpires: "有効期限 {time}",
    pairingQrAlt: "連携コード用のQRコード",
    pairedConfirmation: "{device}を連携しました。",
    noDevices: "連携済みの端末はまだありません。",
    loadingDevices: "連携済みの端末を読み込み中…",
    devicesError: "連携済みの端末を読み込めませんでした。",
    pairingError: "連携コードを作成できませんでした。",
    revokeError: "端末を切り離せませんでした。もう一度お試しください。",
    pairedOn: "連携日時",
    lastSynchronized: "最終同期",
    never: "未同期",
    revoked: "切り離し済み",
    revoke: "切り離す",
    revokeConfirm: "{label} を切り離しますか？この端末は同期できなくなります。",
    cancel: "キャンセル",
    close: "閉じる",
  },
  de: {
    title: "Konto",
    intro:
      "Verwalte die Geräte, die deine privaten Beobachtungspläne synchronisieren können.",
    pairedDevices: "Gekoppelte Geräte",
    pairNewDevice: "Neues Gerät koppeln",
    pairingCode: "Kopplungscode",
    pairingIntro:
      "Gib diesen Code in {productName} auf deinem Gerät ein oder scanne ihn. Er läuft in fünf Minuten ab.",
    pairingExpires: "Läuft ab: {time}",
    pairingQrAlt: "QR-Code für den Kopplungscode",
    pairedConfirmation: "{device} ist jetzt gekoppelt.",
    noDevices: "Es ist noch kein Gerät gekoppelt.",
    loadingDevices: "Gekoppelte Geräte werden geladen …",
    devicesError: "Die gekoppelten Geräte konnten nicht geladen werden.",
    pairingError: "Der Kopplungscode konnte nicht erstellt werden.",
    revokeError: "Das Gerät konnte nicht getrennt werden. Versuche es erneut.",
    pairedOn: "Gekoppelt",
    lastSynchronized: "Zuletzt synchronisiert",
    never: "Nie",
    revoked: "Getrennt",
    revoke: "Trennen",
    revokeConfirm:
      "{label} trennen? Dieses Gerät kann dann nicht mehr synchronisieren.",
    cancel: "Abbrechen",
    close: "Schließen",
  },
  es: {
    title: "Cuenta",
    intro:
      "Administra los dispositivos que pueden sincronizar tus planes de observación privados.",
    pairedDevices: "Dispositivos vinculados",
    pairNewDevice: "Vincular un dispositivo nuevo",
    pairingCode: "Código de vinculación",
    pairingIntro:
      "Escribe o escanea este código en {productName} en tu dispositivo. Caduca en cinco minutos.",
    pairingExpires: "Caduca: {time}",
    pairingQrAlt: "Código QR del código de vinculación",
    pairedConfirmation: "{device} ya está vinculado.",
    noDevices: "Todavía no hay ningún dispositivo vinculado.",
    loadingDevices: "Cargando los dispositivos vinculados…",
    devicesError: "No se pudieron cargar los dispositivos vinculados.",
    pairingError: "No se pudo crear el código de vinculación.",
    revokeError: "No se pudo desvincular el dispositivo. Inténtalo de nuevo.",
    pairedOn: "Vinculado",
    lastSynchronized: "Última sincronización",
    never: "Nunca",
    revoked: "Desvinculado",
    revoke: "Desvincular",
    revokeConfirm:
      "¿Desvincular {label}? Este dispositivo ya no podrá sincronizar.",
    cancel: "Cancelar",
    close: "Cerrar",
  },
  it: {
    title: "Account",
    intro:
      "Gestisci i dispositivi che possono sincronizzare i piani di osservazione privati.",
    pairedDevices: "Dispositivi associati",
    pairNewDevice: "Associare un nuovo dispositivo",
    pairingCode: "Codice di associazione",
    pairingIntro:
      "Inserisci o scansiona questo codice in {productName} sul dispositivo. Scade tra cinque minuti.",
    pairingExpires: "Scade: {time}",
    pairingQrAlt: "Codice QR del codice di associazione",
    pairedConfirmation: "{device} è ora associato.",
    noDevices: "Nessun dispositivo è ancora associato.",
    loadingDevices: "Caricamento dei dispositivi associati…",
    devicesError: "Non è stato possibile caricare i dispositivi associati.",
    pairingError: "Non è stato possibile creare il codice di associazione.",
    revokeError: "Non è stato possibile scollegare il dispositivo. Riprova.",
    pairedOn: "Associato",
    lastSynchronized: "Ultima sincronizzazione",
    never: "Mai",
    revoked: "Scollegato",
    revoke: "Scollegare",
    revokeConfirm:
      "Scollegare {label}? Questo dispositivo non potrà più sincronizzare.",
    cancel: "Annullare",
    close: "Chiudere",
  },
  "pt-BR": {
    title: "Conta",
    intro:
      "Gerencie os dispositivos que podem sincronizar seus planos de observação privados.",
    pairedDevices: "Dispositivos associados",
    pairNewDevice: "Associar um novo dispositivo",
    pairingCode: "Código de associação",
    pairingIntro:
      "Digite ou escaneie este código no {productName} no seu dispositivo. Ele expira em cinco minutos.",
    pairingExpires: "Expira em {time}",
    pairingQrAlt: "QR code do código de associação",
    pairedConfirmation: "{device} agora está associado.",
    noDevices: "Nenhum dispositivo está associado ainda.",
    loadingDevices: "Carregando os dispositivos associados…",
    devicesError: "Não foi possível carregar os dispositivos associados.",
    pairingError: "Não foi possível criar o código de associação.",
    revokeError: "Não foi possível desvincular o dispositivo. Tente novamente.",
    pairedOn: "Associado",
    lastSynchronized: "Última sincronização",
    never: "Nunca",
    revoked: "Desvinculado",
    revoke: "Desvincular",
    revokeConfirm:
      "Desvincular {label}? Este dispositivo não poderá mais sincronizar.",
    cancel: "Cancelar",
    close: "Fechar",
  },
  "zh-Hans": {
    title: "账户",
    intro: "管理可同步私人观测计划的设备。",
    pairedDevices: "已配对设备",
    pairNewDevice: "配对新设备",
    pairingCode: "配对码",
    pairingIntro:
      "请在设备上的{productName}中输入或扫描此代码。该代码将在五分钟后失效。",
    pairingExpires: "{time}到期",
    pairingQrAlt: "配对码的二维码",
    pairedConfirmation: "{device}已完成配对。",
    noDevices: "尚未配对任何设备。",
    loadingDevices: "正在加载已配对设备……",
    devicesError: "无法加载已配对设备。",
    pairingError: "无法生成配对码。",
    revokeError: "无法解除该设备的绑定，请重试。",
    pairedOn: "配对时间",
    lastSynchronized: "上次同步",
    never: "从未",
    revoked: "已解除绑定",
    revoke: "解除绑定",
    revokeConfirm: "要解除{label}的绑定吗？该设备将无法再同步。",
    cancel: "取消",
    close: "关闭",
  },
  "zh-Hant": {
    title: "帳號",
    intro: "管理可同步私人觀測計畫的裝置。",
    pairedDevices: "已配對裝置",
    pairNewDevice: "配對新裝置",
    pairingCode: "配對碼",
    pairingIntro:
      "請在裝置上的 {productName} 中輸入或掃描此代碼。代碼將於五分鐘後失效。",
    pairingExpires: "{time} 到期",
    pairingQrAlt: "配對碼的 QR 碼",
    pairedConfirmation: "{device} 已完成配對。",
    noDevices: "尚未配對任何裝置。",
    loadingDevices: "正在載入已配對裝置……",
    devicesError: "無法載入已配對裝置。",
    pairingError: "無法建立配對碼。",
    revokeError: "無法解除此裝置的連結，請再試一次。",
    pairedOn: "配對時間",
    lastSynchronized: "上次同步",
    never: "從未",
    revoked: "已解除連結",
    revoke: "解除連結",
    revokeConfirm: "要解除 {label} 的連結嗎？此裝置將無法再同步。",
    cancel: "取消",
    close: "關閉",
  },
  ru: {
    title: "Аккаунт",
    intro:
      "Управляйте устройствами, которые могут синхронизировать ваши личные планы наблюдений.",
    pairedDevices: "Привязанные устройства",
    pairNewDevice: "Привязать новое устройство",
    pairingCode: "Код привязки",
    pairingIntro:
      "Введите или отсканируйте этот код в {productName} на своём устройстве. Он действует пять минут.",
    pairingExpires: "Действует до {time}",
    pairingQrAlt: "QR-код для привязки",
    pairedConfirmation: "Устройство {device} привязано.",
    noDevices: "Устройства ещё не привязаны.",
    loadingDevices: "Загрузка привязанных устройств…",
    devicesError: "Не удалось загрузить привязанные устройства.",
    pairingError: "Не удалось создать код привязки.",
    revokeError: "Не удалось отвязать устройство. Повторите попытку.",
    pairedOn: "Привязано",
    lastSynchronized: "Последняя синхронизация",
    never: "Никогда",
    revoked: "Отвязано",
    revoke: "Отвязать",
    revokeConfirm:
      "Отвязать {label}? Это устройство больше не сможет синхронизироваться.",
    cancel: "Отменить",
    close: "Закрыть",
  },
};

function csrfToken() {
  return csrfCookieValue();
}

async function responseData(response, fallbackMessage) {
  const payload = await response.json().catch(() => null);
  if (response.ok) return payload;
  throw new Error(payload?.error?.message || fallbackMessage);
}

function dateLabel(value, locale, fallback) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(date);
}

function placeholder(template, name, value) {
  return template.replace(`{${name}}`, value);
}

export function AccountPage({ locale = "en", billing = null }) {
  const copy = copyFor(accountCopy, locale, "AccountPage.accountCopy");
  // An optional billing section, registered through the account extension
  // points -- absent (and this whole block a no-op) when nothing registers
  // one.
  const [BillingSection] = getAccountExtensions("account.billing");
  // An optional zone just under the header, registered the same way and
  // drawn only for a signed-in account.
  const [OffersZone] = getAccountExtensions("account.offers");
  const [devices, setDevices] = useState(null);
  const [devicesError, setDevicesError] = useState("");
  const [pairing, setPairing] = useState(null);
  const [pairingQr, setPairingQr] = useState("");
  const [pairingError, setPairingError] = useState("");
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairedDeviceLabel, setPairedDeviceLabel] = useState("");
  const [revokingId, setRevokingId] = useState("");
  // The device whose revocation awaits confirmation: the shared web
  // confirmation (cross at the top right, actions at the bottom) replaces
  // the browser's own `window.confirm`.
  const [revokeCandidate, setRevokeCandidate] = useState(null);

  const loadDevices = useCallback(async () => {
    setDevicesError("");
    try {
      const payload = await responseData(
        await fetch("/api/v1/devices", { cache: "no-store" }),
        copy.devicesError,
      );
      if (!Array.isArray(payload?.devices)) throw new Error(copy.devicesError);
      setDevices(payload.devices);
      return payload.devices;
    } catch (error) {
      setDevicesError(error.message || copy.devicesError);
      setDevices([]);
      return [];
    }
  }, [copy.devicesError]);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    let cancelled = false;
    if (!pairing?.code) {
      setPairingQr("");
      return undefined;
    }
    let qrPayload;
    try {
      // The origin exactly as the browser reports it: the scanning client has no
      // other way to learn which server this code belongs to (`v1.md`'s own
      // "Device pairing" section).
      qrPayload = buildPairingQrPayload({
        origin: window.location.origin,
        code: pairing.code,
      });
    } catch {
      setPairingQr("");
      return undefined;
    }
    QRCode.toDataURL(qrPayload, {
      color: { dark: "#101510", light: "#f5f4ec" },
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
    })
      .then((dataUrl) => {
        if (!cancelled) setPairingQr(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setPairingQr("");
      });
    return () => {
      cancelled = true;
    };
  }, [pairing?.code]);

  // Polls `GET /v1/devices/pairings/{code}` while a code is on screen, so
  // the panel updates itself the moment the device finishes pairing
  // (the pairing page updates itself). Stops on
  // the code's own expiry, on a fresh code replacing this one (a new
  // `pairing.code` re-runs this effect, whose cleanup stops the old
  // poller first), on the tab going to the background, and on unmount —
  // `createPairingPoller`'s own contract never leaves a second timer
  // running underneath this one.
  useEffect(() => {
    if (!pairing?.code || !pairing?.expiresAt) return undefined;
    let cancelled = false;
    const poller = createPairingPoller({
      checkClaimed: async () => {
        const response = await fetch(
          `/api/v1/devices/pairings/${encodeURIComponent(pairing.code)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return false;
        const payload = await response.json().catch(() => null);
        return Boolean(payload?.claimed);
      },
      onClaimed: async () => {
        if (cancelled) return;
        const freshDevices = await loadDevices();
        if (cancelled) return;
        setPairing(null);
        setPairingQr("");
        setPairedDeviceLabel(freshDevices?.[0]?.label || copy.pairedDevices);
      },
      // The code's own "Expires {time}" text already said so; nothing
      // further to show once polling itself gives up on it.
      onExpired: () => {},
    });

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        poller.stop();
      } else if (!cancelled) {
        poller.start(pairing.expiresAt);
      }
    }

    poller.start(pairing.expiresAt);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      poller.stop();
    };
  }, [pairing?.code, pairing?.expiresAt, loadDevices, copy.pairedDevices]);

  const createPairing = async () => {
    setPairingBusy(true);
    setPairingError("");
    setPairedDeviceLabel("");
    try {
      const payload = await responseData(
        await fetch("/api/v1/devices/pairings", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-astro-csrf": csrfToken() || "",
          },
          body: "{}",
        }),
        copy.pairingError,
      );
      if (!payload?.code || !payload?.expiresAt)
        throw new Error(copy.pairingError);
      setPairingQr("");
      setPairing({ code: payload.code, expiresAt: payload.expiresAt });
    } catch (error) {
      setPairingError(error.message || copy.pairingError);
    } finally {
      setPairingBusy(false);
    }
  };

  const revoke = async (device) => {
    setRevokeCandidate(null);
    setRevokingId(device.id);
    setDevicesError("");
    try {
      await responseData(
        await fetch(`/api/v1/devices/${encodeURIComponent(device.id)}`, {
          method: "DELETE",
          headers: { "x-astro-csrf": csrfToken() || "" },
        }),
        copy.revokeError,
      );
      await loadDevices();
    } catch (error) {
      setDevicesError(error.message || copy.revokeError);
    } finally {
      setRevokingId("");
    }
  };

  return (
    <main className="account-page">
      <header className="account-header">
        <p className="eyebrow">{productName().toUpperCase()}</p>
        <h1>{copy.title}</h1>
        <p>{copy.intro}</p>
      </header>

      {OffersZone && billing?.mode === "hosted" && billing.authenticated && (
        <OffersZone {...billing} locale={locale} />
      )}

      <section
        className="account-panel account-pairing"
        aria-labelledby="pairing-heading"
      >
        <div className="account-panel-heading">
          <div>
            <h2 id="pairing-heading">{copy.pairNewDevice}</h2>
            <p>
              {/* The app on the device is PlanAstro; « Astro Portal » is this
                  server. */}
              {placeholder(copy.pairingIntro, "productName", "PlanAstro")}
            </p>
          </div>
          <button
            className="btn-primary"
            disabled={pairingBusy}
            type="button"
            onClick={createPairing}
          >
            {copy.pairNewDevice}
          </button>
        </div>
        {pairingError && (
          <p className="account-error" role="alert">
            {pairingError}
          </p>
        )}
        {pairedDeviceLabel && (
          <p
            className="account-paired-confirmation"
            role="status"
            aria-live="polite"
          >
            {placeholder(copy.pairedConfirmation, "device", pairedDeviceLabel)}
          </p>
        )}
        {pairing && (
          <div className="account-pairing-code" aria-live="polite">
            <div>
              <p className="account-code-label">{copy.pairingCode}</p>
              <output>{pairing.code}</output>
              <p>
                {placeholder(
                  copy.pairingExpires,
                  "time",
                  dateLabel(pairing.expiresAt, locale, copy.never),
                )}
              </p>
            </div>
            {pairingQr && (
              <img
                src={pairingQr}
                alt={copy.pairingQrAlt}
                width="280"
                height="280"
              />
            )}
          </div>
        )}
      </section>

      <section className="account-panel" aria-labelledby="devices-heading">
        <div className="account-panel-heading">
          <div>
            <h2 id="devices-heading">{copy.pairedDevices}</h2>
            <p>{copy.intro}</p>
          </div>
        </div>
        {devices === null ? (
          <p className="account-muted" aria-live="polite">
            {copy.loadingDevices}
          </p>
        ) : devices.length ? (
          <ul className="account-device-list" aria-busy={Boolean(revokingId)}>
            {devices.map((device) => {
              const revoked = Boolean(device.revokedAt);
              return (
                <li className="account-device" key={device.id}>
                  <div className="account-device-summary">
                    <h3>{device.label}</h3>
                    {revoked && <span>{copy.revoked}</span>}
                  </div>
                  <dl>
                    <div>
                      <dt>{copy.pairedOn}</dt>
                      <dd>{dateLabel(device.createdAt, locale, copy.never)}</dd>
                    </div>
                    <div>
                      <dt>{copy.lastSynchronized}</dt>
                      <dd>
                        {dateLabel(device.lastSyncAt, locale, copy.never)}
                      </dd>
                    </div>
                  </dl>
                  {!revoked && (
                    <button
                      className="btn-tertiary is-destructive account-revoke"
                      disabled={revokingId === device.id}
                      type="button"
                      onClick={() => setRevokeCandidate(device)}
                    >
                      {copy.revoke}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="account-muted">{copy.noDevices}</p>
        )}
        {devicesError && (
          <p className="account-error" role="alert">
            {devicesError}
          </p>
        )}
      </section>

      {BillingSection && billing && (
        <BillingSection {...billing} locale={locale} />
      )}

      {/* « Exporter mes données ». */}
      <DataExportSection locale={locale} />

      {/* « Importer mes données », after the export (a private server
          signing in by password). */}
      <DataImportSection locale={locale} />

      {revokeCandidate && (
        <WebConfirmDialog
          cancelLabel={copy.cancel}
          closeLabel={copy.close}
          confirmLabel={copy.revoke}
          onCancel={() => setRevokeCandidate(null)}
          onConfirm={() => revoke(revokeCandidate)}
          title={placeholder(
            copy.revokeConfirm,
            "label",
            revokeCandidate.label || copy.pairedDevices,
          )}
          tone="danger"
        />
      )}
    </main>
  );
}
