import assert from "node:assert/strict";
import test from "node:test";

import { message } from "portal/i18n.js";
import { telescopeProfiles } from "planner/planner.js";
import {
  effectiveFocalLengthText,
  equipmentProfileIsEstimated,
} from "planner/telescope-picker.js";

// A profile whose values are a retailer's, the press's or a community page's
// (`calculation` begins "Estimation :") is said to be estimated; one computed
// from the maker's own figures is not. A telescope that is not chosen
// resolves to a focal length of 0, which is an absence: "—", never "0 mm".
const telescope = (id) =>
  telescopeProfiles.find((profile) => profile.id === id);

test("the telescopes whose figures are estimates are marked", () => {
  assert.equal(equipmentProfileIsEstimated(telescope("dwarf-draco")), true);
  assert.equal(equipmentProfileIsEstimated(telescope("dwarf-mini")), true);
  assert.equal(
    equipmentProfileIsEstimated(telescope("unistellar-equinox-2")),
    true,
  );
});

test("values computed from the maker's figures are not estimates", () => {
  assert.equal(equipmentProfileIsEstimated(telescope("seestar-s50")), false);
});

test("no profile, or one without a calculation, is not an estimate", () => {
  assert.equal(equipmentProfileIsEstimated(null), false);
  assert.equal(equipmentProfileIsEstimated({ id: "x", name: "X" }), false);
});

test("exactly the profiles that say « Estimation » are marked", () => {
  for (const profile of telescopeProfiles) {
    const says = [profile.calculation, profile.integratedCamera?.calculation]
      .filter((text) => typeof text === "string")
      .some((text) => text.startsWith("Estimation"));
    assert.equal(equipmentProfileIsEstimated(profile), says, profile.id);
  }
});

test("the note is written in every language of the interface", () => {
  for (const locale of ["en", "fr", "ja", "de", "es", "it", "pt-BR", "ru"])
    assert.notEqual(
      message(locale, "equipmentEstimatedValuesNote"),
      "equipmentEstimatedValuesNote",
      locale,
    );
});

test("an absent or zero focal length is a dash, a real one keeps its unit", () => {
  for (const value of [0, null, undefined, "", "abc", -5, Number.NaN])
    assert.equal(effectiveFocalLengthText("en", value), "—", String(value));
  assert.equal(effectiveFocalLengthText("en", 250), "250 mm");
  assert.equal(
    effectiveFocalLengthText("fr", "1000.5").replace(/\s/g, " "),
    "1 000,5 mm",
  );
});
