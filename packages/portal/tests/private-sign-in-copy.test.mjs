import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { signInCopyFor } from "../dist/components/space/sign-in-copy.js";
import { spaceCopyFor } from "../dist/components/space/space-copy.js";

// The words of a private server's own pages (docs/PRIVATE_NOTEBOOK_AUTH.md):
// the sign-in by e-mail code and the space page when `spaceCreation` is
// `closed`, and the installation, the password and the recovery codes
// (components/auth/AuthPage.js). These are the
// private server's own: « votre portail », never a space to create; « se connecter »,
// « détacher », « code de secours »; the same keys in the three languages;
// « vous », never « tu ».

const LANGUAGES = ["fr", "en", "ja"];

/** A literal object of a source file. */
function literal(relative, marker) {
  const text = readFileSync(new URL(relative, import.meta.url), "utf8");
  const open = text.indexOf("{", text.indexOf(marker));
  let depth = 0;
  let quote = null;
  let index = open;
  for (; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) break;
  }
  return new Function(`return (${text.slice(open, index + 1)});`)();
}

const authCopy = literal(
  "../src/components/auth/AuthPage.js",
  "const authCopy = ",
);

function* texts(value) {
  if (typeof value === "string") yield value;
  else if (typeof value === "function") {
    const arity = Math.max(1, value.length);
    for (const sample of [1, 2, "X"])
      yield String(value(...Array(arity).fill(sample)));
  } else if (Array.isArray(value)) for (const item of value) yield* texts(item);
  else if (value && typeof value === "object")
    for (const item of Object.values(value)) yield* texts(item);
}

const closed = (language) => ({
  "the sign-in by e-mail code": signInCopyFor(language, {
    spaceCreation: "closed",
  }),
  "the space page": spaceCopyFor(language, { spaceCreation: "closed" }),
  "the installation, the password and the recovery codes": authCopy[language],
});

/** Words a private server's pages never say, by language. */
const FORBIDDEN = {
  fr: [
    [/appair/iu, "« associer », « rattacher », never « appairer »"],
    [/dissoci/iu, "« détacher », never « dissocier »"],
    [/espace Astro Portal/iu, "« votre portail »: no space of the service"],
    [/créer (?:un|votre) espace/iu, "no space is created here"],
    [/(?<!\p{L})(?:tu|toi|ton|ta|tes)(?!\p{L})/iu, "« vous », never « tu »"],
    [/récupération/iu, "« code de secours »"],
    [/authentificat/iu, "no authenticator any more"],
  ],
  en: [
    [/unpair/iu, "« detach »"],
    [/\blog ?(?:in|out)\b/iu, "« sign in », « sign out »"],
    [/Astro Portal space/iu, "« your portal »: no space of the service"],
    [/create (?:a|your) space/iu, "no space is created here"],
    [/authenticator/iu, "no authenticator any more"],
  ],
  ja: [
    [/ログイン|ログアウト/u, "« サインイン »"],
    [/ペアリング/u, "« 連携 »"],
    [/デバイス/u, "a device is « 端末 »"],
    [/Astro Portal スペース/u, "« ポータル »"],
    [/認証アプリ/u, "no authenticator any more"],
  ],
};

test("a private server's pages say « votre portail », « se connecter », « détacher » and « code de secours »: never a space to create, an authenticator, « tu »", () => {
  const found = [];
  for (const language of LANGUAGES)
    for (const [surface, table] of Object.entries(closed(language)))
      for (const text of texts(table))
        for (const [pattern, why] of FORBIDDEN[language])
          // « マイデバイス » is the name of the list « Mes appareils ».
          if (pattern.test(text.replaceAll("マイデバイス", "")))
            found.push(`${surface} (${language}), ${why}: « ${text} »`);
  assert.deepEqual(found, []);
});

test("the recovery codes are « codes de secours » on every private page", () => {
  assert.equal(authCopy.fr.recoveryLabel, "Code de secours");
  assert.equal(
    signInCopyFor("fr", { spaceCreation: "closed" }).recoveryLink,
    authCopy.fr.recovery,
  );
  assert.equal(
    signInCopyFor("en", { spaceCreation: "closed" }).recoveryLink,
    authCopy.en.recovery,
  );
  assert.equal(
    signInCopyFor("ja", { spaceCreation: "closed" }).recoveryLink,
    authCopy.ja.recovery,
  );
});

test("another address than the owner's is told plainly, in every language", () => {
  assert.equal(
    signInCopyFor("fr", { spaceCreation: "closed" }).notOwner,
    "Ce portail appartient à quelqu’un d’autre.",
  );
  for (const language of LANGUAGES) {
    const words = signInCopyFor(language, { spaceCreation: "closed" });
    for (const key of ["notOwner", "notInitialized", "installLink"])
      assert.ok(words[key], `${language}: ${key}`);
  }
});

test("every language says every sentence of the private pages", () => {
  const keysOf = (table) => Object.keys(table).sort();
  for (const language of ["en", "ja"]) {
    assert.deepEqual(keysOf(authCopy[language]), keysOf(authCopy.fr));
    assert.deepEqual(
      keysOf(authCopy[language].failures),
      keysOf(authCopy.fr.failures),
    );
    for (const make of [signInCopyFor, spaceCopyFor])
      assert.deepEqual(
        keysOf(make(language, { spaceCreation: "closed" })),
        keysOf(make("fr", { spaceCreation: "closed" })),
      );
  }
  // Japanese puts the address first: « 〜にコードを送りました » has no
  // words before it.
  const emptyOnPurpose = new Set(["ja.codeSentTo"]);
  for (const language of LANGUAGES)
    for (const [surface, table] of Object.entries(closed(language)))
      for (const [key, value] of Object.entries(table))
        if (!emptyOnPurpose.has(`${language}.${key}`))
          for (const text of texts(value))
            assert.ok(text.trim(), `${surface} (${language}): ${key} is empty`);
});
