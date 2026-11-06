import { defaultLocale } from "astro-contracts/locales";

/**
 * Content in several languages — a target's knowledge text, the offline
 * pack's catalogue index — read in the language asked for when it exists,
 * else in the default locale of the locale registry, **said** in the data:
 * never a blank, never a silent substitution.
 *
 * `localeChoice(available, requested)` is the rule, written once:
 *
 * - `requested` is one of `available`: `{ locale: requested, fallback: false }`;
 * - else the default locale (`en`) when it is available: `{ locale: "en", fallback: true }`;
 * - else the first of `available`, in its order: `{ locale, fallback: true }`;
 * - else nothing to show: `{ locale: null, fallback: false }`.
 */
export function localeChoice(available, requested, base = defaultLocale()) {
  const tags = (Array.isArray(available) ? available : []).filter(
    (tag) => typeof tag === "string" && tag.length > 0,
  );
  if (typeof requested === "string" && tags.includes(requested))
    return { locale: requested, fallback: false };
  if (tags.includes(base)) return { locale: base, fallback: true };
  if (tags.length > 0) return { locale: tags[0], fallback: true };
  return { locale: null, fallback: false };
}

function paragraphsOf(content) {
  return Array.isArray(content?.paragraphs)
    ? content.paragraphs
        .map((paragraph) => String(paragraph || "").trim())
        .filter(Boolean)
    : [];
}

/**
 * A target's curated knowledge text (`editorial.catalogueResearch`, written by
 * `targetResearchProfile` for the languages it has words for) in `locale`:
 * its paragraphs, the locale they are written in, and whether that is a
 * fallback (`locale` has no curated text). A language without text reads the
 * English one, flagged; a profile with no text at all gives no paragraph.
 */
export function knowledgeTextFor(research, locale) {
  const content =
    research?.content && typeof research.content === "object"
      ? research.content
      : {};
  const available = Object.keys(content).filter(
    (tag) => paragraphsOf(content[tag]).length > 0,
  );
  const choice = localeChoice(available, locale);
  return {
    paragraphs: choice.locale ? paragraphsOf(content[choice.locale]) : [],
    locale: choice.locale,
    fallback: choice.fallback,
  };
}
