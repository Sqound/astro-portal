// The detail the planner's sync status line opens on the web -- what waits, the
// last attempt, the reason of a failure in plain words, a link "Réessayer
// maintenant", the ⓘ. "Fermer"
// and "Réessayer maintenant" are links.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { message } from "portal/i18n.js";
import { shippedLocales } from "portal/locales.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import {
  describeSyncFailure,
  shownSyncCode,
  syncAttemptWhen,
  syncPendingRows,
} from "../src/sync-status.js";

await registerJsx();
const { SyncStatusActions, SyncStatusContent, SyncStatusInfo } =
  await import("planner/components/SyncStatusDialog.js");

const text = (markup) =>
  markup
    .replace(/<style>.*?<\/style>/gs, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const NOW = new Date(2026, 9, 9, 15, 0).getTime();
const content = (props) =>
  renderToStaticMarkup(
    createElement(SyncStatusContent, {
      locale: "fr",
      now: NOW,
      online: true,
      ...props,
    }),
  );

test("a failure in plain words: offline, service not answering, refusal with its code", () => {
  assert.deepEqual(describeSyncFailure(new Error("x"), { online: false }), {
    kind: "offline",
  });
  assert.deepEqual(describeSyncFailure(new TypeError("Failed to fetch")), {
    kind: "unreachable",
  });
  assert.deepEqual(
    describeSyncFailure(Object.assign(new Error("down"), { status: 503 })),
    { kind: "unreachable" },
  );
  const refused = describeSyncFailure(
    Object.assign(new Error("private words of the service"), {
      status: 409,
      code: "plan_conflict",
    }),
  );
  assert.deepEqual(refused, {
    kind: "refused",
    status: 409,
    code: "plan_conflict",
  });
  assert.equal(shownSyncCode(refused), "409");
  assert.equal(
    shownSyncCode(
      describeSyncFailure(
        Object.assign(new Error("x"), { code: "plan_limit_reached" }),
      ),
    ),
    "plan_limit_reached",
  );
  assert.ok(!JSON.stringify(refused).includes("private words"));
});

test("what waits: the edits of the space and the plans of the browser, none for a browser without a space", () => {
  assert.deepEqual(syncPendingRows({ status: "synced" }), []);
  assert.deepEqual(syncPendingRows({ status: "local", edits: true }), []);
  assert.deepEqual(syncPendingRows({ status: "pending" }), [{ kind: "edits" }]);
  assert.deepEqual(
    syncPendingRows({ status: "synced", edits: true, browserPlans: 2 }),
    [{ kind: "edits" }, { kind: "browserPlans", count: 2 }],
  );
});

test("when: the hour today, then « hier », then the date", () => {
  const today = syncAttemptWhen(new Date(2026, 9, 9, 12, 30), NOW, "fr");
  assert.equal(today.key, "plannerSyncDetailWhenToday");
  assert.equal(today.values.time, "12:30");
  const yesterday = syncAttemptWhen(new Date(2026, 9, 8, 23, 5), NOW, "fr");
  assert.equal(yesterday.key, "plannerSyncDetailWhenYesterday");
  const earlier = syncAttemptWhen(new Date(2026, 8, 28, 21, 14), NOW, "fr");
  assert.equal(earlier.key, "plannerSyncDetailWhenOn");
  assert.equal(earlier.values.time, "21:14");
  assert.match(earlier.values.date, /28/);
});

test("waiting: the rows, the last attempt and the reason of a failure", () => {
  const markup = content({
    status: "pending",
    edits: true,
    browserPlans: 2,
    attempt: {
      at: new Date(2026, 9, 9, 12, 30).getTime(),
      ok: false,
      failure: { kind: "refused", status: 409, code: "plan_conflict" },
    },
  });
  assert.equal(
    text(markup),
    "En attente d’envoi Modifications de vos plans Plans de ce navigateur à ajouter à votre espace 2 " +
      "Dernière tentative : aujourd’hui à 12:30, sans succès. " +
      "Le service n’a pas accepté l’envoi (code 409).",
  );
  assert.match(markup, /data-testid="planner-sync-detail-reason"/);
});

test("no network is the reason, even when the last attempt gave another", () => {
  const markup = content({
    status: "pending",
    online: false,
    attempt: {
      at: new Date(2026, 9, 9, 12, 30).getTime(),
      ok: false,
      failure: { kind: "unreachable" },
    },
  });
  assert.match(text(markup), /n’a pas de réseau/);
  assert.doesNotMatch(text(markup), /ne répond pas/);
});

test("a service that does not answer is told as such", () => {
  const markup = content({
    status: "pending",
    attempt: {
      at: new Date(2026, 9, 9, 12, 30).getTime(),
      ok: false,
      failure: { kind: "unreachable" },
    },
  });
  assert.match(text(markup), /Le service ne répond pas pour l’instant/);
});

test("waiting with no attempt yet says so, without a reason", () => {
  const markup = content({ status: "pending" });
  assert.match(
    text(markup),
    /Aucune tentative depuis l’ouverture de cette page\./,
  );
  assert.doesNotMatch(markup, /planner-sync-detail-reason/);
});

test("synchronized: empty and reassuring, with the last attempt that went through", () => {
  const markup = content({
    status: "synced",
    attempt: { at: new Date(2026, 9, 9, 14, 0).getTime(), ok: true },
  });
  assert.equal(
    text(markup),
    "Tout est à jour : vos plans ont été envoyés. Dernière tentative : aujourd’hui à 14:00, envoi réussi.",
  );
  assert.doesNotMatch(markup, /planner-sync-detail-reason/);
  // Nothing waits: no retry.
  const actions = renderToStaticMarkup(
    createElement(SyncStatusActions, { locale: "fr", canRetry: false }),
  );
  assert.doesNotMatch(actions, /planner-sync-detail-retry/);
});

test("a browser signed in to no space: one sentence, nothing is sent", () => {
  const markup = content({ status: "local", edits: true });
  assert.match(text(markup), /rien n’est envoyé/);
  assert.doesNotMatch(markup, /En attente d’envoi/);
});

test("« Réessayer maintenant » and « Fermer » are links; the ⓘ is the app's one", () => {
  const actions = renderToStaticMarkup(
    createElement(SyncStatusActions, {
      locale: "fr",
      canRetry: true,
      onRetry() {},
      onClose() {},
    }),
  );
  assert.match(
    actions,
    /<button type="button" class="btn-link" data-testid="planner-sync-detail-close">Fermer<\/button>/,
  );
  assert.match(
    actions,
    /<button type="button" class="btn-link" data-testid="planner-sync-detail-retry">Réessayer maintenant<\/button>/,
  );
  const info = renderToStaticMarkup(
    createElement(SyncStatusInfo, { locale: "fr" }),
  );
  assert.match(info, /class="info-button planner-sync-detail-info"/);
  assert.match(info, /aria-label="En savoir plus"/);
});

test("the status line is a button named by its own text and hinted, in the page", () => {
  const source = readFileSync(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /className="planner-sync-status-open"/);
  assert.match(source, /plannerSyncDetailOpen/);
  const css = readFileSync(
    new URL("../../portal-app/styles/portal.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /\.planner-sync-status-open \{[^}]*min-height: 44px/s);
});

test("every shipped language says it, with « vous » words and no offer name", () => {
  const keys = [
    "plannerSyncDetailOpen",
    "plannerSyncDetailTitle",
    "plannerSyncDetailInfo",
    "plannerSyncDetailPendingHeading",
    "plannerSyncDetailEdits",
    "plannerSyncDetailBrowserPlans",
    "plannerSyncDetailAllSynced",
    "plannerSyncDetailLocal",
    "plannerSyncDetailSyncing",
    "plannerSyncDetailLastDone",
    "plannerSyncDetailLastFailed",
    "plannerSyncDetailNoAttempt",
    "plannerSyncDetailWhenToday",
    "plannerSyncDetailWhenYesterday",
    "plannerSyncDetailWhenOn",
    "plannerSyncDetailReasonOffline",
    "plannerSyncDetailReasonUnreachable",
    "plannerSyncDetailReasonRefused",
    "plannerSyncDetailRetry",
    "plannerSyncDetailRetrying",
  ];
  for (const locale of shippedLocales()) {
    for (const key of keys) {
      const value = message(locale, key);
      assert.notEqual(value, key, `${locale}: ${key} is missing`);
      assert.ok(value.trim().length > 0);
      assert.doesNotMatch(value, /Avancée|Advanced|Pro\b/);
    }
    assert.match(message(locale, "plannerSyncDetailLastDone"), /\{when\}/);
    assert.match(message(locale, "plannerSyncDetailReasonRefused"), /\{code\}/);
  }
});
