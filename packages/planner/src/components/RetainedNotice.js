"use client";

/** Shared parts of a retained feature, compatible with a disabled fieldset. */
export function RetainedSentence({ children, ...props }) {
  return <p {...props}>{children}</p>;
}
