import { abellDesignation } from "./abell-catalogue.js";
import { lbnDesignation } from "./lbn-catalogue.js";
import { ldnDesignation } from "./ldn-catalogue.js";
import { sharplessDesignation } from "./sharpless-catalogue.js";

/** Writes an application-produced catalogue designation; never user-authored text. */
export function catalogueDesignation(value: unknown): string {
  const text = String(value ?? "");
  const compact = text.trim().match(/^(M|B)[\s\-_.]*0*(\d+)([a-z])?$/i);
  if (compact && (compact[1]!.toUpperCase() === "B" || !compact[3])) {
    return `${compact[1]!.toUpperCase()}${compact[2]}${compact[3]?.toLowerCase() || ""}`;
  }
  const spaced = text
    .trim()
    .match(/^(NGC|IC)[\s\-_.]*0*(\d+)([a-z])?(?:\s+(.+))?$/i);
  if (spaced) {
    return `${spaced[1]!.toUpperCase()} ${spaced[2]}${spaced[3]?.toUpperCase() || ""}${spaced[4] ? ` ${spaced[4].trim().replace(/\s+/g, " ")}` : ""}`;
  }
  // The four nebula catalogues: « Sh2-155 », « LDN 1622 », « LBN 437 », « Abell
  // 39 ».
  return (
    sharplessDesignation(text) ||
    ldnDesignation(text) ||
    lbnDesignation(text) ||
    abellDesignation(text) ||
    text
  );
}
