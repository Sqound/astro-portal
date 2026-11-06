/**
 * The words of the tabs « Captures » and « Galerie privée » that only a
 * service with a team that checks the galleries, or one that sells, has
 * something to say with: the team's lines and notices, the refused names, the
 * link to the publishing rules, the free space's count and the way to the
 * offers. The core's copy tables hold none of them: the composition of such a
 * service registers them here (`registerHostedCopy`), and a server without one
 * draws none of those lines.
 *
 * A provider is `(locale) => object`: its keys are laid over the table's words
 * (the table's own keys win nowhere: a key is in one place). `publishingRulesPath`
 * is the address, under a language, of the page where a team writes its rules.
 */
const providers = { captures: [], portal: [] };

/** Adds `provider` to the words of `table` (`"captures"` or `"portal"`), once. */
export function registerHostedCopy(table, provider) {
  if (!providers[table]) throw new Error(`Unknown copy table: ${table}`);
  if (typeof provider === "function" && !providers[table].includes(provider))
    providers[table].push(provider);
}

/** The words every provider of `table` gives for `locale`, merged. */
export function hostedCopy(table, locale) {
  return Object.assign({}, ...providers[table].map((give) => give(locale)));
}

/** Forgets every provider of every table: for the tests of the core. */
export function clearHostedCopy() {
  for (const table of Object.keys(providers)) providers[table].length = 0;
}
