"use client";

import { useEffect } from "react";
import { reportClientLog } from "portal/client-log.js";

const errorMessage = (reason) => {
  if (reason instanceof Error) return reason.message;
  return typeof reason === "string" ? reason : "Unhandled client rejection";
};

export function ClientLogReporter() {
  useEffect(() => {
    const onError = (event) =>
      reportClientLog({
        level: "error",
        event: "client.runtime_error",
        message: event.message || "Uncaught client error",
        context: {
          file: String(event.filename || "").split("?")[0],
          line: event.lineno || null,
          column: event.colno || null,
        },
      });
    const onRejection = (event) =>
      reportClientLog({
        level: "error",
        event: "client.unhandled_rejection",
        message: errorMessage(event.reason),
      });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
