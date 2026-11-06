/**
 * The internal request header that carries the language a page's address
 * names (`/fr/…` → `fr`) from the server that receives the request to the
 * root layout, which cannot read the address itself. The server sets it on
 * every request, or removes it when the address names no language.
 */
export const ADDRESS_LANGUAGE_HEADER = "x-astro-page-language";
