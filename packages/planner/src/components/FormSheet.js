"use client";

import { WebDialog } from "portal/components/dialog/WebDialog.js";

/** The form sheets share their responsive panel, body and dismissal policy. */
export function FormSheet({ className = "", ...props }) {
  return (
    <WebDialog
      {...props}
      className={`places-picker-panel${className ? ` ${className}` : ""}`}
      bodyClassName="places-picker-body"
      closeOnBackdrop
    />
  );
}
