// Writes `locales/registry.json`, the JSON copy of the locale registry
// (`src/locales.ts`), for the readers that are not JavaScript modules. Run by
// `npm run build`, after `tsc`; the copy is committed, and
// `npm run build:packages` leaving a diff means it was not regenerated.
import { writeFile } from "node:fs/promises";
import { format } from "prettier";
import {
  SHIPPED_LOCALE_REGISTRY,
  validateLocaleRegistry,
} from "../dist/locales.js";

validateLocaleRegistry(SHIPPED_LOCALE_REGISTRY);
const document = {
  $comment:
    "Generated from the locale list of the contracts package; never edit by hand.",
  ...SHIPPED_LOCALE_REGISTRY,
};
await writeFile(
  new URL("../locales/registry.json", import.meta.url),
  await format(JSON.stringify(document), { parser: "json" }),
);
