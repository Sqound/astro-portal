// Closing the place editor with something unsaved asks first: a new place as
// soon as a position is chosen, a place
// being edited once its position or its horizon changed — and the words of
// the question exist in the ten languages.
import assert from "node:assert/strict";
import test from "node:test";
import { shippedLocales } from "../dist/locales.js";
import { placeHasUnsavedChoices } from "../dist/planner/place-leave-guard.js";
import { plannerFlowMessages } from "../dist/planner/flow-messages.js";

const saved = {
  id: "col",
  name: "Col des Mélèzes",
  latitude: "45.00000",
  longitude: "-30.00000",
  elevation: "1800",
  timeZone: "Etc/GMT+2",
};

test("a new place with nothing chosen asks nothing", () => {
  assert.equal(
    placeHasUnsavedChoices({
      place: null,
      draft: { name: "", latitude: "", longitude: "" },
    }),
    false,
  );
});

test("a new place with a position chosen asks", () => {
  assert.equal(
    placeHasUnsavedChoices({
      place: null,
      draft: { name: "", latitude: "45", longitude: "-30" },
    }),
    true,
  );
});

test("a place opened and left as it was asks nothing", () => {
  assert.equal(
    placeHasUnsavedChoices({ place: saved, draft: { ...saved } }),
    false,
  );
});

test("a place whose position moved, or whose horizon was drawn, asks", () => {
  assert.equal(
    placeHasUnsavedChoices({
      place: saved,
      draft: { ...saved, latitude: "46.00000" },
    }),
    true,
  );
  assert.equal(
    placeHasUnsavedChoices({
      place: saved,
      draft: {
        ...saved,
        horizonMask: {
          enabled: true,
          points: [{ azimuth: 90, altitude: 30 }],
        },
      },
    }),
    true,
  );
});

test("the question is written in every shipped language", () => {
  const keys = [
    "leaveTitle",
    "leaveKeep",
    "leaveConfirm",
    "leaveNewBody",
    "leaveEditBody",
  ];
  for (const locale of shippedLocales()) {
    const messages = plannerFlowMessages[locale];
    assert.ok(messages, locale);
    for (const key of keys) {
      assert.ok(messages[key] && messages[key].length >= 2, `${locale} ${key}`);
    }
  }
  assert.equal(
    plannerFlowMessages.fr.leaveNewBody,
    "Le lieu que vous saisissez n’est pas encore enregistré : en quittant maintenant, vous le perdez.",
  );
});
