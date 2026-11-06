// What the web planner holds back for a person whose profile does not carry a
// capability: several plans, and the mosaics. A framing of a single field is
// the planner's own and is never held back. The planner is the product and is
// shown to everyone (`PlannerSurface`); what a profile does not carry is kept
// visible but held back HERE, inside it, with a sentence that says so.
// The sentence is the core's own,
// neutral one (`HELD_COPY`) unless a shell registered the words of its offers
// and the way to them at `planner.offers`.
//
// The screen is never the only barrier: the service refuses the same things
// by itself (`plan_limit_reached` on `PUT /api/plans` and `/v1/plans`,
// `capability_required` on the framing routes for a mosaic).
//
// Never held back, whatever the profile: the correctness of the plan and the
// protection of the equipment (the calculation of the night, the visibility
// of the targets, the mount-safety alerts). Nothing in this module reads them.
import {
  pendingPlanPermission,
  planStatusCountsTowardNight,
} from "portal/capabilities/provider.js";
import { copyFor } from "portal/locales.js";
import { planStatus } from "./planner.js";

/**
 * What a capability holds back, said without selling anything: the words of
 * the open core, for a server whose profile does not carry a capability and
 * that registered no offers (`planner.offers`). `planLimit` for a signed-in
 * person, `planLimitLocal` for a visitor, `mosaic` for the mosaics (the
 * greyed "Mosaïque" section of the framing settings, and a mosaic refused),
 * `multiNight` for the multi-night plans (`multi-night-access.js`),
 * `browserPlanHeld` for a plan of the browser the space had no room for.
 */
export const HELD_COPY = {
  fr: {
    planLimit:
      "Ce service n’autorise qu’un plan par nuit. Un autre plan pour cette nuit ne peut pas être créé ici.",
    planLimitLocal:
      "Plusieurs plans pour une même nuit ne sont pas disponibles avec ce service.",
    mosaic: "Les mosaïques ne sont pas disponibles avec ce profil de service.",
    multiNight:
      "Les plans multi-nuits ne sont pas disponibles avec ce profil de service.",
    browserPlanHeld:
      "Ce plan reste dans ce navigateur : il n’est pas dans votre espace.",
    planGuard:
      "Ce service ne synchronise pas plus de 1 000 plans en cours. Un plan de plus ne peut pas être créé ici.",
  },
  en: {
    planLimit:
      "This service allows one plan per night. Another plan for this night cannot be created here.",
    planLimitLocal:
      "Multiple plans for the same night are not available with this service.",
    mosaic: "Mosaics are not available with this service profile.",
    multiNight:
      "Multi-night plans are not available with this service profile.",
    browserPlanHeld:
      "This plan stays in this browser: it is not in your space.",
    planGuard:
      "This service synchronizes no more than 1,000 pending plans. Another plan cannot be created here.",
  },
  ja: {
    planLimit:
      "このサービスでは、1つの夜につき1つのプランを作成できます。この夜に別のプランを作成することはできません。",
    planLimitLocal:
      "このサービスでは、同じ夜に複数のプランを作成することはできません。",
    mosaic: "このサービスプロファイルでは、モザイクを利用できません。",
    multiNight:
      "このサービスプロファイルでは、複数夜のプランを利用できません。",
    browserPlanHeld:
      "このプランはこのブラウザーに残ります。スペースには入っていません。",
    planGuard:
      "このサービスで同期できる未実行のプランは1,000件までです。ここではプランを追加できません。",
  },
  de: {
    planLimit:
      "Dieser Dienst erlaubt einen Plan pro Nacht. Ein weiterer Plan für diese Nacht kann hier nicht erstellt werden.",
    planLimitLocal:
      "Mehrere Pläne für dieselbe Nacht sind mit diesem Dienst nicht verfügbar.",
    mosaic: "Mosaike sind mit diesem Dienstprofil nicht verfügbar.",
    multiNight: "Mehrnachtpläne sind mit diesem Dienstprofil nicht verfügbar.",
    browserPlanHeld:
      "Dieser Plan bleibt in diesem Browser: Er ist nicht in deinem Bereich.",
    planGuard:
      "Dieser Dienst synchronisiert höchstens 1.000 ausstehende Pläne. Ein weiterer Plan kann hier nicht erstellt werden.",
  },
  es: {
    planLimit:
      "Este servicio permite un plan por noche. No se puede crear otro plan para esta noche aquí.",
    planLimitLocal:
      "Varios planes para una misma noche no están disponibles con este servicio.",
    mosaic: "Los mosaicos no están disponibles con este perfil de servicio.",
    multiNight:
      "Los planes de varias noches no están disponibles con este perfil de servicio.",
    browserPlanHeld:
      "Este plan permanece en este navegador: no está en tu espacio.",
    planGuard:
      "Este servicio sincroniza como máximo 1.000 planes pendientes. No se puede crear un plan más aquí.",
  },
  it: {
    planLimit:
      "Questo servizio consente un piano per notte. Qui non è possibile creare un altro piano per questa notte.",
    planLimitLocal:
      "Più piani per la stessa notte non sono disponibili con questo servizio.",
    mosaic: "I mosaici non sono disponibili con questo profilo di servizio.",
    multiNight:
      "I piani su più notti non sono disponibili con questo profilo di servizio.",
    browserPlanHeld:
      "Questo piano resta in questo browser: non è nello spazio.",
    planGuard:
      "Questo servizio sincronizza al massimo 1.000 piani in attesa. Qui non è possibile creare un altro piano.",
  },
  "pt-BR": {
    planLimit:
      "Este serviço permite um plano por noite. Não é possível criar outro plano para esta noite aqui.",
    planLimitLocal:
      "Vários planos para a mesma noite não estão disponíveis com este serviço.",
    mosaic: "Os mosaicos não estão disponíveis com este perfil de serviço.",
    multiNight:
      "Planos de várias noites não estão disponíveis com este perfil de serviço.",
    browserPlanHeld:
      "Este plano permanece neste navegador: ele não está no seu espaço.",
    planGuard:
      "Este serviço sincroniza no máximo 1.000 planos pendentes. Não é possível criar mais um plano aqui.",
  },
  "zh-Hans": {
    planLimit: "此服务每晚允许一个计划，无法在此为同一夜晚再创建计划。",
    planLimitLocal: "此服务不支持为同一夜晚创建多个计划。",
    mosaic: "此服务配置不支持马赛克。",
    multiNight: "此服务配置不支持多夜计划。",
    browserPlanHeld: "此计划保留在此浏览器上：它不在你的空间中。",
    planGuard: "此服务最多同步1,000个待执行计划，无法在此再创建计划。",
  },
  "zh-Hant": {
    planLimit: "此服務每晚允許一個計畫，無法在此為同一夜晚再建立計畫。",
    planLimitLocal: "此服務不支援為同一夜晚建立多個計畫。",
    mosaic: "此服務設定檔不提供拼接功能。",
    multiNight: "此服務設定檔不支援多夜計畫。",
    browserPlanHeld: "此計畫保留在此瀏覽器上：它不在你的空間中。",
    planGuard: "此服務最多同步1,000個待執行計畫，無法在此再建立計畫。",
  },
  ru: {
    planLimit:
      "Этот сервис допускает один план на ночь. Здесь нельзя создать другой план на эту ночь.",
    planLimitLocal: "Несколько планов на одну ночь недоступны в этом сервисе.",
    mosaic: "Мозаики недоступны в этом профиле сервиса.",
    multiNight: "Планы на несколько ночей недоступны в этом профиле сервиса.",
    browserPlanHeld:
      "Этот план остаётся в этом браузере: его нет в вашем пространстве.",
    planGuard:
      "Этот сервис синхронизирует не более 1 000 ожидающих планов. Здесь нельзя создать ещё один план.",
  },
};

export const heldCopy = (locale) =>
  copyFor(HELD_COPY, locale, "capability-gates.HELD_COPY");

/**
 * The plans the rules of the offer look at. The internal plan of a guided
 * evening (`guidedEvening`) is outside the rule of one plan per night and the
 * numeric guard — it never counts and is never refused, as the service does
 * not count nor refuse it — so it is left out here, before the shared
 * `pendingPlanPermission` (whose contract is unchanged) is asked.
 */
export const ordinaryPlans = (plans) =>
  (plans || []).filter((plan) => plan?.guidedEvening !== true);

/**
 * The plans that count toward a limit: the pending ones. An executed, abandoned or archived plan is
 * history, never a slot — the same count the service makes
 * (`planStatusCountsTowardLimit`).
 */
export function pendingPlanCount(plans) {
  return ordinaryPlans(plans).filter((plan) => planStatus(plan) === "pending")
    .length;
}

const numeric = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

/** The numeric guard only; the per-night rule is checked separately. */
export function pendingPlanLimit(capabilities) {
  const limit = numeric(capabilities?.["sync.plan_limit"]);
  return limit >= 1 ? Math.floor(limit) : Infinity;
}

/** Available guard slots, restricted to one for a held-back night. */
export const pendingPlanSlots = ({ capabilities, plans, date }) => {
  const guard = Math.max(
    0,
    pendingPlanLimit(capabilities) - pendingPlanCount(plans),
  );
  if (!date || capabilities?.["planner.multiple"] !== false) return guard;
  return Math.min(
    guard,
    ordinaryPlans(plans).some(
      (plan) =>
        planStatusCountsTowardNight(planStatus(plan)) && plan.date === date,
    )
      ? 0
      : 1,
  );
};

/** One shared preflight for creation and a pending plan's date change. */
export function planCreationGate({
  capabilities,
  plans,
  signedIn,
  date,
  planId,
}) {
  const kind = pendingPlanPermission({
    capabilities,
    plans: ordinaryPlans(plans).map((plan) => ({
      ...plan,
      status: planStatus(plan),
    })),
    date,
    planId,
  });
  return kind === "allowed"
    ? { allowed: true, refusal: null }
    : {
        allowed: false,
        refusal:
          kind === "guard"
            ? "planGuard"
            : signedIn
              ? "planLimit"
              : "planLimitLocal",
      };
}

/**
 * The mosaics (`planner.mosaic`), which the service also demands to write or
 * restore a mosaic framing. A framing of a single field never needs it, nor
 * do deleting or archiving a framing, exporting one and reading the library.
 */
export function mosaicGate({ capabilities }) {
  if (!capabilities) return { allowed: true, refusal: null };
  return capabilities["planner.mosaic"]
    ? { allowed: true, refusal: null }
    : { allowed: false, refusal: "mosaic" };
}

/**
 * Does writing `target` (a framing's saved target) need `planner.mosaic`? A
 * mosaic stores the sky surface it covers (`framing.mosaic`);
 * a framing of a single field does not, and is everyone's. The service asks
 * the same of a framing's payload (`isMosaicFramingPayload`).
 */
export function framingNeedsMosaic(target) {
  const mosaic = target?.framing?.mosaic;
  return Boolean(mosaic) && typeof mosaic === "object";
}

export function plannerGates({ capabilities, plans, signedIn, date, planId }) {
  return {
    planCreation: planCreationGate({
      capabilities,
      plans,
      signedIn,
      date,
      planId,
    }),
    mosaic: mosaicGate({ capabilities }),
  };
}

/** Would `next` hold more pending plans than `previous`? */
export const createsPendingPlan = (previous, next) =>
  pendingPlanCount(next) > pendingPlanCount(previous);
