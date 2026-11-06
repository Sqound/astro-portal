import assert from "node:assert/strict";
import test from "node:test";
import {
  LEGAL_LANGUAGE_PLACEHOLDER,
  emailCodeSignIn,
  isLegalAddressTemplate,
  legalAddressFor,
  legalPageLocale,
  parseSignInAnnouncement,
  serviceIdentity,
  shippedLocales,
} from "../dist/index.js";

// The terms and the privacy policy in the reader's language: one setting
// per link, either a plain address or a template holding `{lang}`.

const TERMS = "https://www.example.test/{lang}/terms/";
const PRIVACY = "https://www.example.test/{lang}/privacy/";

test("a template reads the page of the reader's language", () => {
  assert.equal(LEGAL_LANGUAGE_PLACEHOLDER, "{lang}");
  assert.equal(isLegalAddressTemplate(TERMS), true);
  assert.equal(isLegalAddressTemplate("https://www.example.test/terms"), false);
  const expected = {
    fr: "https://www.example.test/fr/terms/",
    ja: "https://www.example.test/ja/terms/",
    de: "https://www.example.test/de/terms/",
    "zh-Hans": "https://www.example.test/zh-Hans/terms/",
    // Device and browser spellings read the shipped locale.
    "fr-CA": "https://www.example.test/fr/terms/",
    zh_TW: "https://www.example.test/zh-Hant/terms/",
    "pt-PT": "https://www.example.test/pt-BR/terms/",
  };
  for (const [language, address] of Object.entries(expected))
    assert.equal(legalAddressFor(TERMS, language), address, language);
});

test("an unknown or missing language reads English", () => {
  for (const language of ["xx", "tlh-Piqd", "", null, undefined, 42]) {
    assert.equal(legalPageLocale(language), "en", String(language));
    assert.equal(
      legalAddressFor(TERMS, language),
      "https://www.example.test/en/terms/",
      String(language),
    );
  }
});

test("a plain address is the same page for everyone, as before", () => {
  const plain = "https://www.example.test/terms";
  for (const language of ["fr", "ja", "xx", null])
    assert.equal(legalAddressFor(plain, language), plain);
  assert.equal(legalAddressFor(" " + plain + " ", "fr"), plain);
  assert.equal(legalAddressFor("", "fr"), null);
  assert.equal(legalAddressFor(null, "fr"), null);
  assert.equal(legalAddressFor(undefined, "fr"), null);
});

test("every shipped locale resolves to itself", () => {
  for (const tag of shippedLocales())
    assert.equal(legalAddressFor("/{lang}/", tag), `/${tag}/`);
});

test("the announcement keeps `termsUrl` an address any client opens", () => {
  const signIn = emailCodeSignIn({ termsUrl: TERMS, privacyUrl: PRIVACY });
  assert.deepEqual(signIn, {
    method: "email-code",
    spaceCreation: "open",
    codeLength: 6,
    termsUrl: "https://www.example.test/en/terms/",
    privacyUrl: "https://www.example.test/en/privacy/",
    termsUrlTemplate: TERMS,
    privacyUrlTemplate: PRIVACY,
  });
  // A plain address announces no template: the body is what it always was.
  assert.deepEqual(
    emailCodeSignIn({ termsUrl: "https://www.example.test/terms" }),
    {
      method: "email-code",
      spaceCreation: "open",
      codeLength: 6,
      termsUrl: "https://www.example.test/terms",
    },
  );
  // Only the link configured as a template announces one.
  assert.deepEqual(
    Object.keys(
      emailCodeSignIn({
        termsUrl: TERMS,
        privacyUrl: "https://a.example.test/p",
      }),
    ).sort(),
    [
      "codeLength",
      "method",
      "privacyUrl",
      "spaceCreation",
      "termsUrl",
      "termsUrlTemplate",
    ],
  );
});

test("a client reads the template and resolves it for its own language", () => {
  const body = serviceIdentity(
    "1.0.1",
    emailCodeSignIn({ termsUrl: TERMS, privacyUrl: PRIVACY }),
  );
  const parsed = parseSignInAnnouncement(body);
  assert.equal(parsed.method, "email-code");
  assert.equal(parsed.termsUrlTemplate, TERMS);
  assert.equal(
    legalAddressFor(parsed.termsUrlTemplate, "ja"),
    "https://www.example.test/ja/terms/",
  );
  assert.equal(
    legalAddressFor(parsed.privacyUrlTemplate, "zh-Hans"),
    "https://www.example.test/zh-Hans/privacy/",
  );
  // An older announcement has none.
  const older = parseSignInAnnouncement({
    signIn: {
      method: "email-code",
      spaceCreation: "open",
      codeLength: 6,
      termsUrl: "https://t.example.test/",
    },
  });
  assert.equal(older.termsUrlTemplate, null);
  assert.equal(older.termsUrl, "https://t.example.test/");
  // A "template" without the placeholder, or not http(s), is dropped.
  const odd = parseSignInAnnouncement({
    signIn: {
      method: "email-code",
      codeLength: 6,
      termsUrlTemplate: "https://t.example.test/terms",
      privacyUrlTemplate: "javascript:{lang}",
    },
  });
  assert.equal(odd.termsUrlTemplate, null);
  assert.equal(odd.privacyUrlTemplate, null);
});
