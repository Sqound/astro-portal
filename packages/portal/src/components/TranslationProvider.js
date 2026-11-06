"use client";

import { useEffect } from "react";
import { setTranslationOverrides, setProductName } from "portal/i18n.js";

// `productName` is optional so an existing caller that only cares about
// translation overrides keeps working unchanged — `setProductName` itself
// already falls back to the fixed default for anything not a non-empty
// string.
export function TranslationProvider({ overrides, productName, children }) {
  setTranslationOverrides(overrides);
  setProductName(productName);
  useEffect(() => {
    setTranslationOverrides(overrides);
    setProductName(productName);
  }, [overrides, productName]);
  return children;
}
